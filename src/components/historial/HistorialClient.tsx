'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Leaf, Truck, CheckCircle2, TrendingUp, TrendingDown,
  Sliders, RefreshCw, Clock, PackageSearch,
  Trash2, AlertTriangle, Loader2, ArrowLeftRight, Printer,
} from 'lucide-react';
import { eliminarRegistroHistorial, getDatosReimpresionIngreso } from '@/app/historial/actions';
import { generarRemitoIngresoPdf } from '@/components/movimiento/remitoIngresoPdf';

// ── Tipos exportados ──────────────────────────────────────────────────────────
export type TipoEvento =
  | 'INGRESO_FRUTA'
  | 'SALIDA_FRUTA'
  | 'CONCILIACION'
  | 'COBRO'
  | 'PAGO'
  | 'AJUSTE_STOCK'
  | 'MOVIMIENTO_INTERNO';

export interface EventoHistorial {
  id: string;
  /** ID numérico en la tabla origen — necesario para el borrado desde el historial */
  idOrigen: number;
  created_at: string | null;
  tipo: TipoEvento;
  entidad: string;
  detalle: string;
  monto?: number;
  href: string;
}

interface Props {
  eventos: EventoHistorial[];
  desdeInicial: string;
  hastaInicial: string;
  paginaActual: number;
  totalPaginas: number;
  totalEventos: number;
}

// ── Config visual por tipo de evento ─────────────────────────────────────────
const TIPO_CONFIG: Record<TipoEvento, {
  label: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  badge: string;
}> = {
  INGRESO_FRUTA: {
    label: 'Ingreso Fruta',
    icon: Leaf,
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
  },
  SALIDA_FRUTA: {
    label: 'Salida Fruta',
    icon: Truck,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
  },
  CONCILIACION: {
    label: 'Conciliación',
    icon: CheckCircle2,
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-700',
  },
  COBRO: {
    label: 'Cobro',
    icon: TrendingUp,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  PAGO: {
    label: 'Pago',
    icon: TrendingDown,
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
    badge: 'bg-orange-100 text-orange-700',
  },
  AJUSTE_STOCK: {
    label: 'Ajuste Stock',
    icon: Sliders,
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-500',
    badge: 'bg-gray-100 text-gray-600',
  },
  MOVIMIENTO_INTERNO: {
    label: 'Mov. interno',
    icon: ArrowLeftRight,
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    badge: 'bg-sky-100 text-sky-700',
  },
};

// ── Helpers de formato ────────────────────────────────────────────────────────
function fmtTime(iso: string | null): string {
  if (!iso) return '--:--';
  try {
    // Locale 'es-AR', hour12: false y timeZone fijos → mismo resultado en servidor y cliente.
    // Sin esto, Node (UTC) y el navegador (Argentina -3, formato 12h) producen strings distintos
    // y React lanza el error de hidratación.
    return new Date(iso).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  } catch {
    return '--:--';
  }
}

function fmtDayHeader(isoDate: string): string {
  try {
    const d = new Date(isoDate + 'T12:00:00'); // forzar mediodía para evitar desfase TZ en el día
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  } catch {
    return isoDate;
  }
}

/** Extrae "YYYY-MM-DD" de un ISO timestamp. */
function isoToDate(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

// ── Resumen de conteos por tipo ───────────────────────────────────────────────
function ResumenBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {count} {label}
    </span>
  );
}

// ── Helper de fecha local robusto ─────────────────────────────────────────────
/**
 * Devuelve "YYYY-MM-DD" según el timezone LOCAL del navegador,
 * restando opcionalmente N días. 'en-CA' usa el formato YYYY-MM-DD exacto.
 * Es más robusto que manipular manualmente año/mes/día porque el navegador
 * aplica correctamente el DST y el offset de zona horaria.
 */
