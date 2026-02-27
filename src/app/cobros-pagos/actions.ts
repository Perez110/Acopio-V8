'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { getSaldoActualCuenta } from '@/lib/get-saldo-cuenta';

/**
 * Elimina un movimiento financiero por su ID.
 *
 * - Si es EGRESO (pago): borra solo de Movimientos_Financieros. Los RPC
 *   get_saldos_proveedores/get_saldos_clientes recalculan al cargar Cuentas Corrientes;
 *   al quitar el pago, el saldo de la entidad sube y, si pasa a > 0, vuelve a Saldos Activos.
 * - Si es INGRESO (cobro): borra de Movimientos_Financieros y elimina el registro gemelo
 *   en Cobros_Clientes (vinculado por cliente_id + monto + fecha). Idem: el saldo del
 *   cliente se recalcula y puede volver a Saldos Activos.
 *
 * Revalida /cobros-pagos, /cuentas-corrientes (layout) y /cajas-bancos para que la
 * próxima visita a Cuentas Corrientes muestre saldos y pestañas Activos/Cerrados correctos.
 */
export async function deleteMovimientoFinanciero(
  id: number
): Promise<{ error?: string }> {
  try {
    // 1. Leer el movimiento para saber tipo y datos de búsqueda
    const { data: mov, error: fetchErr } = await supabaseServer
      .from('Movimientos_Financieros')
      .select('id, tipo, monto, fecha, cliente_id, proveedor_id')
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

    // 4. Revalidar rutas afectadas. Cuentas Corrientes usa RPC (saldos en vivo):
    //    al borrar este movimiento, el saldo de la entidad se recalcula en la próxima
    //    carga; si saldo > 0, la entidad vuelve a "Saldos Activos".
    revalidatePath('/cobros-pagos');
    revalidatePath('/cuentas-corrientes', 'layout');
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
  pageSize: number = 50,
  desde?: string | null,
  hasta?: string | null
): Promise<HistorialPaginadoResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseServer
    .from('Movimientos_Financieros')
    .select(
      'id, fecha, tipo, monto, descripcion, metodo_pago, cuenta_financiera_id',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);

  const { data, count, error } = await query.range(from, to);

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

function formatFondosInsuficientes(saldoActual: number): string {
  const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(saldoActual);
  return `Fondos insuficientes. El saldo actual de la cuenta es de ${fmt}.`;
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
    if (params.cuentaId != null) {
      const { saldo, error: errSaldo } = await getSaldoActualCuenta(params.cuentaId);
      if (errSaldo) return { error: errSaldo };
      if (params.monto > saldo) return { error: formatFondosInsuficientes(saldo) };
    }
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
 * Registra un pago (egreso) sin cheque. Valida fondos insuficientes antes de insertar.
 */
export async function registerPagoEgreso(params: {
  fecha: string;
  monto: number;
  descripcion: string | null;
  metodo_pago: string;
  referencia: string | null;
  cuenta_financiera_id: number | null;
  proveedor_id: number | null;
  fletero_id: number | null;
}): Promise<{ error?: string }> {
  try {
    if (params.cuenta_financiera_id != null) {
      const { saldo, error: errSaldo } = await getSaldoActualCuenta(params.cuenta_financiera_id);
      if (errSaldo) return { error: errSaldo };
      if (params.monto > saldo) return { error: formatFondosInsuficientes(saldo) };
    }
    const { error: errMov } = await supabaseServer.from('Movimientos_Financieros').insert({
      fecha: params.fecha,
      tipo: 'EGRESO',
      monto: params.monto,
      descripcion: params.descripcion ?? 'Pago',
      metodo_pago: params.metodo_pago,
      referencia: params.referencia ?? null,
      cuenta_financiera_id: params.cuenta_financiera_id,
      proveedor_id: params.proveedor_id,
      fletero_id: params.fletero_id,
    });
    if (errMov) {
      console.error('[registerPagoEgreso] insert:', errMov);
      return { error: errMov.message };
    }
    revalidatePath('/cobros-pagos');
    revalidatePath('/cuentas-corrientes');
    revalidatePath('/cajas-bancos');
    return {};
  } catch (err) {
    console.error('[registerPagoEgreso] unexpected:', err);
    return { error: 'Error inesperado al registrar el pago.' };
  }
}

/**
 * Obtiene el saldo actual de una entidad (cliente, proveedor o fletero).
 * Misma lógica que alimenta Cuentas Corrientes.
 * - Cliente: total_facturado − total_cobrado (> 0 = nos debe).
 * - Proveedor: total_comprado − total_pagado (> 0 = les debemos).
 * - Fletero: valor generado (viajes + vacíos) − pagos (> 0 = les debemos).
 */
export async function getSaldoEntidad(
  id: number,
  tipo: 'cliente' | 'proveedor' | 'fletero',
): Promise<{ saldo: number; error?: string }> {
  try {
    if (tipo === 'cliente') {
      const { data: rows, error } = await supabaseServer.rpc('get_saldos_clientes');
      if (error) {
        console.error('[getSaldoEntidad] get_saldos_clientes:', error);
        return { saldo: 0, error: 'Error al obtener saldo del cliente.' };
      }
      const fila = (rows ?? []).find((r: { cliente_id: number }) => r.cliente_id === id);
      if (!fila) return { saldo: 0 };
      const totalFacturado = Number((fila as { total_facturado?: number }).total_facturado ?? 0);
      const totalCobrado = Number((fila as { total_cobrado?: number }).total_cobrado ?? 0);
      const saldo = parseFloat((totalFacturado - totalCobrado).toFixed(2));
      return { saldo };
    }

    if (tipo === 'proveedor') {
      const { data: rows, error } = await supabaseServer.rpc('get_saldos_proveedores');
      if (error) {
        console.error('[getSaldoEntidad] get_saldos_proveedores:', error);
        return { saldo: 0, error: 'Error al obtener saldo del proveedor.' };
      }
      const fila = (rows ?? []).find((r: { proveedor_id: number }) => r.proveedor_id === id);
      if (!fila) return { saldo: 0 };
      const totalComprado = Number((fila as { total_comprado?: number }).total_comprado ?? 0);
      const totalPagado = Number((fila as { total_pagado?: number }).total_pagado ?? 0);
      const saldo = parseFloat((totalComprado - totalPagado).toFixed(2));
      return { saldo };
    }

    // Fletero: valor generado (viajes + vacíos) − pagos
    const { data: fletero, error: errF } = await supabaseServer
      .from('Fleteros')
      .select('precio_por_kg, precio_viaje_vacios')
      .eq('id', id)
      .single();
    if (errF || !fletero) return { saldo: 0 };
    const precioPorKg = Number(fletero.precio_por_kg ?? 0);
    const tarifaVacios = Number(fletero.precio_viaje_vacios ?? 0);

    const { data: viajes } = await supabaseServer
      .from('Salidas_Fruta')
      .select('peso_llegada_cliente_kg, peso_salida_acopio_kg, estado_conciliacion')
      .eq('fletero_id', id);
    let valorViajes = 0;
    for (const v of (viajes ?? []) as { peso_llegada_cliente_kg?: number; peso_salida_acopio_kg?: number; estado_conciliacion?: string }[]) {
      const llegada = Number(v.peso_llegada_cliente_kg ?? 0);
      const salida = Number(v.peso_salida_acopio_kg ?? 0);
      const kg = (v.estado_conciliacion === 'CONCILIADO' && llegada > 0) ? llegada : salida;
      valorViajes += kg * precioPorKg;
    }

    const { count: countVacios } = await supabaseServer
      .from('Movimientos_Envases')
      .select('id', { count: 'exact', head: true })
      .eq('fletero_id', id);
    const valorVacios = (countVacios ?? 0) * tarifaVacios;

    const { data: pagos } = await supabaseServer
      .from('Movimientos_Financieros')
      .select('monto')
      .eq('fletero_id', id)
      .eq('tipo', 'EGRESO');
    const totalPagado = (pagos ?? []).reduce((s: number, r: { monto?: number }) => s + Number(r.monto ?? 0), 0);

    const saldo = parseFloat((valorViajes + valorVacios - totalPagado).toFixed(2));
    return { saldo };
  } catch (e) {
    console.error('[getSaldoEntidad]', e);
    return { saldo: 0, error: 'Error al calcular el saldo.' };
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

