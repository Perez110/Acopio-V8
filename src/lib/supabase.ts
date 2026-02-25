import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Las interfaces de tipos están en src/types/database.ts y se usan en los componentes.
// El cliente no lleva el genérico para evitar conflictos con el formato interno de supabase-js v2.9+
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