function getLocalISODate(daysToSubtract = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysToSubtract);
  return d.toLocaleDateString('en-CA'); // Siempre "YYYY-MM-DD"
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function HistorialClient({
  eventos,
  desdeInicial,
  hastaInicial,
  paginaActual,
  totalPaginas,
  totalEventos,
}: Props) {
  const router = useRouter();
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  const [isApplying, setIsApplying] = useState(false);
  const pendingFiltroRef = useRef<{ desde: string; hasta: string } | null>(null);

  // ── Modal de confirmación de borrado (sin optimistic UI: la fila solo desaparece tras éxito) ─
  const [eventoAEliminar, setEventoAEliminar] = useState<EventoHistorial | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // Toast para errores de eliminación (evitar fallos silenciosos)
  const [toast, setToast] = useState<{ type: 'error'; msg: string } | null>(null);
  function showToastError(msg: string) {
    setToast({ type: 'error', msg });
    setTimeout(() => setToast(null), 5000);
  }

  // Reimpresión Remito de Ingreso
  const [reimprimiendoId, setReimprimiendoId] = useState<number | null>(null);
  async function handleReimprimirRemitoIngreso(idOrigen: number) {
    setReimprimiendoId(idOrigen);
    try {
      const { data, error } = await getDatosReimpresionIngreso(idOrigen);
      if (error || !data) {
        showToastError(error ?? 'No se pudieron obtener los datos.');
        return;
      }
      await generarRemitoIngresoPdf({
        ...data,
        empresaNombre: data.empresaNombre,
      });
    } catch (e) {
      showToastError(e instanceof Error ? e.message : 'Error al generar el PDF.');
    } finally {
      setReimprimiendoId(null);
    }
  }

  async function confirmarEliminacion() {
    if (!eventoAEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    const { error } = await eliminarRegistroHistorial(eventoAEliminar.idOrigen, eventoAEliminar.tipo);
    setEliminando(false);
    if (error) {
      setErrorEliminar(error);
      showToastError(error);
      return;
    }
    setEventoAEliminar(null);
    router.refresh();
  }

  // Sincronizar inputs cuando el servidor re-renderiza con nuevas props (cambio de URL)
  useEffect(() => {
    setDesde(desdeInicial);
    setHasta(hastaInicial);
  }, [desdeInicial, hastaInicial]);

  // Quitar isApplying cuando la URL refleja el filtro solicitado (evita spam de clics)
  useEffect(() => {
    if (isApplying && pendingFiltroRef.current && desdeInicial === pendingFiltroRef.current.desde && hastaInicial === pendingFiltroRef.current.hasta) {
      pendingFiltroRef.current = null;
      setIsApplying(false);
    }
  }, [desdeInicial, hastaInicial, isApplying]);

  // Aplicar filtro de fechas (siempre a página 1) con estado de carga
  function handleAplicar() {
    if (!desde || !hasta || desde > hasta) return;
    pendingFiltroRef.current = { desde, hasta };
    setIsApplying(true);
    router.push(`/historial?desde=${desde}&hasta=${hasta}&pagina=1`);
    router.refresh();
  }

  // ── Filtrar por tipo (opcional) ───────────────────────────────────────────
  const [tipoFiltro, setTipoFiltro] = useState<TipoEvento | 'TODOS'>('TODOS');
  const eventosFiltrados = tipoFiltro === 'TODOS'
    ? eventos
    : eventos.filter(e => e.tipo === tipoFiltro);

  // ── Agrupar por día ───────────────────────────────────────────────────────
  const porDia = new Map<string, EventoHistorial[]>();
  for (const ev of eventosFiltrados) {
    const dia = isoToDate(ev.created_at);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(ev);
  }
  // Ordenar días descendente
  const diasOrdenados = [...porDia.entries()].sort(([a], [b]) => b.localeCompare(a));

  // ── Conteos para resumen ──────────────────────────────────────────────────
  const conteos = {
    INGRESO_FRUTA: eventos.filter(e => e.tipo === 'INGRESO_FRUTA').length,
    SALIDA_FRUTA: eventos.filter(e => e.tipo === 'SALIDA_FRUTA').length,
    CONCILIACION: eventos.filter(e => e.tipo === 'CONCILIACION').length,
    COBRO: eventos.filter(e => e.tipo === 'COBRO').length,
    PAGO: eventos.filter(e => e.tipo === 'PAGO').length,
    AJUSTE_STOCK: eventos.filter(e => e.tipo === 'AJUSTE_STOCK').length,
    MOVIMIENTO_INTERNO: eventos.filter(e => e.tipo === 'MOVIMIENTO_INTERNO').length,
  };

  // Comparar contra fecha LOCAL (no UTC) para evitar desfase en Argentina (-3h)
  const esHoy = desdeInicial === hastaInicial && desdeInicial === getLocalISODate(0);

  return (
    <>
    <div className="space-y-5">
      {/* Toast de error (eliminación fallida) — la fila permanece visible */}
      {toast && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* ── Barra de filtros ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Hasta
          </label>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </div>
        <button
          onClick={handleAplicar}
          disabled={!desde || !hasta || desde > hasta || isApplying}
          className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isApplying ? 'Aplicando…' : 'Aplicar'}
        </button>

        {/* Atajos rápidos */}
        <div className="flex gap-2">
          {[
            { label: 'Hoy',    desdeOffset: 0, hastaOffset: 0 },
            { label: 'Ayer',   desdeOffset: 1, hastaOffset: 1 },
            { label: '7 días', desdeOffset: 7, hastaOffset: 0 },
          ].map(({ label, desdeOffset, hastaOffset }) => (
            <button
              key={label}
              onClick={() => {
                // getLocalISODate usa 'en-CA' → YYYY-MM-DD respetando el TZ local del navegador
                const startDate = getLocalISODate(desdeOffset);
                const endDate   = getLocalISODate(hastaOffset);
                // 1. Actualizar los inputs visualmente
                setDesde(startDate);
                setHasta(endDate);
                // 2. Navegar + invalidar caché del router; pagina=1 por ser nuevo rango
                router.push(`/historial?desde=${startDate}&hasta=${endDate}&pagina=1`);
                router.refresh();
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-gray-400">
          {totalEventos} evento{totalEventos !== 1 ? 's' : ''} encontrado{totalEventos !== 1 ? 's' : ''}
          {totalPaginas > 1 && (
            <span className="ml-1 text-gray-400">
              · pág. {paginaActual}/{totalPaginas}
            </span>
          )}
          {esHoy && <span className="ml-1 font-semibold text-green-600">· Hoy</span>}
        </div>
      </div>

      {/* ── Resumen de conteos + filtro por tipo ─────────────────────────── */}
      {eventos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setTipoFiltro('TODOS');
              router.push(`/historial?desde=${desdeInicial}&hasta=${hastaInicial}&pagina=1`);
              router.refresh();
            }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              tipoFiltro === 'TODOS'
                ? 'bg-slate-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos ({eventos.length})
          </button>

          {(Object.entries(conteos) as [TipoEvento, number][])
            .filter(([, count]) => count > 0)
            .map(([tipo, count]) => {
              const cfg = TIPO_CONFIG[tipo];
              const isActive = tipoFiltro === tipo;
              return (
                <button
                  key={tipo}
                  onClick={() => {
                    setTipoFiltro(isActive ? 'TODOS' : tipo);
                    router.push(`/historial?desde=${desdeInicial}&hasta=${hastaInicial}&pagina=1`);
                    router.refresh();
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    isActive
                      ? cfg.badge.replace('bg-', 'ring-1 ring-inset ring-') + ' ' + cfg.badge
                      : cfg.badge + ' opacity-70 hover:opacity-100'
                  }`}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      {eventos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-24">
          <PackageSearch className="mb-4 h-14 w-14 text-gray-200" />
          <p className="text-sm font-semibold text-gray-600">Sin operaciones en este rango</p>
          <p className="mt-1 text-xs text-gray-400">
            Probá seleccionando otro rango de fechas o verificá que los registros tengan{' '}
            <code className="rounded bg-gray-100 px-1">created_at</code> dentro del período.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {diasOrdenados.map(([dia, evDia]) => (
            <div key={dia}>
              {/* Separador de día */}
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 shadow-sm">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">
                    {fmtDayHeader(dia)}
                  </span>
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-500">
                    {evDia.length}
                  </span>
                </div>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Eventos del día */}
              <div className="relative ml-4">
                {/* Línea vertical de la timeline */}
                <div className="absolute left-[2.75rem] top-0 h-full w-px bg-gray-200" />

                <div className="space-y-3">
                  {evDia.map((ev, idx) => {
                    const cfg = TIPO_CONFIG[ev.tipo];
                    const Icon = cfg.icon;
                    const isLast = idx === evDia.length - 1;

                    return (
                      <div key={ev.id} className="relative flex items-start gap-0">
                        {/* Columna de hora */}
                        <div className="w-[3.5rem] flex-shrink-0 pt-2.5 text-right">
                          <span className="text-xs font-mono font-medium text-gray-400">
                            {fmtTime(ev.created_at)}
                          </span>
                        </div>

                        {/* Nodo del timeline */}
                        <div className="relative z-10 mx-3 flex-shrink-0">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${cfg.iconBg} ring-2 ring-white`}
                          >
                            <Icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                          </div>
                          {/* Conector hacia abajo (excepto último) */}
                          {!isLast && (
                            <div className="absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-gray-200" />
                          )}
                        </div>

                        {/* Tarjeta del evento */}
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="group rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {/* Tipo badge + entidad */}
                                <div className="mb-1 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.badge}`}
                                  >
                                    {cfg.label}
                                  </span>
                                  <span className="font-semibold text-gray-900 truncate">
                                    {ev.entidad}
                                  </span>
                                </div>

                                {/* Detalle */}
                                <p className="text-xs text-gray-500 leading-relaxed">
                                  {ev.detalle}
                                </p>

                                {/* Monto destacado (cobros/pagos) */}
                                {ev.monto != null && (ev.tipo === 'COBRO' || ev.tipo === 'PAGO' || ev.tipo === 'CONCILIACION') && (
                                  <p className={`mt-1 text-sm font-bold ${
                                    ev.tipo === 'COBRO' ? 'text-emerald-600'
                                    : ev.tipo === 'PAGO' ? 'text-orange-600'
                                    : 'text-purple-600'
                                  }`}>
                                    {ev.tipo === 'PAGO' ? '-' : '+'}
                                    ${Number(ev.monto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                )}
                              </div>

                              {/* Acciones: reimprimir remito (solo ingreso) + eliminar */}
                              <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                {ev.tipo === 'INGRESO_FRUTA' && (
                                  <button
                                    onClick={() => handleReimprimirRemitoIngreso(ev.idOrigen)}
                                    disabled={reimprimiendoId !== null}
                                    title="Imprimir Remito de Ingreso"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-green-50 hover:text-green-600 disabled:opacity-50"
                                  >
                                    {reimprimiendoId === ev.idOrigen ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Printer className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                                <button
                                  onClick={() => { setEventoAEliminar(ev); setErrorEliminar(null); }}
                                  title="Eliminar registro"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Footer: resumen + paginación ────────────────────────────────── */}
      <div className="space-y-3">
        {/* Resumen de tipos (sobre la página actual) */}
        {eventosFiltrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-400">
            <ResumenBadge label="ingresos" count={conteos.INGRESO_FRUTA} color="bg-green-100 text-green-700" />
            <ResumenBadge label="salidas" count={conteos.SALIDA_FRUTA} color="bg-blue-100 text-blue-700" />
            <ResumenBadge label="conciliaciones" count={conteos.CONCILIACION} color="bg-purple-100 text-purple-700" />
            <ResumenBadge label="cobros" count={conteos.COBRO} color="bg-emerald-100 text-emerald-700" />
            <ResumenBadge label="pagos" count={conteos.PAGO} color="bg-orange-100 text-orange-700" />
            <ResumenBadge label="ajustes" count={conteos.AJUSTE_STOCK} color="bg-gray-200 text-gray-600" />
            <ResumenBadge label="mov. interno" count={conteos.MOVIMIENTO_INTERNO} color="bg-sky-100 text-sky-700" />
          </div>
        )}

        {/* Controles de paginación (mismo estilo que Envases/Bines) */}
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-500">
            Página{' '}
            <span className="font-medium text-slate-700">{paginaActual}</span>
            {' '}de{' '}
            <span className="font-medium text-slate-700">{totalPaginas}</span>
            <span className="ml-2 text-xs text-slate-400">({totalEventos} eventos en total)</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                router.push(`/historial?desde=${desdeInicial}&hasta=${hastaInicial}&pagina=${paginaActual - 1}`);
                router.refresh();
              }}
              disabled={paginaActual <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() => {
                router.push(`/historial?desde=${desdeInicial}&hasta=${hastaInicial}&pagina=${paginaActual + 1}`);
                router.refresh();
              }}
              disabled={paginaActual >= totalPaginas}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* ── Modal de confirmación de borrado ─────────────────────────────────── */}
    {eventoAEliminar && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
        onClick={() => !eliminando && setEventoAEliminar(null)}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Ícono */}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>

          {/* Título */}
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            Eliminar Registro
          </h2>

          {/* Descripción */}
          <p className="mb-1 text-sm text-slate-500">
            ¿Estás seguro de eliminar este registro? Esta acción es irreversible
            en la interfaz, pero quedará respaldada en la bóveda de auditoría.
          </p>

          {/* Detalle del registro a eliminar */}
          <div className="mb-5 mt-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {eventoAEliminar.tipo.replace('_', ' ')}
            </p>
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              {eventoAEliminar.entidad}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
              {eventoAEliminar.detalle}
            </p>
          </div>

          {/* Error inline */}
          {errorEliminar && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              Error: {errorEliminar}
            </p>
          )}

          {/* Botones */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setEventoAEliminar(null)}
              disabled={eliminando}
              className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarEliminacion}
              disabled={eliminando}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {eliminando && <Loader2 className="h-4 w-4 animate-spin" />}
              {eliminando ? 'Eliminando…' : 'Eliminar Definitivamente'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
