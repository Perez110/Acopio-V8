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
/**
 * Devuelve nombre y logo en base64 para usar en PDFs (remito ingreso, etc.).
 * Siempre lee la config actual desde la DB y convierte el logo en el servidor para evitar caché y CORS.
 */
export async function getConfiguracionConLogoParaPdf(): Promise<{
  nombre_empresa: string;
  logo_base64: string | null;
}> {
  const config = await getConfiguracion();
  const nombre = (config?.nombre_empresa?.trim()) || 'Acopio';

  let logo_base64: string | null = null;
  const logoUrl = config?.logo_url?.trim();
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        const contentType = res.headers.get('content-type') || 'image/png';
        logo_base64 = `data:${contentType};base64,${b64}`;
      }
    } catch (err) {
      console.error('[getConfiguracionConLogoParaPdf] fetch logo:', err);
    }
  }

  return { nombre_empresa: nombre, logo_base64 };
}

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

    // Revalidar layout, sidebar, login y página de configuración (login usa nombre/logo)
    revalidatePath('/');
    revalidatePath('/login');
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


