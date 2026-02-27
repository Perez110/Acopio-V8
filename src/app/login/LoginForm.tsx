'use client';

import { useState } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { signIn } from './actions';

interface Props {
  nombreSistema: string;
  logoUrl: string | null;
}

export default function LoginForm({ nombreSistema, logoUrl }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Ingresá tu email.');
      return;
    }
    if (!password) {
      setError('Ingresá tu contraseña.');
      return;
    }
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result?.error) {
      setError(result.error);
    }
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
            {nombreSistema} — Acceso Seguro
          </h1>
          <p className="mt-2 text-center text-sm text-slate-500">
            Ingresá con tu cuenta para continuar
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0d5c4c] focus:outline-none focus:ring-2 focus:ring-[#0d5c4c]/20"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
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
                  Ingresando…
                </>
              ) : (
                'Ingresar'
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
