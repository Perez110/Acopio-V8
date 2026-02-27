'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import type { EstadoChequeTercero } from '@/types/database';

const ITEMS_PER_PAGE = 25;

export interface ChequeRow {
  id: number;
  numero_cheque: string | null;
  banco: string | null;
  emisor: string | null;
  fecha_emision: string | null;
  fecha_pago: string | null;
  monto: number | null;
  estado: string | null;
  created_at: string | null;
}

export interface ChequesKPIsResult {
  totalEnCartera: number;
  proximosAVencer: number;
}

/** KPIs: Total en cartera (suma montos EN_CARTERA) y cantidad que vencen en 7 días. */
export async function getChequesKPIs(): Promise<ChequesKPIsResult> {
  const hoy = new Date();
  const enSiete = new Date(hoy);
  enSiete.setDate(enSiete.getDate() + 7);
  const hoyStr = hoy.toISOString().split('T')[0];
  const enSieteStr = enSiete.toISOString().split('T')[0];

  const { data: enCartera, error } = await supabaseServer
    .from('Cheques_Terceros')
    .select('monto, fecha_pago')
    .eq('estado', 'EN_CARTERA');

  if (error) {
    console.error('[getChequesKPIs] error:', error);
    return { totalEnCartera: 0, proximosAVencer: 0 };
  }

  let totalEnCartera = 0;
  let proximosAVencer = 0;
  for (const row of enCartera ?? []) {
    const m = Number(row.monto ?? 0);
    totalEnCartera += m;
    const fp = row.fecha_pago ?? '';
    if (fp >= hoyStr && fp <= enSieteStr) proximosAVencer += 1;
  }
  return { totalEnCartera, proximosAVencer };
}

export interface ChequesPaginadoResult {
  items: ChequeRow[];
  total: number;
}

/** Lista paginada con filtro opcional por estado. */
export async function getChequesPaginado(
  estado: EstadoChequeTercero | '' | undefined,
  page: number = 1,
  pageSize: number = ITEMS_PER_PAGE
): Promise<ChequesPaginadoResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseServer
    .from('Cheques_Terceros')
    .select('id, numero_cheque, banco, emisor, fecha_emision, fecha_pago, monto, estado, created_at', {
      count: 'exact',
    })
    .order('fecha_pago', { ascending: true, nullsFirst: false })
    .order('id', { ascending: false });

  // Aplicar filtro solo cuando se eligió un estado concreto (no '' ni undefined)
  if (estado !== undefined && estado !== '') {
    query = query.eq('estado', estado);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error('[getChequesPaginado] error:', error);
    return { items: [], total: 0 };
  }

  return {
    items: (data ?? []) as ChequeRow[],
    total: count ?? 0,
  };
}

/** Actualiza el estado de un cheque (ej. ENDOSADO, RECHAZADO). No usar para DEPOSITADO/COBRADO; usar depositarCheque/cobrarCheque. */
export async function updateEstadoCheque(
  id: number,
  nuevoEstado: EstadoChequeTercero
): Promise<{ error?: string }> {
  const estadosValidos: EstadoChequeTercero[] = [
    'EN_CARTERA',
    'ENDOSADO',
    'DEPOSITADO',
    'COBRADO',
    'RECHAZADO',
  ];
  if (!estadosValidos.includes(nuevoEstado)) {
    return { error: 'Estado no válido.' };
  }
  if (nuevoEstado === 'DEPOSITADO' || nuevoEstado === 'COBRADO') {
    return { error: 'Usá Depósito o Cobro desde las acciones correspondientes.' };
  }

  const { error } = await supabaseServer
    .from('Cheques_Terceros')
    .update({ estado: nuevoEstado })
    .eq('id', id);

  if (error) {
    console.error('[updateEstadoCheque] error:', error);
    return { error: error.message };
  }

  revalidatePath('/cheques');
  revalidatePath('/cobros-pagos');
  return {};
}

/**
 * Marca el cheque como Depositado y guarda la cuenta de depósito (clearing).
 * NO crea Movimientos_Financieros; el saldo real no se toca hasta cobrarCheque.
 */
export async function depositarCheque(
  chequeId: number,
  cuentaId: number,
): Promise<{ error?: string }> {
  const { data: cheque, error: errCheque } = await supabaseServer
    .from('Cheques_Terceros')
    .select('id, estado')
    .eq('id', chequeId)
    .single();

  if (errCheque || !cheque) {
    return { error: errCheque?.message ?? 'No se encontró el cheque.' };
  }
  if ((cheque.estado as string) !== 'EN_CARTERA') {
    return { error: 'Solo se puede depositar un cheque en estado En cartera.' };
  }

  const { error } = await supabaseServer
    .from('Cheques_Terceros')
    .update({ estado: 'DEPOSITADO', cuenta_deposito_id: cuentaId })
    .eq('id', chequeId);

  if (error) {
    console.error('[depositarCheque] error:', error);
    return { error: error.message };
  }

  revalidatePath('/cheques');
  revalidatePath('/cobros-pagos');
  revalidatePath('/cajas-bancos');
  return {};
}

/**
 * Marca el cheque como Cobrado e inserta el ingreso en Movimientos_Financieros
 * (acreditación en la cuenta de depósito). Solo aplicable si estado === DEPOSITADO.
 */
