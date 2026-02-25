'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';

/**
 * Elimina un movimiento financiero por su ID.
 *
 * - Si es EGRESO (pago): borra solo de Movimientos_Financieros.
 * - Si es INGRESO (cobro): borra de Movimientos_Financieros y busca +
 *   elimina el registro gemelo en Cobros_Clientes (vinculado por
 *   cliente_id + monto + fecha, que es cómo se insertaron juntos).
 *
 * Al terminar, revalida /cobros-pagos, /cuentas-corrientes y /cajas-bancos.
 */
export async function deleteMovimientoFinanciero(
  id: number
): Promise<{ error?: string }> {
  try {
    // 1. Leer el movimiento para saber tipo y datos de búsqueda
    const { data: mov, error: fetchErr } = await supabaseServer
      .from('Movimientos_Financieros')
      .select('id, tipo, monto, fecha, cliente_id')
      .eq('id', id)
      .single();

    if (fetchErr || !mov) {
      console.error('[deleteMovimiento] fetch error:', fetchErr);
      return { error: 'No se encontró el movimiento.' };
    }

    // 2. Si es INGRESO (cobro de cliente) → borrar el gemelo en Cobros_Clientes
    if (mov.tipo === 'INGRESO' && mov.cliente_id) {
      // Buscamos el registro más reciente que coincida en los tres campos
      // que se escribieron juntos en el insert atómico de FormCobrosPagos
      const { data: cobros, error: fetchCobroErr } = await supabaseServer
        .from('Cobros_Clientes')
        .select('id')
        .eq('cliente_id', mov.cliente_id)
        .eq('monto', mov.monto)
        .eq('fecha_cobro', mov.fecha)
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchCobroErr) {
        console.error('[deleteMovimiento] fetch Cobros_Clientes error:', fetchCobroErr);
      }

      if (cobros && cobros.length > 0) {
        const { error: delCobroErr } = await supabaseServer
          .from('Cobros_Clientes')
          .delete()
          .eq('id', cobros[0].id);

        if (delCobroErr) {
          // Log pero seguimos: al menos borramos el movimiento financiero
          console.error('[deleteMovimiento] delete Cobros_Clientes error:', delCobroErr);
        }
      }
    }

    // 3. Borrar de Movimientos_Financieros
    const { error: delErr } = await supabaseServer
      .from('Movimientos_Financieros')
      .delete()
      .eq('id', id);

    if (delErr) {
      console.error('[deleteMovimiento] delete Movimientos_Financieros error:', delErr);
      return { error: delErr.message };
    }

    // 4. Revalidar todas las rutas afectadas por este movimiento
    revalidatePath('/cobros-pagos');
    revalidatePath('/cuentas-corrientes');
    revalidatePath('/cajas-bancos');

    return {};
  } catch (err) {
    console.error('[deleteMovimiento] unexpected error:', err);
    return { error: 'Error inesperado al eliminar el movimiento.' };
  }
}

// ── Historial paginado de Movimientos_Financieros ────────────────────────────

interface MovimientoFinancieroRow {
  id: number;
  fecha: string | null;
  tipo: string | null;
  monto: number | null;
  descripcion: string | null;
  metodo_pago: string | null;
  cuenta_financiera_id: number | null;
}

export interface HistorialPaginadoResult {
  items: MovimientoFinancieroRow[];
  total: number;
}

export async function getHistorialMovimientos(
  page: number = 1,
  pageSize: number = 50
): Promise<HistorialPaginadoResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabaseServer
    .from('Movimientos_Financieros')
    .select(
      'id, fecha, tipo, monto, descripcion, metodo_pago, cuenta_financiera_id',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('[getHistorialMovimientos] error:', error);
    return { items: [], total: 0 };
  }

  return {
    items: (data ?? []) as MovimientoFinancieroRow[],
    total: count ?? 0,
  };
}

// ── Cheques de terceros (cartera) ────────────────────────────────────────────

export interface ChequeEnCarteraOption {
  id: number;
  banco: string | null;
  monto: number | null;
  fecha_pago: string | null;
  numero_cheque: string | null;
}

export async function getChequesEnCartera(): Promise<ChequeEnCarteraOption[]> {
  const { data, error } = await supabaseServer
    .from('Cheques_Terceros')
    .select('id, banco, monto, fecha_pago, numero_cheque')
    .eq('estado', 'EN_CARTERA')
    .order('fecha_pago', { ascending: true });

  if (error) {
    console.error('[getChequesEnCartera] error:', error);
    return [];
  }
  return (data ?? []) as ChequeEnCarteraOption[];
}

