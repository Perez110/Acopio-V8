'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';

// ── Tipos compartidos ─────────────────────────────────────────────────────────
export type TipoAjuste = 'AJUSTE_VACIO' | 'AJUSTE_OCUPADO';

// ── ajustarStockEnvase ────────────────────────────────────────────────────────
/**
 * Registra un ajuste manual de stock en Movimientos_Envases.
 * La cantidad insertada es la DIFERENCIA (nuevoStock − stockActual),
 * que puede ser positiva (aumento) o negativa (reducción).
 * El cálculo de stock en page.tsx suma este delta, resultando en nuevoStock.
 */
export async function ajustarStockEnvase(params: {
  envaseId: number;
  tipoAjuste: TipoAjuste;
  stockActual: number;
  nuevoStock: number;
  motivo: string;
  notas?: string;
}): Promise<{ success?: boolean; error?: string }> {
  const { envaseId, tipoAjuste, stockActual, nuevoStock, motivo, notas } = params;

  if (!motivo.trim()) return { success: false, error: 'El motivo es requerido.' };

  const diff = nuevoStock - stockActual;

  // Guardián: si es ajuste de vacíos y reducimos stock, validar que no quede negativo
  if (tipoAjuste === 'AJUSTE_VACIO' && diff < 0) {
    const { data: stockRows } = await supabaseServer
      .from('stock_vacios_por_envase' as string)
      .select('vacios')
      .eq('envase_id', envaseId)
      .limit(1)
      .maybeSingle();

    const vacios = (stockRows as { vacios?: number } | null)?.vacios ?? 0;
    const despues = vacios + diff;
    if (despues < 0) {
      return {
        success: false,
        error: `Stock físico insuficiente. Solo disponés de ${vacios} envases en el acopio.`,
      };
    }
  }

  // Serializar motivo y notas en el campo `notas` de forma legible
  const notasStr = notas?.trim()
    ? `Motivo: ${motivo.trim()} | ${notas.trim()}`
    : `Motivo: ${motivo.trim()}`;

  const { error } = await supabaseServer.from('Movimientos_Envases').insert({
    fecha_movimiento: new Date().toISOString().split('T')[0],
    tipo_movimiento: tipoAjuste,
    envase_id: envaseId,
    cantidad: diff,
    notas: notasStr,
  });

  if (error) {
    console.error('[ajustarStockEnvase] Supabase error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/inventario');
  return { success: true };
}

// ── Tipos para insertar movimientos ───────────────────────────────────────────
export interface MovimientoEnvaseInsert {
  fecha_movimiento: string;
  tipo_movimiento: string;
  envase_id: number;
  cantidad: number;
  proveedor_id?: number | null;
  cliente_id?: number | null;
  fletero_id?: number | null;
  remito_asociado?: string | null;
  notas?: string | null;
}

// ── insertarMovimientosEnvases ───────────────────────────────────────────────
/**
 * Inserta movimientos de envases validando que el stock físico (vacíos) no quede negativo.
 * Para cada envase con SALIDA en el lote: stock_actual + entradas_del_lote - salidas_del_lote >= 0.
 */
export async function insertarMovimientosEnvases(
  registros: MovimientoEnvaseInsert[]
): Promise<{ success: boolean; error?: string }> {
  if (registros.length === 0) return { success: true };

  const entradasPorEnvase = new Map<number, number>();
  const salidasPorEnvase = new Map<number, number>();

  for (const r of registros) {
    if (!r.envase_id || r.cantidad == null) continue;
    const tipo = (r.tipo_movimiento || '').toUpperCase();
    const cant = Number(r.cantidad) || 0;
    if (tipo === 'SALIDA') {
      salidasPorEnvase.set(r.envase_id, (salidasPorEnvase.get(r.envase_id) ?? 0) + cant);
    } else if (tipo === 'INGRESO' || tipo === 'ENTRADA') {
      entradasPorEnvase.set(r.envase_id, (entradasPorEnvase.get(r.envase_id) ?? 0) + cant);
    }
  }

  const envaseIdsConSalida = [...salidasPorEnvase.keys()];
  if (envaseIdsConSalida.length > 0) {
    const { data: stockRows } = await supabaseServer
      .from('stock_vacios_por_envase' as string)
      .select('envase_id, vacios')
      .in('envase_id', envaseIdsConSalida);

    const stockMap = new Map<number, number>();
    for (const row of (stockRows ?? []) as { envase_id: number; vacios: number }[]) {
      stockMap.set(row.envase_id, row.vacios ?? 0);
    }

    for (const envaseId of envaseIdsConSalida) {
      const actual = stockMap.get(envaseId) ?? 0;
      const entradas = entradasPorEnvase.get(envaseId) ?? 0;
      const salidas = salidasPorEnvase.get(envaseId) ?? 0;
      const despues = actual + entradas - salidas;
      if (despues < 0) {
        return {
          success: false,
          error: `Stock físico insuficiente para un envase del movimiento. En el acopio solo hay ${actual} unidades disponibles para ese envase.`,
        };
      }
    }
  }

  const payload = registros.map(r => ({
    fecha_movimiento: r.fecha_movimiento,
    tipo_movimiento: r.tipo_movimiento,
    envase_id: r.envase_id,
    cantidad: r.cantidad,
    proveedor_id: r.proveedor_id ?? null,
    cliente_id: r.cliente_id ?? null,
    fletero_id: r.fletero_id ?? null,
    remito_asociado: r.remito_asociado ?? null,
    notas: r.notas ?? null,
  }));

  const { error } = await supabaseServer.from('Movimientos_Envases').insert(payload);

  if (error) {
    console.error('[insertarMovimientosEnvases] Supabase error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/inventario');
  revalidatePath('/envases');
  revalidatePath('/mov-envases');
  revalidatePath('/saldos-envases');
  return { success: true };
}

// ── deleteAjusteEnvase ────────────────────────────────────────────────────────
/**
 * Elimina un ajuste manual de Movimientos_Envases por su ID.
 * Solo borra registros cuyo tipo_movimiento sea AJUSTE_VACIO o AJUSTE_OCUPADO
 * (guardrail de seguridad: no puede borrar entradas/salidas operativas).
 */
export async function deleteAjusteEnvase(id: number): Promise<{ error?: string }> {
  const { error } = await supabaseServer
    .from('Movimientos_Envases')
    .delete()
    .eq('id', id)
    .in('tipo_movimiento', ['AJUSTE_VACIO', 'AJUSTE_OCUPADO']);

  if (error) {
    console.error('[deleteAjusteEnvase] Supabase error:', error);
    return { error: error.message };
  }

  revalidatePath('/inventario');
  return {};
}

// ── getStockProducto ─────────────────────────────────────────────────────────
/**
 * Devuelve el stock actual (kg) de un producto: Σ(Entradas_Fruta.peso_neto_kg) − Σ(Salidas_Fruta.peso_salida_acopio_kg).
 * Usado desde el formulario de Salida de Fruta para mostrar "Stock disponible" y el botón [Usar Total].
 */
export async function getStockProducto(productoId: number): Promise<{ stock: number }> {
  const [
    { data: entradas },
    { data: salidas },
  ] = await Promise.all([
    supabaseServer
      .from('Entradas_Fruta')
      .select('peso_neto_kg')
      .eq('producto_id', productoId),
    supabaseServer
      .from('Salidas_Fruta')
      .select('peso_salida_acopio_kg')
      .eq('producto_id', productoId),
  ]);

  let total = 0;
  for (const e of entradas ?? []) total += Number(e.peso_neto_kg ?? 0);
  for (const s of salidas ?? []) total -= Number(s.peso_salida_acopio_kg ?? 0);

  return { stock: parseFloat(Math.max(0, total).toFixed(2)) };
}

// ── getHistorialAjustes ──────────────────────────────────────────────────────
const RANGO_MAX_DIAS_AJUSTES = 31;

export interface AjusteHistorialRow {
  id: number;
  fecha_movimiento: string | null;
  envase_id: number | null;
  envase_nombre: string;
  tipo_movimiento: string;
  cantidad: number | null;
  notas: string | null;
}

/**
 * Devuelve el historial de ajustes manuales (AJUSTE_VACIO, AJUSTE_OCUPADO)
 * filtrado por rango de fechas (created_at). Máximo 31 días.
 */
export async function getHistorialAjustes(
  desde: string,
  hasta: string,
): Promise<{ data: AjusteHistorialRow[] | null; error: string | null }> {
  const dDesde = new Date(desde);
  const dHasta = new Date(hasta);
  if (Number.isNaN(dDesde.getTime()) || Number.isNaN(dHasta.getTime())) {
    return { data: null, error: 'Fechas inválidas.' };
  }
  const diffMs = dHasta.getTime() - dDesde.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
  if (diffDias > RANGO_MAX_DIAS_AJUSTES) {
    return {
      data: null,
      error: 'Para optimizar el sistema, el rango máximo de consulta es de 31 días.',
    };
  }
  if (dDesde > dHasta) {
    return { data: null, error: 'La fecha Desde no puede ser mayor que Hasta.' };
  }

  const desdeTs = `${desde}T00:00:00`;
  const hastaTs = `${hasta}T23:59:59.999`;

  const { data: rows, error } = await supabaseServer
    .from('Movimientos_Envases')
    .select('id, fecha_movimiento, envase_id, tipo_movimiento, cantidad, notas, Envases(nombre)')
    .in('tipo_movimiento', ['AJUSTE_VACIO', 'AJUSTE_OCUPADO'])
    .gte('created_at', desdeTs)
    .lte('created_at', hastaTs)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getHistorialAjustes]', error);
    return { data: null, error: error.message };
  }

  const list: AjusteHistorialRow[] = (rows ?? []).map((r: { id: number; fecha_movimiento: string | null; envase_id: number | null; tipo_movimiento: string; cantidad: number | null; notas: string | null; Envases: { nombre: string | null } | null }) => ({
    id: r.id,
    fecha_movimiento: r.fecha_movimiento,
    envase_id: r.envase_id,
    envase_nombre: r.Envases?.nombre ?? '—',
    tipo_movimiento: r.tipo_movimiento,
    cantidad: r.cantidad,
    notas: r.notas,
  }));

  return { data: list, error: null };
}