export async function cobrarCheque(chequeId: number): Promise<{ error?: string }> {
  const { data: cheque, error: errCheque } = await supabaseServer
    .from('Cheques_Terceros')
    .select('id, estado, cuenta_deposito_id, monto, numero_cheque')
    .eq('id', chequeId)
    .single();

  if (errCheque || !cheque) {
    return { error: errCheque?.message ?? 'No se encontró el cheque.' };
  }
  if ((cheque.estado as string) !== 'DEPOSITADO') {
    return { error: 'Solo se puede cobrar un cheque en estado Depositado.' };
  }

  const { error: errUpdate } = await supabaseServer
    .from('Cheques_Terceros')
    .update({ estado: 'COBRADO' })
    .eq('id', chequeId);

  if (errUpdate) {
    console.error('[cobrarCheque] update estado:', errUpdate);
    return { error: errUpdate.message };
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const numero = (cheque.numero_cheque ?? '').trim() || String(chequeId);
  const descripcion = `Acreditación de Cheque Nro ${numero}`;
  const monto = Number(cheque.monto ?? 0);
  const cuentaFinancieraId = cheque.cuenta_deposito_id ?? null;

  const { error: errMov } = await supabaseServer
    .from('Movimientos_Financieros')
    .insert({
      fecha,
      tipo: 'INGRESO',
      monto,
      descripcion,
      metodo_pago: 'cheque',
      referencia: null,
      cuenta_financiera_id: cuentaFinancieraId,
      cliente_id: null,
      proveedor_id: null,
      fletero_id: null,
      cheque_id: chequeId,
    });

  if (errMov) {
    console.error('[cobrarCheque] insert Movimientos_Financieros:', errMov);
    return { error: errMov.message };
  }

  revalidatePath('/cheques');
  revalidatePath('/cobros-pagos');
  revalidatePath('/cajas-bancos');
  revalidatePath('/cuentas-corrientes');
  revalidatePath('/historial');
  return {};
}

/** Cuentas activas para selector de depósito (clearing). */
export async function getCuentasActivas(): Promise<{ id: number; nombre: string | null }[]> {
  const { data, error } = await supabaseServer
    .from('Cuentas_Financieras')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre');
  if (error) {
    console.error('[getCuentasActivas] error:', error);
    return [];
  }
  return (data ?? []) as { id: number; nombre: string | null }[];
}

/**
 * Elimina un cheque en estado EN_CARTERA y sus registros vinculados.
 * Orden: 1) Buscar movimiento con cheque_id. 2) Si es INGRESO (cobro), borrar Cobros_Clientes.
 * 3) Borrar Movimientos_Financieros. 4) Borrar Cheques_Terceros.
 * Solo permitido si estado === 'EN_CARTERA'.
 */
export async function deleteChequeEnCartera(chequeId: number): Promise<{ error?: string }> {
  try {
    const { data: cheque, error: errCheque } = await supabaseServer
      .from('Cheques_Terceros')
      .select('id, estado')
      .eq('id', chequeId)
      .single();

    if (errCheque || !cheque) {
      return { error: errCheque?.message ?? 'No se encontró el cheque.' };
    }
    if ((cheque.estado as string) !== 'EN_CARTERA') {
      return { error: 'Solo se puede eliminar un cheque en estado En cartera.' };
    }

    const { data: movs, error: errMov } = await supabaseServer
      .from('Movimientos_Financieros')
      .select('id, tipo, cliente_id, monto, fecha')
      .eq('cheque_id', chequeId);

    if (errMov) {
      console.error('[deleteChequeEnCartera] fetch Movimientos_Financieros:', errMov);
      return { error: errMov.message };
    }

    if (movs && movs.length > 0) {
      const mov = movs[0];
      if (mov.tipo === 'INGRESO' && mov.cliente_id != null) {
        const { data: cobros, error: errCobro } = await supabaseServer
          .from('Cobros_Clientes')
          .select('id')
          .eq('cliente_id', mov.cliente_id)
          .eq('monto', mov.monto ?? 0)
          .eq('fecha_cobro', mov.fecha ?? '')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!errCobro && cobros && cobros.length > 0) {
          const { error: delCobro } = await supabaseServer
            .from('Cobros_Clientes')
            .delete()
            .eq('id', cobros[0].id);
          if (delCobro) {
            console.error('[deleteChequeEnCartera] delete Cobros_Clientes:', delCobro);
            return { error: delCobro.message };
          }
        }
      }

      const { error: delMov } = await supabaseServer
        .from('Movimientos_Financieros')
        .delete()
        .eq('cheque_id', chequeId);
      if (delMov) {
        console.error('[deleteChequeEnCartera] delete Movimientos_Financieros:', delMov);
        return { error: delMov.message };
      }
    }

    const { error: delCh } = await supabaseServer
      .from('Cheques_Terceros')
      .delete()
      .eq('id', chequeId);
    if (delCh) {
      console.error('[deleteChequeEnCartera] delete Cheques_Terceros:', delCh);
      return { error: delCh.message };
    }

    revalidatePath('/cheques');
    revalidatePath('/cobros-pagos');
    revalidatePath('/historial');
    revalidatePath('/');
    return {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar el cheque.';
    console.error('[deleteChequeEnCartera] unexpected:', err);
    return { error: msg };
  }
}
