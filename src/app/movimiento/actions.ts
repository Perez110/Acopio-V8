'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';

// ── Registrar salida de fruta con envases (atómico) ───────────────────────────
export interface LineaSalidaFruta {
  producto_id: number;
  peso_salida_acopio_kg: number;
  remito_nro: string;
}

/**
 * Registra una salida de fruta y, si se indican envases, un movimiento SALIDA_OCUPADO
 * en Movimientos_Envases (resta ocupados en Inventario y baja deuda de envases con el cliente).
 * Todo en una sola transacción en la BD.
 */
export async function registrarSalidaFrutaConEnvases(params: {
  fecha_salida: string;
  cliente_id: number;
  fletero_id: number | null;
  lineas: LineaSalidaFruta[];
  envase_id: number | null;
  cantidad_envases: number | null;
  remito_para_nota: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { fecha_salida, cliente_id, fletero_id, lineas, envase_id, cantidad_envases, remito_para_nota } = params;

  if (!lineas.length) return { success: false, error: 'Debe haber al menos una línea de despacho.' };

  const p_lineas = lineas.map(l => ({
    producto_id: l.producto_id,
    peso_salida_acopio_kg: l.peso_salida_acopio_kg,
    remito_nro: l.remito_nro ?? '',
  }));

  const { error } = await supabaseServer.rpc('registrar_salida_fruta_con_envases', {
    p_fecha_salida: fecha_salida,
    p_cliente_id: cliente_id,
    p_fletero_id: fletero_id ?? 0,
    p_lineas,
    p_envase_id: envase_id ?? null,
    p_cantidad_envases: cantidad_envases ?? null,
    p_remito_para_nota: remito_para_nota ?? null,
  });

  if (error) {
    console.error('[registrarSalidaFrutaConEnvases]', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/movimiento');
  revalidatePath('/envases');
  revalidatePath('/saldos-envases');
  return { success: true };
}

/**
 * Saldo actual de envases de un proveedor: envases recibidos (Entradas_Fruta)
 * menos envases devueltos (Movimientos_Envases tipo SALIDA con ese proveedor).
 * Usa RPC consolidado en la BD para escalar a años de datos.
 */
export async function getSaldoEnvasesProveedor(
  proveedorId: number,
): Promise<number> {
  const { data, error } = await supabaseServer.rpc('get_saldo_envases_proveedor', {
    p_proveedor_id: proveedorId,
  });
  if (error) {
    console.error('[getSaldoEnvasesProveedor]', error);
    return 0;
  }
  const n = Number(data ?? 0);
  return Math.max(0, n);
}

/**
 * Saldo de envases del cliente (RPC get_saldo_envases_cliente).
 * Usado para el remito de ingreso y reimpresión desde historial.
 */
export async function getSaldoEnvasesCliente(clienteId: number): Promise<number> {
  const { data, error } = await supabaseServer.rpc('get_saldo_envases_cliente', {
    p_cliente_id: clienteId,
  });
  if (error) {
    console.error('[getSaldoEnvasesCliente]', error);
    return 0;
  }
  const n = Number(data ?? 0);
  return Math.max(0, n);
}