export async function registerCobroConCheque(params: {
  fecha: string;
  clienteId: number;
  cuentaId: number | null;
  monto: number;
  descripcion: string | null;
  referencia: string | null;
  numeroCheque: string;
  banco: string;
  emisor: string;
  fechaEmision: string;
  fechaPago: string;
}): Promise<{ error?: string }> {
  try {
    const { data: cheque, error: errCheque } = await supabaseServer
      .from('Cheques_Terceros')
      .insert({
        numero_cheque: params.numeroCheque,
        banco: params.banco,
        emisor: params.emisor,
        fecha_emision: params.fechaEmision,
        fecha_pago: params.fechaPago,
        monto: params.monto,
        estado: 'EN_CARTERA',
        cliente_id: params.clienteId,
      })
      .select('id')
      .single();

    if (errCheque || !cheque) {
      console.error('[registerCobroConCheque] insert cheque:', errCheque);
      return { error: errCheque?.message ?? 'Error al registrar el cheque.' };
    }

    const { error: errCobro } = await supabaseServer.from('Cobros_Clientes').insert({
      fecha_cobro: params.fecha,
      cliente_id: params.clienteId,
      monto: params.monto,
      metodo_pago: 'cheque',
      referencia: params.referencia ?? null,
      notas: params.descripcion ?? null,
    });
    if (errCobro) {
      console.error('[registerCobroConCheque] insert Cobros_Clientes:', errCobro);
      return { error: errCobro.message };
    }

    const { error: errMov } = await supabaseServer.from('Movimientos_Financieros').insert({
      fecha: params.fecha,
      tipo: 'INGRESO',
      monto: params.monto,
      descripcion: params.descripcion ?? `Cobro cheque — ${params.emisor}`,
      metodo_pago: 'cheque',
      referencia: params.referencia ?? null,
      cuenta_financiera_id: params.cuentaId,
      cliente_id: params.clienteId,
      cheque_id: cheque.id,
    });
    if (errMov) {
      console.error('[registerCobroConCheque] insert Movimientos_Financieros:', errMov);
      return { error: errMov.message };
    }

    revalidatePath('/cobros-pagos');
    revalidatePath('/cuentas-corrientes');
    revalidatePath('/cajas-bancos');
    revalidatePath('/cheques');
    return {};
  } catch (err) {
    console.error('[registerCobroConCheque] unexpected:', err);
    return { error: 'Error inesperado al registrar el cobro con cheque.' };
  }
}

export async function registerPagoConCheque(params: {
  fecha: string;
  tipoEntidad: 'proveedor' | 'fletero';
  proveedorId: number | null;
  fleteroId: number | null;
  cuentaId: number | null;
  monto: number;
  descripcion: string | null;
  referencia: string | null;
  chequeId: number;
}): Promise<{ error?: string }> {
  try {
    const { error: errMov } = await supabaseServer.from('Movimientos_Financieros').insert({
      fecha: params.fecha,
      tipo: 'EGRESO',
      monto: params.monto,
      descripcion: params.descripcion ?? 'Pago con cheque endosado',
      metodo_pago: 'cheque',
      referencia: params.referencia ?? null,
      cuenta_financiera_id: params.cuentaId,
      proveedor_id: params.proveedorId,
      fletero_id: params.fleteroId,
      cheque_id: params.chequeId,
    });
    if (errMov) {
      console.error('[registerPagoConCheque] insert Movimientos_Financieros:', errMov);
      return { error: errMov.message };
    }

    const { error: errUpdate } = await supabaseServer
      .from('Cheques_Terceros')
      .update({
        estado: 'ENDOSADO',
        proveedor_id: params.proveedorId,
        fletero_id: params.fleteroId,
      })
      .eq('id', params.chequeId);

    if (errUpdate) {
      console.error('[registerPagoConCheque] update Cheques_Terceros:', errUpdate);
      return { error: errUpdate.message };
    }

    revalidatePath('/cobros-pagos');
    revalidatePath('/cuentas-corrientes');
    revalidatePath('/cajas-bancos');
    revalidatePath('/cheques');
    return {};
  } catch (err) {
    console.error('[registerPagoConCheque] unexpected:', err);
    return { error: 'Error inesperado al registrar el pago con cheque.' };
  }
}

/**
 * Invalida caché de rutas que dependen de Movimientos_Financieros.
 * Llamar desde el cliente tras insertar movimientos sin usar las actions (p. ej. cobro/pago sin cheque).
 */
export async function revalidateRutasFinanzas() {
  revalidatePath('/cobros-pagos');
  revalidatePath('/cuentas-corrientes');
  revalidatePath('/cajas-bancos');
  revalidatePath('/historial');
}

