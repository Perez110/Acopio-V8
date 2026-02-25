'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Clock, CheckCircle, Search, TrendingUp, TrendingDown,
  AlertTriangle, Phone, ChevronRight, Users, Truck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const ITEMS_PER_PAGE = 20;

// ── Tipos exportados ─────────────────────────────────────────────────────────
export interface SaldoCliente {
  clienteId: number;
  clienteNombre: string;
  telefono: string | null;
  totalFacturado: number;
  totalCobrado: number;
  /** > 0 = el cliente nos debe */
  saldo: number;
  cantSalidas: number;
  cantCobros: number;
  ultimaFechaSalida: string | null;
  ultimaFechaCobro: string | null;
  ultimaActividad: string | null;
}

export interface StatsCC {
  totalClientes: number;
  totalConDeuda: number;
  totalFacturado: number;
  totalCobrado: number;
  totalPendiente: number;
  totalCerrados: number;
}

export interface SaldoProveedor {
  proveedorId: number;
  proveedorNombre: string;
  telefono: string | null;
  totalComprado: number;
  totalPagado: number;
  /** > 0 = le debemos al proveedor */
  saldo: number;
  cantEntradas: number;
  cantPagos: number;
  ultimaFechaEntrada: string | null;
  ultimaFechaPago: string | null;
  ultimaActividad: string | null;
}

export interface StatsProv {
  totalProveedores: number;
  totalConDeuda: number;
  totalComprado: number;
  totalPagado: number;
  totalPendiente: number;
  totalCerrados: number;
}

type EntityType = 'clientes' | 'proveedores';

interface Props {
  saldosClientes: SaldoCliente[];
  statsClientes: StatsCC;
  saldosProveedores: SaldoProveedor[];
  statsProveedores: StatsProv;
  defaultEntity: EntityType;
}

// ── Utilidades de formato ─────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtMonth(key: string) {
  if (!key) return 'Sin fecha';
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
}

