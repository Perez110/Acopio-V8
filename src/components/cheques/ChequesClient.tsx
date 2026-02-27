'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Building2,
  Wallet,
  Send,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  getChequesPaginado,
  getChequesKPIs,
  updateEstadoCheque,
  depositarCheque,
  cobrarCheque,
  getCuentasActivas,
  deleteChequeEnCartera,
  type ChequeRow,
  type ChequesKPIsResult,
} from '@/app/cheques/actions';
import type { EstadoChequeTercero } from '@/types/database';

const ITEMS_PER_PAGE = 25;

const ESTADO_LABELS: Record<EstadoChequeTercero, string> = {
  EN_CARTERA: 'En cartera',
  ENDOSADO: 'Endosado',
  DEPOSITADO: 'Depositado',
  COBRADO: 'Cobrado',
  RECHAZADO: 'Rechazado',
};

/** Transiciones permitidas desde cada estado (para el botón de acción). */
const TRANSICIONES: Record<EstadoChequeTercero, EstadoChequeTercero[]> = {
  EN_CARTERA: ['ENDOSADO', 'DEPOSITADO', 'RECHAZADO'],
  ENDOSADO: [],
  DEPOSITADO: ['COBRADO', 'RECHAZADO'],
  COBRADO: [],
  RECHAZADO: [],
};

