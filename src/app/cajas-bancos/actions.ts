'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

interface MovimientoInternoData {
  tipo_operacion: string;
  cuenta_origen_id?: number | null;
  cuenta_destino_id?: number | null;
  monto: number;
  descripcion: string;
}

/**
 * Registra un movimiento interno de dinero (transferencia, gasto, ingreso extra o retiro de socio).
 * El RPC get_saldos_cuentas ya procesa esta tabla automáticamente para actualizar saldos.
 */
export async function registrarMovimientoInterno(
  data: MovimientoInternoData,
): Promise<{ error: string | null }> {
  const { error } = await supabaseServer
    .from('Movimientos_Internos')
    .insert({
      tipo_operacion:    data.tipo_operacion,
      cuenta_origen_id:  data.cuenta_origen_id  ?? null,
      cuenta_destino_id: data.cuenta_destino_id ?? null,
      monto:             data.monto,
      descripcion:       data.descripcion,
    });

  if (error) return { error: error.message };

  // Invalida caché: los saldos de Cajas y Bancos cambian, y el Historial recibe el nuevo evento
  revalidatePath('/cajas-bancos');
  revalidatePath('/historial');

  return { error: null };
}

// ── Conciliación: historial de movimientos de una cuenta ─────────────────────
const RANGO_MAX_DIAS = 31;

export interface MovimientoHistorialItem {
  fecha: string;
  concepto: string;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
}

export async function getHistorialCuenta(
  cuentaId: number,
  desde: string,
  hasta: string,
): Promise<{ data: MovimientoHistorialItem[] | null; error: string | null }> {
  const dDesde = new Date(desde);
  const dHasta = new Date(hasta);
  if (Number.isNaN(dDesde.getTime()) || Number.isNaN(dHasta.getTime())) {
    return { data: null, error: 'Fechas inválidas.' };
  }
  const diffMs = dHasta.getTime() - dDesde.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
  if (diffDias > RANGO_MAX_DIAS) {
    return {
      data: null,
      error: 'Rango máximo de 31 días para proteger el rendimiento del sistema.',
    };
  }
  if (dDesde > dHasta) {
    return { data: null, error: 'La fecha Desde no puede ser mayor que Hasta.' };
  }

  const desdeTs = `${desde}T00:00:00`;
  const hastaTs = `${hasta}T23:59:59.999`;

  const [resMF, resMI] = await Promise.all([
    supabaseServer
      .from('Movimientos_Financieros')
      .select('id, fecha, tipo, monto, descripcion')
      .eq('cuenta_financiera_id', cuentaId)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false }),
    supabaseServer
      .from('Movimientos_Internos')
      .select('id, created_at, cuenta_origen_id, cuenta_destino_id, monto, descripcion')
      .or(`cuenta_origen_id.eq.${cuentaId},cuenta_destino_id.eq.${cuentaId}`)
      .gte('created_at', desdeTs)
      .lte('created_at', hastaTs)
      .order('created_at', { ascending: false }),
  ]);

  const items: MovimientoHistorialItem[] = [];

  for (const r of (resMF.data ?? []) as { fecha: string | null; tipo: string | null; monto: number | null; descripcion: string | null }[]) {
    const fecha = (r.fecha ?? '').slice(0, 10);
    const tipo = (r.tipo ?? '').toUpperCase() === 'INGRESO' ? 'INGRESO' : 'EGRESO';
    items.push({
      fecha,
      concepto: (r.descripcion ?? '').trim() || 'Cobro/Pago',
      tipo,
      monto: Number(r.monto ?? 0),
    });
  }

  for (const r of (resMI.data ?? []) as { created_at: string; cuenta_origen_id: number | null; cuenta_destino_id: number | null; monto: number | null; descripcion: string | null }[]) {
    const fecha = (r.created_at ?? '').slice(0, 10);
    const esOrigen = r.cuenta_origen_id === cuentaId;
    const tipo = esOrigen ? 'EGRESO' : 'INGRESO';
    items.push({
      fecha,
      concepto: (r.descripcion ?? '').trim() || 'Mov. interno',
      tipo,
      monto: Number(r.monto ?? 0),
    });
  }

  items.sort((a, b) => {
    const c = b.fecha.localeCompare(a.fecha);
    return c !== 0 ? c : 0;
  });

  return { data: items, error: null };
}
