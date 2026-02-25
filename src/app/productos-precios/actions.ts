'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';

type UpdateProductoPayload = {
  nombre: string;
  descripcion: string | null;
  precio_compra_kg: number | null;
  precio_venta_kg: number | null;
  activo: boolean;
};

export async function updateProducto(
  id: number,
  payload: UpdateProductoPayload,
): Promise<{ data?: any; error?: string }> {
  // Obtener precios anteriores para saber si cambiaron
  const { data: before, error: fetchError } = await supabaseServer
    .from('Productos')
    .select('precio_compra_kg, precio_venta_kg')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error('[updateProducto] error al leer producto:', fetchError);
    return { error: fetchError.message };
  }

  const { data, error } = await supabaseServer
    .from('Productos')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[updateProducto] error al actualizar producto:', error);
    return { error: error.message };
  }

  const antesCompra = before?.precio_compra_kg ?? null;
  const antesVenta = before?.precio_venta_kg ?? null;
  const nuevaCompra = payload.precio_compra_kg ?? null;
  const nuevaVenta = payload.precio_venta_kg ?? null;

  try {
    // Si cambió el precio de compra, recalcular movimientos de compra
    if (nuevaCompra != null && nuevaCompra !== antesCompra) {
      await supabaseServer.rpc('actualizar_precios_retroactivos', {
        p_producto_id: id,
        p_nuevo_monto: nuevaCompra,
        p_es_compra: true,
      });
    }

    // Si cambió el precio de venta, recalcular movimientos de venta
    if (nuevaVenta != null && nuevaVenta !== antesVenta) {
      await supabaseServer.rpc('actualizar_precios_retroactivos', {
        p_producto_id: id,
        p_nuevo_monto: nuevaVenta,
        p_es_compra: false,
      });
    }
  } catch (rpcError) {
    console.error('[updateProducto] error en actualizar_precios_retroactivos:', rpcError);
    return {
      error:
        rpcError instanceof Error
          ? rpcError.message
          : 'Error al recalcular precios retroactivos.',
    };
  }

  // Refrescar saldos financieros y dashboard
  revalidatePath('/cuentas-corrientes');
  revalidatePath('/');

  return { data };
}

