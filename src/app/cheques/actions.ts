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

  if (estado && estado !== '') {
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

/** Actualiza el estado de un cheque (ej. EN_CARTERA → DEPOSITADO, RECHAZADO). */
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
