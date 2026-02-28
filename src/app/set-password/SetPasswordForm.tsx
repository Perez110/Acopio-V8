'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';

interface Props {
  nombreSistema: string;
  logoUrl: string | null;
}

/** Parsea el hash de la URL para detectar type=recovery | invite | signup */
function getHashType(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get('type');
}

function hasAccessTokenInHash(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  return !!params.get('access_token');
}

export default function SetPasswordForm({ nombreSistema, logoUrl }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'ready' | 'no-session'>('checking');

  useEffect(() => {
    const supabase = createClient();
    const hasToken = hasAccessTokenInHash();
    const hashType = getHashType();
    const isInviteOrRecovery = hasToken && (hashType === 'recovery' || hashType === 'invite' || hashType === 'signup');

    if (!hasToken) {
      setStatus('no-session');
      return;
    }

    function trySetReady() {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setStatus('ready');
          setError('');
        }
      });
    }

    // El cliente de Supabase puede establecer la sesión desde el hash al cargar; comprobar de inmediato y tras un breve delay
    trySetReady();
    const t1 = setTimeout(trySetReady, 400);
    const t2 = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session && isInviteOrRecovery) {
          setError('El enlace expiró o es inválido. Solicitá uno nuevo.');
        }
        setStatus('ready');
      });
    }, 1500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setStatus('ready');
        setError('');
      }
    });

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === 'no-session') {
      router.replace('/login');
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!password || password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (/^\d+$/.test(password)) {
      setError('La contraseña no puede ser solo números. Incluí letras o símbolos.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });

    setLoading(false);
    if (err) {
      setError(err.message || 'No se pudo actualizar la contraseña.');
      return;
    }

    // Limpiar el hash de la URL antes de redirigir para no dejar tokens en el historial
    window.history.replaceState(null, '', window.location.pathname);
    router.replace('/?bienvenido=1');
  }

  if (status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Verificando enlace…</p>
        </div>
      </div>
    );
  }

  if (status === 'no-session') {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 flex justify-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={nombreSistema}
                className="h-16 w-auto max-w-[12rem] object-contain object-center"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d5c4c] text-white">
                <Lock className="h-6 w-6" />
              </div>
            )}
          </div>
          <h1 className="text-center text-lg font-semibold tracking-tight text-slate-800">
            Establecer contraseña
          </h1>
          <p className="mt-2 text-center text-sm text-slate-500">
            Creá una contraseña para acceder a {nombreSistema}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres (letras o símbolos)"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0d5c4c] focus:outline-none focus:ring-2 focus:ring-[#0d5c4c]/20"
                />
              </div>
            </div>
            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-slate-700">
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0d5c4c] focus:outline-none focus:ring-2 focus:ring-[#0d5c4c]/20"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0d5c4c] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a4a3d] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar contraseña y continuar'
              )}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          {nombreSistema} · Acceso restringido
        </p>
      </div>
    </div>
  );
}
