'use server';

import { supabaseServer } from '@/lib/supabase-server';

export type TipoEntidadEnvase = 'PROVEEDOR' | 'CLIENTE';

export interface HistorialEnvaseRow {
  fecha: string;
  concepto: string;
  envase_nombre: string;
  entregados: number;
  devueltos: number;
  saldo_acumulado: number;
}

export async function getHistorialEnvasesPdf(
  entidadId: number,
  tipo: TipoEntidadEnvase,
): Promise<{ data: HistorialEnvaseRow[]; error: string | null }> {
  const { data, error } = await supabaseServer.rpc('get_historial_envases_limpio', {
    p_entidad_id: entidadId,
    p_tipo_entidad: tipo,
  });

  if (error) {
    console.error('[getHistorialEnvasesPdf]', error);
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as HistorialEnvaseRow[], error: null };
}

