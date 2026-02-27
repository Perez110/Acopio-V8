'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseService } from '@/lib/supabase-service';

export interface ConfiguracionEmpresa {
  id: number;
  nombre_empresa: string | null;
  logo_url: string | null;
}

export async function getConfiguracion(): Promise<ConfiguracionEmpresa | null> {
  const { data, error } = await supabaseServer
    .from('Configuracion_Empresa')
    .select('id, nombre_empresa, logo_url')
    .eq('id', 1)
    .single();

  if (error) {
    console.error('[getConfiguracion]', error);
    return null;
  }

  return data as ConfiguracionEmpresa;
}

/**
 * Obtiene solo nombre y logo para la pantalla de login (white label).
 * Usa service_role si está disponible para evitar fallos por RLS con usuario no autenticado.
 * Si falla, devuelve null (el caller debe usar fallback).
 */
export async function getConfiguracionParaLogin(): Promise<{
  nombre_empresa: string | null;
  logo_url: string | null;
} | null> {
  const client = supabaseService ?? supabaseServer;
  const { data, error } = await client
    .from('Configuracion_Empresa')
    .select('nombre_empresa, logo_url')
    .eq('id', 1)
    .single();

  if (error) {
    return null;
  }
  return {
    nombre_empresa: (data?.nombre_empresa ?? null) as string | null,
    logo_url: (data?.logo_url ?? null) as string | null,
  };
}

export async function updateConfiguracion(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const nombre = (formData.get('nombre_empresa') ?? '').toString().trim() || null;
    const file = formData.get('logo') as File | null;

    let logoUrl: string | null | undefined;

    if (file && typeof file === 'object' && file.size > 0) {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabaseServer.storage
        .from('logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type || 'image/png',
        });

      if (uploadError) {
        console.error('[updateConfiguracion] upload logo:', uploadError);
        return { ok: false, error: 'No se pudo subir el logo. Intente nuevamente.' };
      }

      const { data } = supabaseServer.storage.from('logos').getPublicUrl(fileName);
      logoUrl = data.publicUrl ?? null;
    }

    const payload: Partial<ConfiguracionEmpresa> = {
      nombre_empresa: nombre,
    };
    if (logoUrl !== undefined) {
      payload.logo_url = logoUrl;
    }

    const { error: updateError } = await supabaseServer
      .from('Configuracion_Empresa')
      .update(payload)
      .eq('id', 1);

    if (updateError) {
      console.error('[updateConfiguracion] update row:', updateError);
      return { ok: false, error: 'No se pudo guardar la configuración.' };
    }

    // Revalidar layout, sidebar y página de configuración
    revalidatePath('/');
    revalidatePath('/configuracion/general');

    return { ok: true };
  } catch (err) {
    console.error('[updateConfiguracion]', err);
    return { ok: false, error: 'Error inesperado al guardar la configuración.' };
  }
}

export async function submitConfiguracionForm(formData: FormData): Promise<void> {
  await updateConfiguracion(formData);
}


