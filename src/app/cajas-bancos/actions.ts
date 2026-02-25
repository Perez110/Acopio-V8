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
