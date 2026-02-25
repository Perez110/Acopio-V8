'use server';

import { supabaseServer } from '@/lib/supabase-server';

// ── Tipos exportados ──────────────────────────────────────────────────────────
// Estos tipos son los que consume InformesClient.tsx — NO cambiar nombres.
export interface RowProveedor {
  proveedorId: number;
  proveedorNombre: string;
  /** Deuda acumulada ANTES del período. Positivo = les debemos. */
  saldoAnterior: number;
  kilosDelPeriodo: number;
  /** Valor total de la fruta comprada EN el período. */
  valorGenerado: number;
  /** Pagos realizados EN el período. */
  dineroMovido: number;
  /** saldoAnterior + valorGenerado − dineroMovido */
  saldoFinal: number;
}

export interface RowCliente {
  clienteId: number;
  clienteNombre: string;
  /** Deuda del cliente acumulada ANTES del período. Positivo = nos deben. */
  saldoAnterior: number;
  kilosDelPeriodo: number;
  /** Monto de ventas conciliadas EN el período. */
  valorGenerado: number;
  /** Cobros recibidos EN el período. */
  dineroMovido: number;
  /** saldoAnterior + valorGenerado − dineroMovido */
  saldoFinal: number;
}

// ── Tipos internos que devuelven los RPCs ─────────────────────────────────────
interface RpcInformeProv {
  proveedor_id: number;
  saldo_anterior: number;
  kilos_periodo: number;
  valor_generado: number;
  dinero_movido: number;
  saldo_final: number;
}

