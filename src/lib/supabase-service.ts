import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con service_role key. Solo para uso en servidor
 * cuando se necesita bypass de RLS (ej. leer configuración pública en /login).
 * Si SUPABASE_SERVICE_ROLE_KEY no está definida, exporta null.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const supabaseService = createServiceClient();
