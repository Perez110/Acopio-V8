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

/** Extrae access_token y refresh_token del hash para establecer la sesión manualmente */
function getTokensFromHash(): { access_token: string; refresh_token: string } | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (access && refresh) return { access_token: access, refresh_token: refresh };
  return null;
}

export default function SetPasswordForm({ nombreSistema, logoUrl }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'ready' | 'no-session'>('checking');
  /** true cuando hay hash pero tras el timeout no hubo sesión (enlace expirado/inválido) */
  const [linkExpired, setLinkExpired] = useState(false);
  /** true cuando tenemos sesión activa (hash procesado correctamente) */
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const hasToken = hasAccessTokenInHash();
    const hashType = getHashType();

    // Debug: validación del hash
    if (typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      console.log('[SetPassword] hash detectado:', {
        hasAccessToken: !!params.get('access_token'),
        type: params.get('type'),
        refreshToken: !!params.get('refresh_token'),
      });
    }

    if (!hasToken) {
      setStatus('no-session');
      return;
    }

    async function trySetSessionFromHash() {
      const tokens = getTokensFromHash();
      if (tokens) {
        try {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          });
          if (setErr) {
            console.log('[SetPassword] setSession error:', setErr.message);
          } else {
            console.log('[SetPassword] setSession OK desde hash');
          }
        } catch (e) {
          console.log('[SetPassword] setSession excepción:', e);
        }
      }
    }

    function trySetReady() {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          console.log('[SetPassword] sesión obtenida correctamente');
          setStatus('ready');
          setError('');
          setLinkExpired(false);
          setHasValidSession(true);
        }
      });
    }

    // Intentar establecer sesión desde el hash (por si el cliente no la parseó solo)
    trySetSessionFromHash().then(() => {
      trySetReady();
    });
    const t1 = setTimeout(trySetReady, 400);
    const t2 = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setHasValidSession(true);
          setLinkExpired(false);
          setError('');
        } else {
          setLinkExpired(true);
          setError('Por favor, solicitá una nueva invitación.');
        }
        setStatus('ready');
      });
    }, 1500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[SetPassword] onAuthStateChange', event, !!session);
      if (session) {
        setStatus('ready');
        setError('');
        setLinkExpired(false);
        setHasValidSession(true);
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
    console.log('[SetPassword] handleSubmit disparado');
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

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.log('[SetPassword] updateUser abortado: no hay sesión');
      setError('La sesión expiró. Por favor, solicitá una nueva invitación.');
      return;
    }

    console.log('[SetPassword] llamando updateUser...');
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      console.log('[SetPassword] updateUser error:', err.message, err);
      setError(err.message || 'No se pudo actualizar la contraseña.');
      return;
    }

    console.log('[SetPassword] contraseña actualizada, redirigiendo');
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
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
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
                  disabled={linkExpired}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0d5c4c] focus:outline-none focus:ring-2 focus:ring-[#0d5c4c]/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
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
                  disabled={linkExpired}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0d5c4c] focus:outline-none focus:ring-2 focus:ring-[#0d5c4c]/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || linkExpired}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0d5c4c] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a4a3d] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : linkExpired ? (
                'Enlace inválido'
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
