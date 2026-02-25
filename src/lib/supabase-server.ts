import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para uso exclusivo en Server Components y Route Handlers.
 * Nunca importar desde archivos con 'use client'.
 * Usa la anon key; para operaciones con service role usar SUPABASE_SERVICE_ROLE_KEY.
 */
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