// ── Componentes internos ──────────────────────────────────────────────────────
function StatCard({ label, value, sub, variant }: {
  label: string; value: string; sub: string;
  variant: 'red' | 'green' | 'blue' | 'orange';
}) {
  // Semántica corporativa: rojo para deuda, esmeralda para cobrado/pagado, slate para datos neutros
  const cls = {
    red:    'text-red-700',
    green:  'text-emerald-700',
    blue:   'text-slate-900',
    orange: 'text-slate-900',
  }[variant];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="h-1 rounded-full bg-green-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function EmptyState({ msg, sub }: { msg: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
      <CheckCircle className="mb-3 h-12 w-12 text-green-300" />
      <p className="text-sm font-semibold text-gray-600">{msg}</p>
      <p className="mt-1 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CuentasCorrientesClient({
  saldosClientes,
  statsClientes,
  saldosProveedores,
  statsProveedores,
  defaultEntity,
}: Props) {
  const [entity, setEntity] = useState<EntityType>(defaultEntity);
  const [tab, setTab] = useState<'activos' | 'cerrados'>('activos');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Recordar última selección en localStorage (client-only)
  useEffect(() => {
    const saved = localStorage.getItem('cc-entity') as EntityType | null;
    if (saved === 'clientes' || saved === 'proveedores') setEntity(saved);
  }, []);

  function changeEntity(e: EntityType) {
    setEntity(e);
    setTab('activos');
    setSearch('');
    setCurrentPage(1);
    localStorage.setItem('cc-entity', e);
  }

  // ── Derivados Clientes ────────────────────────────────────────────────────
  const activosCli = saldosClientes.filter(s => s.saldo > 0);
  const cerradosCli = saldosClientes.filter(s => s.saldo <= 0 && s.totalFacturado > 0);
  const filteredActivosCli = activosCli.filter(s => s.clienteNombre.toLowerCase().includes(search.toLowerCase()));

  const porMesCli = new Map<string, SaldoCliente[]>();
  for (const s of cerradosCli) {
    const key = (s.ultimaActividad ?? '').substring(0, 7);
    const g = porMesCli.get(key) ?? [];
    g.push(s);
    porMesCli.set(key, g);
  }
  const sortedMesesCli = [...porMesCli.entries()].sort(([a], [b]) => b.localeCompare(a));

  // ── Derivados Proveedores ─────────────────────────────────────────────────
  const activosProv = saldosProveedores.filter(s => s.saldo > 0);
  const cerradosProv = saldosProveedores.filter(s => s.saldo <= 0 && s.totalComprado > 0);
  const filteredActivosProv = activosProv.filter(s => s.proveedorNombre.toLowerCase().includes(search.toLowerCase()));

  const porMesProv = new Map<string, SaldoProveedor[]>();
  for (const s of cerradosProv) {
    const key = (s.ultimaActividad ?? '').substring(0, 7);
    const g = porMesProv.get(key) ?? [];
    g.push(s);
    porMesProv.set(key, g);
  }
  const sortedMesesProv = [...porMesProv.entries()].sort(([a], [b]) => b.localeCompare(a));

  const isClientes = entity === 'clientes';
  const currentActivos = isClientes ? filteredActivosCli.length : filteredActivosProv.length;
  const currentCerrados = isClientes ? cerradosCli.length : cerradosProv.length;

  // Resetear página cuando cambia el término de búsqueda para evitar páginas vacías
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Paginación para listas activas (clientes / proveedores)
  const totalPagesActivosCli = Math.max(1, Math.ceil(filteredActivosCli.length / ITEMS_PER_PAGE));
  const totalPagesActivosProv = Math.max(1, Math.ceil(filteredActivosProv.length / ITEMS_PER_PAGE));
  const pageCliItems = filteredActivosCli.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const pageProvItems = filteredActivosProv.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div>
      {/* ── Toggle Entidad ────────────────────────────────────────────────── */}
      <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm">
        <button
          onClick={() => changeEntity('clientes')}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            entity === 'clientes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Clientes
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            entity === 'clientes' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
          }`}>
            {activosCli.length}
          </span>
        </button>
        <button
          onClick={() => changeEntity('proveedores')}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            entity === 'proveedores' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="h-4 w-4" />
          Proveedores
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            entity === 'proveedores' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-500'
          }`}>
            {activosProv.length}
          </span>
        </button>
      </div>

      {/* ── Tarjetas de resumen ───────────────────────────────────────────── */}
      {isClientes ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Con deuda activa" value={String(statsClientes.totalConDeuda)} sub={`de ${statsClientes.totalClientes} clientes`} variant="red" />
          <StatCard label="Total facturado" value={formatCurrency(Math.abs(statsClientes.totalFacturado))} sub="Suma de salidas conciliadas" variant="blue" />
          <StatCard label="Total cobrado" value={formatCurrency(Math.abs(statsClientes.totalCobrado))} sub="Suma de cobros" variant="green" />
          <StatCard label="Pendiente total" value={formatCurrency(Math.abs(statsClientes.totalPendiente))} sub={`${statsClientes.totalCerrados} cuenta${statsClientes.totalCerrados !== 1 ? 's' : ''} cerrada${statsClientes.totalCerrados !== 1 ? 's' : ''}`} variant="orange" />
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Deudas activas" value={String(statsProveedores.totalConDeuda)} sub={`de ${statsProveedores.totalProveedores} proveedores`} variant="orange" />
          <StatCard label="Total comprado" value={formatCurrency(Math.abs(statsProveedores.totalComprado))} sub="Suma de entradas de fruta" variant="blue" />
          <StatCard label="Total pagado" value={formatCurrency(Math.abs(statsProveedores.totalPagado))} sub="Suma de pagos registrados" variant="green" />
          <StatCard label="Deuda pendiente" value={formatCurrency(Math.abs(statsProveedores.totalPendiente))} sub={`${statsProveedores.totalCerrados} cuenta${statsProveedores.totalCerrados !== 1 ? 's' : ''} cerrada${statsProveedores.totalCerrados !== 1 ? 's' : ''}`} variant="red" />
        </div>
      )}

      {/* ── Sub-tabs: Activos / Cerrados ──────────────────────────────────── */}
      <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm">
        <button
          onClick={() => { setTab('activos'); setSearch(''); }}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            tab === 'activos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="h-4 w-4" />
          {isClientes ? 'Saldos Activos' : 'Deudas Activas'}
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            tab === 'activos'
              ? (isClientes ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600')
              : 'bg-gray-200 text-gray-500'
          }`}>
            {currentActivos}
          </span>
        </button>
        <button
          onClick={() => { setTab('cerrados'); setSearch(''); }}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            tab === 'cerrados' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CheckCircle className="h-4 w-4" />
          Cerrados por Mes
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            tab === 'cerrados' ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'
          }`}>
            {currentCerrados}
          </span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CLIENTES                                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {isClientes && tab === 'activos' && (
        <div>
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente…"
              className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>

          {filteredActivosCli.length === 0 ? (
            <EmptyState
              msg="Sin saldos activos"
              sub={search ? 'No hay clientes que coincidan.' : 'Todos los clientes están al día.'}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-5 py-3 text-right">Facturado</th>
                    <th className="px-5 py-3 text-right">Cobrado</th>
                    <th className="px-5 py-3 text-right">Saldo</th>
                    <th className="px-5 py-3 text-right">Últ. actividad</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageCliItems.map(s => {
                    const pct = s.totalFacturado > 0 ? (s.totalCobrado / s.totalFacturado) * 100 : 0;
                    const deudaAlta = s.saldo > s.totalFacturado * 0.5;
                    return (
                      <tr key={s.clienteId} className="group hover:bg-gray-50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {deudaAlta && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-orange-400" />}
                            <div>
                              <p className="font-semibold text-gray-900">{s.clienteNombre}</p>
                              {s.telefono && (
                                <a href={`tel:${s.telefono}`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500">
                                  <Phone className="h-3 w-3" />{s.telefono}
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-mono text-gray-700">{formatCurrency(Math.abs(s.totalFacturado))}</span>
                          <p className="text-xs text-gray-400">{s.cantSalidas} salida{s.cantSalidas !== 1 ? 's' : ''}</p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-mono text-green-600">{formatCurrency(Math.abs(s.totalCobrado))}</span>
                          <ProgressBar pct={pct} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="inline-block rounded-lg bg-red-50 px-2.5 py-1 font-mono text-xs font-bold text-red-700">
                            {formatCurrency(Math.abs(s.saldo))}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-xs text-gray-400">{fmtDate(s.ultimaActividad)}</td>
                        <td className="px-5 py-4 text-right">
                          <Link href="/cobros-pagos" className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100">
                            <TrendingUp className="h-3.5 w-3.5" />Cobrar<ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                    <td className="px-5 py-3">{filteredActivosCli.length} cliente{filteredActivosCli.length !== 1 ? 's' : ''} con deuda</td>
                    <td className="px-5 py-3 text-right font-mono">{formatCurrency(Math.abs(filteredActivosCli.reduce((s, a) => s + a.totalFacturado, 0)))}</td>
                    <td className="px-5 py-3 text-right font-mono text-green-600">{formatCurrency(Math.abs(filteredActivosCli.reduce((s, a) => s + a.totalCobrado, 0)))}</td>
                    <td className="px-5 py-3 text-right font-mono text-red-700">{formatCurrency(Math.abs(filteredActivosCli.reduce((s, a) => s + a.saldo, 0)))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {filteredActivosCli.length > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-2.5 shadow-sm">
              <p className="text-sm text-slate-500">
                Página{' '}
                <span className="font-medium text-slate-700">{currentPage}</span>
                {' '}de{' '}
                <span className="font-medium text-slate-700">{totalPagesActivosCli}</span>
                {filteredActivosCli.length > ITEMS_PER_PAGE && (
                  <span className="ml-2">
                    · {filteredActivosCli.length.toLocaleString('es-AR')} clientes
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPagesActivosCli, p + 1))}
                  disabled={currentPage >= totalPagesActivosCli}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isClientes && tab === 'cerrados' && (
        <div className="space-y-5">
          {sortedMesesCli.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
              <Clock className="mb-3 h-12 w-12 text-gray-200" />
              <p className="text-sm font-semibold text-gray-600">Sin cuentas cerradas aún</p>
              <p className="mt-1 text-xs text-gray-400">Aparecerán aquí las cuentas cuyo saldo quede en cero.</p>
            </div>
          ) : (
            sortedMesesCli.map(([key, items]) => {
              const totalMes = items.reduce((s, i) => s + i.totalFacturado, 0);
              return (
                <div key={key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900">{fmtMonth(key)}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-gray-500">{formatCurrency(Math.abs(totalMes))}</span>
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">{items.length} cuenta{items.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(s => (
                      <div key={s.clienteId} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{s.clienteNombre}</p>
                          <p className="mt-0.5 text-xs text-gray-400">{s.cantSalidas} salida{s.cantSalidas !== 1 ? 's' : ''} · Últ. cobro: {fmtDate(s.ultimaFechaCobro)}</p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-mono text-sm text-gray-600">{formatCurrency(Math.abs(s.totalFacturado))}</p>
                            <p className="text-xs text-gray-400">facturado</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm font-semibold text-green-600">{formatCurrency(Math.abs(s.totalCobrado))}</p>
                            <p className="text-xs text-gray-400">cobrado</p>
                          </div>
                          <span className={`rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${s.saldo === 0 ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                            {s.saldo === 0 ? '✓ Saldado' : `+${formatCurrency(Math.abs(s.saldo))} a favor`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* PROVEEDORES                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {!isClientes && tab === 'activos' && (
        <div>
          {/* Buscador */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proveedor…"
              className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>

          {/* Banner aclaratorio */}
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Estas son <strong>deudas del acopio hacia los proveedores</strong> por fruta ingresada y aún no pagada.
              El saldo = Total comprado − Total pagado.
            </span>
          </div>

          {filteredActivosProv.length === 0 ? (
            <EmptyState
              msg="Sin deudas activas con proveedores"
              sub={search ? 'No hay proveedores que coincidan.' : 'Todos los proveedores están saldados.'}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-5 py-3">Proveedor</th>
                    <th className="px-5 py-3 text-right">Total Comprado</th>
                    <th className="px-5 py-3 text-right">Total Pagado</th>
                    <th className="px-5 py-3 text-right">Saldo (Deuda)</th>
                    <th className="px-5 py-3 text-right">Últ. actividad</th>
                    <th className="px-5 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageProvItems.map(s => {
                    const pct = s.totalComprado > 0 ? (s.totalPagado / s.totalComprado) * 100 : 0;
                    const deudaAlta = s.saldo > s.totalComprado * 0.5;
                    return (
                      <tr key={s.proveedorId} className="group hover:bg-orange-50/40">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {deudaAlta && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-400" />}
                            <div>
                              <p className="font-semibold text-gray-900">{s.proveedorNombre}</p>
                              {s.telefono && (
                                <a href={`tel:${s.telefono}`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500">
                                  <Phone className="h-3 w-3" />{s.telefono}
                                </a>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Total Comprado */}
                        <td className="px-5 py-4 text-right">
                          <span className="font-mono text-gray-700">{formatCurrency(Math.abs(s.totalComprado))}</span>
                          <p className="text-xs text-gray-400">{s.cantEntradas} entrada{s.cantEntradas !== 1 ? 's' : ''}</p>
                        </td>

                        {/* Total Pagado + barra progreso */}
                        <td className="px-5 py-4 text-right">
                          <span className="font-mono text-green-600">{formatCurrency(Math.abs(s.totalPagado))}</span>
                          <ProgressBar pct={pct} />
                        </td>

                        {/* Saldo (deuda nuestra) — naranja */}
                        <td className="px-5 py-4 text-right">
                          <span className="inline-block rounded-lg bg-orange-50 px-2.5 py-1 font-mono text-xs font-bold text-orange-700">
                            {formatCurrency(Math.abs(s.saldo))}
                          </span>
                        </td>

                        {/* Última actividad */}
                        <td className="px-5 py-4 text-right text-xs text-gray-400">{fmtDate(s.ultimaActividad)}</td>

                        {/* Acción: Pagar */}
                        <td className="px-5 py-4 text-right">
                          <Link
                            href="/cobros-pagos"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100"
                          >
                            <TrendingDown className="h-3.5 w-3.5" />
                            Pagar
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                    <td className="px-5 py-3">{filteredActivosProv.length} proveedor{filteredActivosProv.length !== 1 ? 'es' : ''} con deuda</td>
                    <td className="px-5 py-3 text-right font-mono">{formatCurrency(Math.abs(filteredActivosProv.reduce((s, a) => s + a.totalComprado, 0)))}</td>
                    <td className="px-5 py-3 text-right font-mono text-green-600">{formatCurrency(Math.abs(filteredActivosProv.reduce((s, a) => s + a.totalPagado, 0)))}</td>
                    <td className="px-5 py-3 text-right font-mono text-orange-700">{formatCurrency(Math.abs(filteredActivosProv.reduce((s, a) => s + a.saldo, 0)))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {filteredActivosProv.length > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-2.5 shadow-sm">
              <p className="text-sm text-slate-500">
                Página{' '}
                <span className="font-medium text-slate-700">{currentPage}</span>
                {' '}de{' '}
                <span className="font-medium text-slate-700">{totalPagesActivosProv}</span>
                {filteredActivosProv.length > ITEMS_PER_PAGE && (
                  <span className="ml-2">
                    · {filteredActivosProv.length.toLocaleString('es-AR')} proveedores
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPagesActivosProv, p + 1))}
                  disabled={currentPage >= totalPagesActivosProv}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isClientes && tab === 'cerrados' && (
        <div className="space-y-5">
          {sortedMesesProv.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-20">
              <Clock className="mb-3 h-12 w-12 text-gray-200" />
              <p className="text-sm font-semibold text-gray-600">Sin deudas saldadas aún</p>
              <p className="mt-1 text-xs text-gray-400">Aparecerán aquí los proveedores ya pagados en su totalidad.</p>
            </div>
          ) : (
            sortedMesesProv.map(([key, items]) => {
              const totalMes = items.reduce((s, i) => s + i.totalComprado, 0);
              return (
                <div key={key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900">{fmtMonth(key)}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm text-gray-500">{formatCurrency(Math.abs(totalMes))}</span>
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">{items.length} proveedor{items.length !== 1 ? 'es' : ''}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {items.map(s => (
                      <div key={s.proveedorId} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50">
                        <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{s.proveedorNombre}</p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {s.cantEntradas} entrada{s.cantEntradas !== 1 ? 's' : ''} · Últ. pago: {fmtDate(s.ultimaFechaPago)}
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-mono text-sm text-gray-600">{formatCurrency(Math.abs(s.totalComprado))}</p>
                            <p className="text-xs text-gray-400">comprado</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm font-semibold text-green-600">{formatCurrency(Math.abs(s.totalPagado))}</p>
                            <p className="text-xs text-gray-400">pagado</p>
                          </div>
                          <span className={`rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                            s.saldo === 0 ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {s.saldo === 0 ? '✓ Saldado' : `+${formatCurrency(Math.abs(s.saldo))} a favor`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
