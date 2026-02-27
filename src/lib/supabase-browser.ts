import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de Supabase para el navegador (Client Components).
 * Usa cookies para mantener la sesión en sync con el middleware y el servidor.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
