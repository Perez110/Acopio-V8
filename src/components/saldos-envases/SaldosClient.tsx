'use client';

import { useState, useEffect } from 'react';
import { Search, FileText, MessageCircle, CheckCircle, AlertTriangle, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { useConfigEmpresa } from '@/components/ClientShell';
import { convertUrlToBase64 } from '@/lib/imageUtils';
import { getHistorialEnvasesPdf } from '@/app/envases/actions';
import { generarResumenEnvasesPdf } from '@/components/envases/resumenEnvasesPdf';

const ITEMS_PER_PAGE = 20;

// ── Tipos ────────────────────────────────────────────────────────────────────
export type SaldoPorEnvase = {
  envaseId: number;
  envaseNombre: string;
  saldo: number; // negativo = deuda (nos deben, rojo); positivo = a favor (les debemos, verde)
};

export type SaldoEntidad = {
  entityType: 'proveedor' | 'cliente';
  entityId: number;
  entityNombre: string;
  saldoPorEnvase: SaldoPorEnvase[];
  totalSaldo: number;
};

interface Props {
  saldosPendientes: SaldoEntidad[];
  saldosPagados: SaldoEntidad[];
  statsProveedores: { total: number; conDeuda: number; totalEnvasesPendientes: number };
  statsClientes: { total: number; conDeuda: number; totalEnvasesPendientes: number };
}

type TabId = 'saldos' | 'pagados';
type FiltroEntidad = 'ambos' | 'proveedor' | 'cliente';

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildWhatsAppLink(entidad: SaldoEntidad): string {
  const lineas = entidad.saldoPorEnvase
    .filter(s => s.saldo !== 0)
    .map(s => `  • ${s.envaseNombre}: ${Math.abs(s.saldo)} unidades`)
    .join('\n');

  // Negativo = nos deben (deuda); positivo = les debemos (a favor)
  const msg =
    entidad.totalSaldo < 0
      ? `Hola ${entidad.entityNombre}, te recordamos que tenés un saldo pendiente con el acopio:\n${lineas}\n\nPor favor coordiná la devolución. Gracias!`
      : `Hola ${entidad.entityNombre}, te informamos que el acopio tiene pendiente devolverte:\n${lineas}\n\nCoordinemos. Gracias!`;

  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// ── Tarjeta de entidad ────────────────────────────────────────────────────────
function EntidadCard({ entidad }: { entidad: SaldoEntidad }) {
  const configEmpresa = useConfigEmpresa();
  const [generando, setGenerando] = useState(false);

  // Negativo = deuda (rojo), positivo = a favor (verde), cero = al día
  const tieneDeuda = entidad.totalSaldo < 0;
  const alDia = entidad.totalSaldo === 0;
  const aFavor = entidad.totalSaldo > 0;

  const badgeLabel = alDia
    ? `${entidad.entityType === 'proveedor' ? 'Proveedor' : 'Cliente'} (Al día)`
    : tieneDeuda
    ? `${entidad.entityType === 'proveedor' ? 'Proveedor' : 'Cliente'} (Me debe)`
    : `${entidad.entityType === 'proveedor' ? 'Proveedor' : 'Cliente'} (Le debo)`;

  const badgeClass = alDia
    ? 'bg-green-100 text-green-700'
    : tieneDeuda
    ? 'bg-red-100 text-red-700'
    : 'bg-green-100 text-green-700';

  return (
    <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm md:flex-row">
      {/* Bloque izquierdo: Identidad */}
      <div className="flex w-full items-center gap-3 md:w-auto">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
          {badgeLabel}
        </span>
        <p className="text-sm font-semibold text-gray-900 sm:text-base">{entidad.entityNombre}</p>
      </div>

      {/* Bloque central: Detalle de envases */}
      <div className="w-full flex-1 md:w-auto">
        {alDia ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <p>Saldo: 0 (al día)</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {entidad.saldoPorEnvase
              .filter(s => s.saldo !== 0)
              .map(s => (
                <span
                  key={s.envaseId}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    s.saldo < 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      s.saldo < 0 ? 'bg-red-500' : 'bg-green-500'
                    }`}
                  />
                  {s.envaseNombre}: {Math.abs(s.saldo)}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Bloque derecho: Totales y acciones */}
      <div className="flex w-full items-center justify-start gap-2 md:w-auto md:justify-end">
        {!alDia ? (
          <span
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold sm:text-sm ${
              tieneDeuda ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
            }`}
          >
            {Math.abs(entidad.totalSaldo)} envases ({tieneDeuda ? 'deuda' : 'a favor'})
          </span>
        ) : (
          <span className="text-xs font-semibold text-green-600 sm:text-sm">0 · Al día</span>
        )}

        <button
          onClick={async () => {
            try {
              setGenerando(true);
              let empresaLogoBase64: string | null = null;
              if (configEmpresa?.logo_url) {
                empresaLogoBase64 = await convertUrlToBase64(configEmpresa.logo_url);
              }
              const { data, error } = await getHistorialEnvasesPdf(
                entidad.entityId,
                entidad.entityType === 'proveedor' ? 'PROVEEDOR' : 'CLIENTE',
              );
              if (error || !data || data.length === 0) {
                console.error('[Error PDF Envases]:', error, 'Data:', data);
                setGenerando(false);
                return;
              }
              await generarResumenEnvasesPdf({
                empresaNombre: configEmpresa?.nombre_empresa || 'Acopio',
                empresaLogoBase64: empresaLogoBase64 ?? undefined,
                entidadNombre: entidad.entityNombre,
                entidadTipo: entidad.entityType === 'proveedor' ? 'PROVEEDOR' : 'CLIENTE',
                movimientos: data,
              });
            } finally {
              setGenerando(false);
            }
          }}
          disabled={generando}
          className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FileText className="h-3 w-3" />
          <span className="hidden sm:inline">{generando ? 'Generando…' : 'PDF'}</span>
          <span className="sm:hidden">{generando ? '...' : 'PDF'}</span>
        </button>
        <a
          href={buildWhatsAppLink(entidad)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
        >
          <MessageCircle className="h-3 w-3" />
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SaldosClient({ saldosPendientes: saldosPendientesProp, saldosPagados: saldosPagadosProp, statsProveedores, statsClientes }: Props) {
  const [tab, setTab] = useState<TabId>('saldos');
  const [filtro, setFiltro] = useState<FiltroEntidad>('ambos');
  const [busqueda, setBusqueda] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Resetear página al cambiar búsqueda, filtro o pestaña
  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtro, tab]);

  // Lista según pestaña: Saldos por Entidad = pendientes (esta_saldado false), Saldos Pagados = pagados (esta_saldado true)
  const listaBruta = tab === 'saldos' ? saldosPendientesProp : saldosPagadosProp;

  const saldosFiltrados = listaBruta.filter(s => {
    if (filtro !== 'ambos' && s.entityType !== filtro) return false;
    if (busqueda && !(s.entityNombre.toLowerCase().includes(busqueda.toLowerCase()))) return false;
    return true;
  });

  const saldosConDeuda = saldosFiltrados.filter(s => s.totalSaldo !== 0);
  const saldosAlDia = saldosFiltrados.filter(s => s.totalSaldo === 0);
  const saldosParaLista = [...saldosConDeuda, ...saldosAlDia];
  const totalItems = saldosParaLista.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const saldosPagina = saldosParaLista.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
        {(
          [
            { id: 'saldos', label: 'Saldos por Entidad' },
            { id: 'pagados', label: 'Saldos Pagados' },
          ] as { id: TabId; label: string }[]
        ).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Saldos por Entidad ───────────────────────────────────────── */}
      {tab === 'saldos' && (
        <div className="space-y-4">
          {/* Tarjetas de estadísticas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Proveedores con saldo pendiente</p>
                  <p className="text-2xl font-bold text-red-700">{statsProveedores.conDeuda}</p>
                  <p className="text-xs text-slate-400">{statsProveedores.totalEnvasesPendientes} envases pendientes</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                  <Users className="h-4 w-4 text-slate-500" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Proveedores</p>
                  <p className="text-2xl font-bold text-slate-900">{statsProveedores.total}</p>
                  <p className="text-xs text-slate-400">{statsProveedores.conDeuda} con saldo ≠ 0</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                  <Users className="h-4 w-4 text-slate-500" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clientes con saldo pendiente</p>
                  <p className="text-2xl font-bold text-slate-900">{statsClientes.conDeuda}</p>
                  <p className="text-xs text-slate-400">{statsClientes.conDeuda} con saldo ≠ 0</p>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filtro}
              onChange={e => setFiltro(e.target.value as FiltroEntidad)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
            >
              <option value="ambos">Ambos</option>
              <option value="proveedor">Proveedores</option>
              <option value="cliente">Clientes</option>
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar cliente o proveedor..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
            </div>
          </div>

          {/* Lista de tarjetas (paginada) */}
          {saldosPagina.length > 0 && (
            <div className="space-y-3">
              {saldosPagina.map(s => (
                <EntidadCard key={`${s.entityType}-${s.entityId}`} entidad={s} />
              ))}
            </div>
          )}

          {/* Controles de paginación (Private Banking) */}
          {totalItems > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-sm text-slate-500">
                Página <span className="font-medium text-slate-700">{currentPage}</span> de <span className="font-medium text-slate-700">{totalPages}</span>
                {totalItems > ITEMS_PER_PAGE && (
                  <span className="ml-2"> · {totalItems.toLocaleString('es-AR')} entidades</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {saldosFiltrados.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-16 text-center shadow-sm">
              <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-200" />
              <p className="font-medium text-gray-500">No hay entidades con movimientos de envases</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Saldos Pagados ───────────────────────────────────────────── */}
      {tab === 'pagados' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filtro}
              onChange={e => setFiltro(e.target.value as FiltroEntidad)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
            >
              <option value="ambos">Ambos</option>
              <option value="proveedor">Proveedores</option>
              <option value="cliente">Clientes</option>
            </select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar cliente o proveedor..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
              />
            </div>
          </div>

          {saldosPagina.length > 0 && (
            <div className="space-y-3">
              {saldosPagina.map(s => (
                <EntidadCard key={`${s.entityType}-${s.entityId}`} entidad={s} />
              ))}
            </div>
          )}

          {totalItems > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-sm text-slate-500">
                Página <span className="font-medium text-slate-700">{currentPage}</span> de <span className="font-medium text-slate-700">{totalPages}</span>
                {totalItems > ITEMS_PER_PAGE && (
                  <span className="ml-2"> · {totalItems.toLocaleString('es-AR')} entidades</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {saldosFiltrados.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-16 text-center shadow-sm">
              <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-200" />
              <p className="font-medium text-gray-500">No hay entidades con saldo pagado</p>
              <p className="mt-1 text-sm text-gray-400">Los saldos marcados como saldados aparecerán aquí</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
