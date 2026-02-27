'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function signIn(email: string, password: string): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // En Server Action puede fallar si se llama desde un form sin cookies; el middleware refrescará
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

  if (error) {
    if (error.message.includes('Invalid login credentials') || error.message.includes('Email not confirmed')) {
      return { error: 'Credenciales inválidas.' };
    }
    return { error: error.message };
  }

  redirect('/');
}