function formatCurrency(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

interface Props {
  itemsIniciales: ChequeRow[];
  totalInicial: number;
  kpisIniciales: ChequesKPIsResult;
}

export default function ChequesClient({
  itemsIniciales,
  totalInicial,
  kpisIniciales,
}: Props) {
  const [items, setItems] = useState<ChequeRow[]>(itemsIniciales);
  const [total, setTotal] = useState(totalInicial);
  const [kpis, setKpis] = useState<ChequesKPIsResult>(kpisIniciales);
  const [pagina, setPagina] = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoChequeTercero | ''>('');
  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [accionandoId, setAccionandoId] = useState<number | null>(null);
  const [menuAbiertoId, setMenuAbiertoId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [toast, setToast] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [chequeAEliminar, setChequeAEliminar] = useState<ChequeRow | null>(null);
  const [eliminandoCheque, setEliminandoCheque] = useState(false);
  const [chequeADepositar, setChequeADepositar] = useState<ChequeRow | null>(null);
  const [cuentasDeposito, setCuentasDeposito] = useState<{ id: number; nombre: string | null }[]>([]);
  const [loadingCuentasDeposito, setLoadingCuentasDeposito] = useState(false);
  const [cuentaDepositoSelected, setCuentaDepositoSelected] = useState('');
  const [savingDeposito, setSavingDeposito] = useState(false);

  const cerrarMenu = () => {
    setMenuAbiertoId(null);
    setMenuPos(null);
  };

  const refModalCheque = useRef<ChequeRow | null>(null);
  const refEliminando = useRef(false);
  const refMenuId = useRef<number | null>(null);
  refModalCheque.current = chequeAEliminar;
  refEliminando.current = eliminandoCheque;
  refMenuId.current = menuAbiertoId;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (refModalCheque.current != null && !refEliminando.current) setChequeAEliminar(null);
      else if (refMenuId.current != null) cerrarMenu();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (!chequeADepositar) return;
    setLoadingCuentasDeposito(true);
    setCuentaDepositoSelected('');
    getCuentasActivas().then((list) => {
      setCuentasDeposito(list);
      if (list.length > 0) setCuentaDepositoSelected(String(list[0].id));
      setLoadingCuentasDeposito(false);
    });
  }, [chequeADepositar]);

  function showToast(type: 'error' | 'success', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  const aplicarFiltro = async () => {
    setLoading(true);
    try {
      const [resTabla, resKpis] = await Promise.all([
        getChequesPaginado(estadoFiltro || undefined, 1, ITEMS_PER_PAGE),
        getChequesKPIs(),
      ]);
      setItems(resTabla.items);
      setTotal(resTabla.total);
      setPagina(1);
      setKpis(resKpis);
    } finally {
      setLoading(false);
    }
  };

  const irAPagina = async (page: number) => {
    if (page < 1 || page > totalPages) return;
    setLoadingPage(true);
    try {
      const res = await getChequesPaginado(estadoFiltro || undefined, page, ITEMS_PER_PAGE);
      setItems(res.items);
      setPagina(page);
    } finally {
      setLoadingPage(false);
    }
  };

  const cambiarEstado = async (id: number, nuevoEstado: EstadoChequeTercero) => {
    cerrarMenu();
    setAccionandoId(id);
    try {
      const { error } = await updateEstadoCheque(id, nuevoEstado);
      if (error) {
        showToast('error', error);
        return;
      }
      const [resTabla, resKpis] = await Promise.all([
        getChequesPaginado(estadoFiltro || undefined, pagina, ITEMS_PER_PAGE),
        getChequesKPIs(),
      ]);
      setItems(resTabla.items);
      setTotal(resTabla.total);
      setKpis(resKpis);
    } finally {
      setAccionandoId(null);
    }
  };

  const abrirModalEliminar = (row: ChequeRow) => {
    if (estadoActual(row) !== 'EN_CARTERA') return;
    setChequeAEliminar(row);
    cerrarMenu();
  };

  const confirmarEliminacionCheque = async () => {
    if (!chequeAEliminar) return;
    setEliminandoCheque(true);
    try {
      const { error } = await deleteChequeEnCartera(chequeAEliminar.id);
      if (error) {
        showToast('error', error);
        return;
      }
      showToast('success', 'Cheque eliminado correctamente.');
      setChequeAEliminar(null);
      const [resTabla, resKpis] = await Promise.all([
        getChequesPaginado(estadoFiltro || undefined, pagina, ITEMS_PER_PAGE),
        getChequesKPIs(),
      ]);
      setItems(resTabla.items);
      setTotal(resTabla.total);
      setKpis(resKpis);
    } finally {
      setEliminandoCheque(false);
    }
  };

  const estadoActual = (row: ChequeRow): EstadoChequeTercero =>
    (row.estado as EstadoChequeTercero) ?? 'EN_CARTERA';
  const opcionesEstado = (row: ChequeRow) => TRANSICIONES[estadoActual(row)] ?? [];
  const puedeEliminar = (row: ChequeRow) => estadoActual(row) === 'EN_CARTERA';
  const mostrarMenu = (row: ChequeRow) => opcionesEstado(row).length > 0 || puedeEliminar(row);

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
            toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {toast.type === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle className="h-5 w-5 shrink-0" />}
          <span className="flex-1">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Total en cartera</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {formatCurrency(kpis.totalEnCartera)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Próximos a vencer (7 días)</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700">{kpis.proximosAVencer}</p>
        </div>
      </div>

      {/* Filtro por estado */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-slate-600">Estado</label>
        <select
          value={estadoFiltro}
          onChange={e => setEstadoFiltro(e.target.value as EstadoChequeTercero | '')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
        >
          <option value="">Todos</option>
          {(Object.entries(ESTADO_LABELS) as [EstadoChequeTercero, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={aplicarFiltro}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Aplicar
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 font-semibold text-slate-600">Nº Cheque</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Banco</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Emisor</th>
                <th className="px-4 py-3 font-semibold text-slate-600">F. Emisión</th>
                <th className="px-4 py-3 font-semibold text-slate-600">F. Pago</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Monto</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Estado</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loadingPage ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay cheques para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                items.map(row => {
                  const opciones = opcionesEstado(row);
                  const menuAbierto = menuAbiertoId === row.id;
                  const accionando = accionandoId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-50 hover:bg-slate-50/50"
                    >
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {row.numero_cheque ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.banco ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{row.emisor ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.fecha_emision)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(row.fecha_pago)}</td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-800">
                        {formatCurrency(row.monto ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.estado === 'EN_CARTERA'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.estado === 'COBRADO'
                                ? 'bg-green-100 text-green-800'
                                : row.estado === 'RECHAZADO'
                                  ? 'bg-red-100 text-red-800'
                                  : row.estado === 'ENDOSADO'
                                    ? 'bg-slate-100 text-slate-700'
                                    : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {ESTADO_LABELS[(row.estado as EstadoChequeTercero) ?? 'EN_CARTERA']}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {mostrarMenu(row) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (accionando) return;
                              if (menuAbierto) {
                                cerrarMenu();
                              } else {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setMenuPos({ top: rect.bottom + 4, left: rect.right - 168 });
                                setMenuAbiertoId(row.id);
                              }
                            }}
                            disabled={accionando}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                            aria-label="Acciones"
                            aria-expanded={menuAbierto}
                            aria-haspopup="true"
                          >
                            {accionando ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {typeof document !== 'undefined' &&
          menuAbiertoId != null &&
          menuPos != null &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-[100]"
                aria-hidden
                onClick={cerrarMenu}
              />
              <div
                className="fixed z-[101] min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                style={{ top: menuPos.top, left: menuPos.left }}
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const row = items.find((r) => r.id === menuAbiertoId);
                  if (!row) return null;
                  const opciones = opcionesEstado(row);
                  return (
                    <>
                      {opciones.map((est) => (
                        <button
                          key={est}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (est === 'DEPOSITADO') {
                              setChequeADepositar(row);
                              cerrarMenu();
                            } else if (est === 'COBRADO') {
                              cerrarMenu();
                              setAccionandoId(row.id);
                              cobrarCheque(row.id).then(({ error }) => {
                                if (error) showToast('error', error);
                                else {
                                  showToast('success', 'Cheque cobrado. Se registró la acreditación en la cuenta.');
                                  Promise.all([
                                    getChequesPaginado(estadoFiltro || undefined, pagina, ITEMS_PER_PAGE),
                                    getChequesKPIs(),
                                  ]).then(([resTabla, resKpis]) => {
                                    setItems(resTabla.items);
                                    setTotal(resTabla.total);
                                    setKpis(resKpis);
                                  });
                                }
                                setAccionandoId(null);
                              });
                            } else {
                              cambiarEstado(row.id, est);
                            }
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          {est === 'DEPOSITADO' && <Send className="h-3.5 w-3.5" />}
                          {est === 'COBRADO' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
                          {est === 'RECHAZADO' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                          {est === 'ENDOSADO' && <Send className="h-3.5 w-3.5" />}
                          {ESTADO_LABELS[est]}
                        </button>
                      ))}
                      {puedeEliminar(row) && (
                        <>
                          {opciones.length > 0 && <div className="my-1 border-t border-slate-100" />}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => abrirModalEliminar(row)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </>,
            document.body
          )}

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              Página <span className="font-medium text-slate-700">{pagina}</span> de{' '}
              <span className="font-medium text-slate-700">{totalPages}</span>
              {total > ITEMS_PER_PAGE && (
                <span className="ml-2"> · {total.toLocaleString('es-AR')} registros</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => irAPagina(pagina - 1)}
                disabled={pagina <= 1 || loadingPage}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => irAPagina(pagina + 1)}
                disabled={pagina >= totalPages || loadingPage}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: depositar cheque (cuenta de depósito / clearing) */}
      {chequeADepositar && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => !savingDeposito && setChequeADepositar(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <Send className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              Depositar cheque
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Elegí la cuenta donde se deposita el cheque (valores al cobro). El saldo se acredita cuando el banco lo cobra.
            </p>
            <div className="mb-5 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cheque</p>
              <p className="mt-0.5 font-mono text-sm font-medium text-slate-700">
                {chequeADepositar.numero_cheque ?? '—'} · {chequeADepositar.banco ?? '—'}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{formatCurrency(chequeADepositar.monto ?? 0)}</p>
            </div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Cuenta de depósito</label>
            <select
              value={cuentaDepositoSelected}
              onChange={e => setCuentaDepositoSelected(e.target.value)}
              disabled={loadingCuentasDeposito}
              className="mb-5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              {loadingCuentasDeposito ? (
                <option value="">Cargando cuentas…</option>
              ) : cuentasDeposito.length === 0 ? (
                <option value="">No hay cuentas activas</option>
              ) : (
                cuentasDeposito.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre ?? `Cuenta #${c.id}`}</option>
                ))
              )}
            </select>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => !savingDeposito && setChequeADepositar(null)}
                disabled={savingDeposito}
                className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!cuentaDepositoSelected || savingDeposito) return;
                  setSavingDeposito(true);
                  const { error } = await depositarCheque(chequeADepositar.id, Number(cuentaDepositoSelected));
                  setSavingDeposito(false);
                  if (error) {
                    showToast('error', error);
                    return;
                  }
                  showToast('success', 'Cheque marcado como depositado. Al cobrarse se acreditará en la cuenta.');
                  setChequeADepositar(null);
                  const [resTabla, resKpis] = await Promise.all([
                    getChequesPaginado(estadoFiltro || undefined, pagina, ITEMS_PER_PAGE),
                    getChequesKPIs(),
                  ]);
                  setItems(resTabla.items);
                  setTotal(resTabla.total);
                  setKpis(resKpis);
                }}
                disabled={savingDeposito || loadingCuentasDeposito || !cuentaDepositoSelected || cuentasDeposito.length === 0}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingDeposito ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Confirmar depósito'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación: eliminar cheque */}
      {chequeAEliminar && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => !eliminandoCheque && setChequeAEliminar(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              Eliminar cheque
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              ¿Estás seguro de que deseas eliminar este cheque? Se eliminará también el cobro asociado.
            </p>
            <div className="mb-5 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Cheque en cartera
              </p>
              <p className="mt-0.5 font-mono text-sm font-medium text-slate-700">
                {chequeAEliminar.numero_cheque ?? '—'} · {chequeAEliminar.banco ?? '—'}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {formatCurrency(chequeAEliminar.monto ?? 0)}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => !eliminandoCheque && setChequeAEliminar(null)}
                disabled={eliminandoCheque}
                className="rounded-xl border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminacionCheque}
                disabled={eliminandoCheque}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {eliminandoCheque ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Eliminando…
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
