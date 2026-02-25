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