interface RpcInformeCli {
  cliente_id: number;
  saldo_anterior: number;
  kilos_periodo: number;
  valor_generado: number;
  dinero_movido: number;
  saldo_final: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// PROVEEDORES
// Antes: traía hasta 10.000 filas de Entradas_Fruta y Movimientos_Financieros
//        a Node.js para agregar en JavaScript.
// Ahora: el RPC hace todo el GROUP BY + CASE en Postgres y devuelve
//        1 fila por proveedor con los 5 totales ya calculados.
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchInformeProveedores(
  startDate: string,
  endDate: string,
): Promise<RowProveedor[]> {
  // Fetch paralelo: nombres (tabla pequeña) + totales por RPC
  const [{ data: proveedores }, { data: rpcRows, error }] = await Promise.all([
    supabaseServer
      .from('Proveedores')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
    supabaseServer.rpc('get_informe_proveedores', {
      start_date: startDate,
      end_date:   endDate,
    }),
  ]);

  if (error) {
    console.error('[fetchInformeProveedores] RPC error:', error);
    return [];
  }

  // Lookup map para nombres O(1)
  const nombresMap = new Map((proveedores ?? []).map(p => [p.id, p.nombre]));

  return ((rpcRows ?? []) as RpcInformeProv[]).map(r => ({
    proveedorId:     r.proveedor_id,
    proveedorNombre: nombresMap.get(r.proveedor_id) ?? `Proveedor #${r.proveedor_id}`,
    saldoAnterior:   Number(r.saldo_anterior ?? 0),
    kilosDelPeriodo: Number(r.kilos_periodo  ?? 0),
    valorGenerado:   Number(r.valor_generado ?? 0),
    dineroMovido:    Number(r.dinero_movido  ?? 0),
    saldoFinal:      Number(r.saldo_final    ?? 0),
  }));
  // El RPC ya devuelve ORDER BY saldo_final DESC
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTES
// Misma optimización: reemplaza limit(10000) + agregación manual en Node.js
// por un RPC que hace TODO en Postgres y devuelve 1 fila por cliente.
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchInformeClientes(
  startDate: string,
  endDate: string,
): Promise<RowCliente[]> {
  const [{ data: clientes }, { data: rpcRows, error }] = await Promise.all([
    supabaseServer
      .from('Clientes')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
    supabaseServer.rpc('get_informe_clientes', {
      start_date: startDate,
      end_date:   endDate,
    }),
  ]);

  if (error) {
    console.error('[fetchInformeClientes] RPC error:', error);
    return [];
  }

  const nombresMap = new Map((clientes ?? []).map(c => [c.id, c.nombre]));

  return ((rpcRows ?? []) as RpcInformeCli[]).map(r => ({
    clienteId:       r.cliente_id,
    clienteNombre:   nombresMap.get(r.cliente_id) ?? `Cliente #${r.cliente_id}`,
    saldoAnterior:   Number(r.saldo_anterior ?? 0),
    kilosDelPeriodo: Number(r.kilos_periodo  ?? 0),
    valorGenerado:   Number(r.valor_generado ?? 0),
    dineroMovido:    Number(r.dinero_movido  ?? 0),
    saldoFinal:      Number(r.saldo_final    ?? 0),
  }));
}

// ══════════════════════════════════════════════════════════════════════════════
// MOVIMIENTOS INTERNOS (transferencias entre cajas/bancos)
// Rango máximo 6 meses (180 días) para evitar 429 y sobrecarga en cliente.
// ══════════════════════════════════════════════════════════════════════════════
const MAX_DIAS_RANGO = 180;

export interface RowMovimientoInterno {
  fecha: string;
  cuentaOrigen: string;
  cuentaDestino: string;
  descripcion: string;
  monto: number;
}

export type ResultMovimientosInternos =
  | { data: RowMovimientoInterno[]; error: null }
  | { data: null; error: string };

export async function getInformeMovimientosInternos(
  desde: string,
  hasta: string,
): Promise<ResultMovimientosInternos> {
  const desdeDate = new Date(desde);
  const hastaDate = new Date(hasta);
  if (Number.isNaN(desdeDate.getTime()) || Number.isNaN(hastaDate.getTime())) {
    return { data: null, error: 'Fechas inválidas.' };
  }
  const diffMs = hastaDate.getTime() - desdeDate.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDias > MAX_DIAS_RANGO) {
    return {
      data: null,
      error: 'Por rendimiento, el rango máximo para exportar en PDF es de 6 meses.',
    };
  }
  if (desde > hasta) {
    return { data: null, error: 'La fecha Desde no puede ser mayor que Hasta.' };
  }

  // Rango en hora local Argentina (UTC-3) para filtrar por día
  const desdeTs = `${desde}T00:00:00-03:00`;
  const hastaTs = `${hasta}T23:59:59.999-03:00`;

  const { data: movimientos, error: errMov } = await supabaseServer
    .from('Movimientos_Internos')
    .select('id, created_at, cuenta_origen_id, cuenta_destino_id, monto, descripcion')
    .gte('created_at', desdeTs)
    .lte('created_at', hastaTs)
    .order('created_at', { ascending: true });

  if (errMov) {
    console.error('[getInformeMovimientosInternos]', errMov);
    return { data: null, error: errMov.message };
  }

  const rows = movimientos ?? [];
  const cuentaIds = new Set<number>();
  for (const m of rows) {
    if (m.cuenta_origen_id != null) cuentaIds.add(m.cuenta_origen_id);
    if (m.cuenta_destino_id != null) cuentaIds.add(m.cuenta_destino_id);
  }

  let nombresCuentas = new Map<number, string>();
  if (cuentaIds.size > 0) {
    const { data: cuentas } = await supabaseServer
      .from('Cuentas_Financieras')
      .select('id, nombre')
      .in('id', Array.from(cuentaIds));
    nombresCuentas = new Map((cuentas ?? []).map(c => [c.id, c.nombre ?? `Cuenta #${c.id}`]));
  }

  const result: RowMovimientoInterno[] = rows.map(m => {
    const fecha = (m.created_at ?? '').slice(0, 10);
    return {
      fecha,
      cuentaOrigen:  m.cuenta_origen_id  != null ? nombresCuentas.get(m.cuenta_origen_id)  ?? `#${m.cuenta_origen_id}`  : '—',
      cuentaDestino: m.cuenta_destino_id != null ? nombresCuentas.get(m.cuenta_destino_id) ?? `#${m.cuenta_destino_id}` : '—',
      descripcion:   (m.descripcion ?? '').trim() || '—',
      monto:         Number(m.monto ?? 0),
    };
  });

  return { data: result, error: null };
}
