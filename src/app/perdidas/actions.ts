'use server';

import { supabaseServer } from '@/lib/supabase-server';
import type { FilaPerdida } from '@/components/perdidas/PerdidasClient';

const ITEMS_PER_PAGE = 50;

interface VistaPerdidasRow {
  salida_id: number;
  kilos_merma: number | null;
  descuento_calidad_kg?: number | null;
  kilos_totales_perdidos: number | null;
  dinero_perdido: number | null;
}

export type PerdidasTablaResult = {
  filas: FilaPerdida[];
  total: number;
};

export type PerdidasKPIsResult = {
  kilosTotalesPerdidos: number;
  perdidaMonetizada: number;
  sumaMerma: number;
  sumaDescuentoCalidad: number;
};

/** Tabla paginada: solo la página actual con .range() y total con count: 'exact'. */
export async function getPerdidasFiltradas(
  desde?: string,
  hasta?: string,
  clienteId?: number | null,
  page: number = 1,
  pageSize: number = ITEMS_PER_PAGE
): Promise<PerdidasTablaResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseServer
    .from('Salidas_Fruta')
    .select('id, fecha_salida, cliente_id, producto_id, peso_salida_acopio_kg', { count: 'exact' });

  if (desde) query = query.gte('fecha_salida', desde);
  if (hasta) query = query.lte('fecha_salida', hasta);
  if (clienteId != null && clienteId !== 0) query = query.eq('cliente_id', clienteId);

  const { data: salidas, count, error: errSalidas } = await query
    .order('fecha_salida', { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  if (errSalidas || !salidas?.length) {
    return { filas: [], total };
  }

  const salidaIds = salidas.map(s => s.id);
  const salidaMap = new Map(salidas.map(s => [s.id, s]));

  const [
    { data: filasVista },
    { data: clientes },
    { data: productos },
  ] = await Promise.all([
    supabaseServer
      .from('vista_perdidas_fruta' as string)
      .select('salida_id, kilos_merma, descuento_calidad_kg, kilos_totales_perdidos, dinero_perdido')
      .in('salida_id', salidaIds),
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Productos').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  const clienteMap = new Map((clientes ?? []).map(c => [c.id, c.nombre ?? `Cliente #${c.id}`]));
  const productoMap = new Map((productos ?? []).map(p => [p.id, p.nombre ?? `Producto #${p.id}`]));

  const filas: FilaPerdida[] = [];
  for (const v of (filasVista ?? []) as VistaPerdidasRow[]) {
    const salida = salidaMap.get(v.salida_id);
    if (!salida) continue;

    filas.push({
      salidaId: v.salida_id,
      fecha: salida.fecha_salida ?? '',
      clienteId: salida.cliente_id ?? 0,
      clienteNombre: clienteMap.get(salida.cliente_id ?? 0) ?? '—',
      productoId: salida.producto_id ?? 0,
      productoNombre: productoMap.get(salida.producto_id ?? 0) ?? '—',
      kilosSalida: Number(salida.peso_salida_acopio_kg ?? 0),
      kilosMerma: Number(v.kilos_merma ?? 0),
      descuentoCalidadKg: Number(v.descuento_calidad_kg ?? 0),
      totalPerdidoKg: Number(v.kilos_totales_perdidos ?? 0),
      valorMonetizado: Number(v.dinero_perdido ?? 0),
    });
  }

  filas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '', 'es'));
  return { filas, total };
}

/** KPIs globales: una consulta que devuelve solo columnas numéricas de todos los registros que coinciden con filtros (vía RPC o fallback). */
export async function getPerdidasKPIs(
  desde?: string,
  hasta?: string,
  clienteId?: number | null
): Promise<PerdidasKPIsResult> {
  const { data, error } = await supabaseServer.rpc('get_perdidas_kpis', {
    p_desde: desde || null,
    p_hasta: hasta || null,
    p_cliente_id: clienteId ?? null,
  });

  if (!error && data?.[0]) {
    const r = data[0] as {
      kilos_totales_perdidos?: number | null;
      dinero_perdido?: number | null;
      kilos_merma?: number | null;
      descuento_calidad_kg?: number | null;
    };
    return {
      kilosTotalesPerdidos: Number(r.kilos_totales_perdidos ?? 0),
      perdidaMonetizada: Number(r.dinero_perdido ?? 0),
      sumaMerma: Number(r.kilos_merma ?? 0),
      sumaDescuentoCalidad: Number(r.descuento_calidad_kg ?? 0),
    };
  }

  // Fallback sin RPC: traer solo columnas numéricas en chunks y sumar en servidor
  let query = supabaseServer.from('Salidas_Fruta').select('id');
  if (desde) query = query.gte('fecha_salida', desde);
  if (hasta) query = query.lte('fecha_salida', hasta);
  if (clienteId != null && clienteId !== 0) query = query.eq('cliente_id', clienteId);

  const ids: number[] = [];
  const chunk = 1000;
  let offset = 0;
  while (true) {
    const { data: page } = await query.order('fecha_salida', { ascending: false }).range(offset, offset + chunk - 1);
    if (!page?.length) break;
    ids.push(...page.map(r => r.id));
    if (page.length < chunk) break;
    offset += chunk;
  }

  if (ids.length === 0) {
    return { kilosTotalesPerdidos: 0, perdidaMonetizada: 0, sumaMerma: 0, sumaDescuentoCalidad: 0 };
  }

  const kpiRows: { kilos_merma: number; descuento_calidad_kg: number; kilos_totales_perdidos: number; dinero_perdido: number }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { data: rows } = await supabaseServer
      .from('vista_perdidas_fruta' as string)
      .select('kilos_merma, descuento_calidad_kg, kilos_totales_perdidos, dinero_perdido')
      .in('salida_id', slice);
    type Row = { kilos_merma?: number | null; descuento_calidad_kg?: number | null; kilos_totales_perdidos?: number | null; dinero_perdido?: number | null };
    for (const r of rows ?? []) {
      const row = r as Row;
      kpiRows.push({
        kilos_merma: Number(row.kilos_merma ?? 0),
        descuento_calidad_kg: Number(row.descuento_calidad_kg ?? 0),
        kilos_totales_perdidos: Number(row.kilos_totales_perdidos ?? 0),
        dinero_perdido: Number(row.dinero_perdido ?? 0),
      });
    }
  }

  return {
    kilosTotalesPerdidos: kpiRows.reduce((s, r) => s + r.kilos_totales_perdidos, 0),
    perdidaMonetizada: kpiRows.reduce((s, r) => s + r.dinero_perdido, 0),
    sumaMerma: kpiRows.reduce((s, r) => s + r.kilos_merma, 0),
    sumaDescuentoCalidad: kpiRows.reduce((s, r) => s + r.descuento_calidad_kg, 0),
  };
}
