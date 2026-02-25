'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck, FileText, DollarSign, Weight, Scale,
  RefreshCw, AlertCircle, PackageSearch, CreditCard, Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FleteroBasico } from '@/app/fleteros/page';

// ── Tipos de filas de Supabase ────────────────────────────────────────────────
interface ViajeRow {
  id: number;
  fecha_salida: string | null;
  created_at: string;
  remito_nro: string | null;
  peso_llegada_cliente_kg: number | null;
  peso_salida_acopio_kg: number | null;
}

interface PagoRow {
  id: number;
  fecha: string | null;
  created_at: string;
  monto: number | null;
  metodo_pago: string | null;
  descripcion: string | null;
}

interface VaciosRow {
  id: number;
  fecha_movimiento: string | null;
  created_at: string;
  tipo_movimiento: string | null;  // INGRESO | SALIDA
  cantidad: number | null;
  envase_id: number | null;
}

// ── Fila unificada para la tabla ──────────────────────────────────────────────
type MovUnificado =
  | { tipo: 'VIAJE';  fecha: string; viaje:  ViajeRow;  kilos: number;  costo: number }
  | { tipo: 'PAGO';   fecha: string; pago:   PagoRow }
  | { tipo: 'VACIOS'; fecha: string; vacios: VaciosRow; tarifaViaje: number };

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  fleteros: FleteroBasico[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLocalDate(daysBack = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toLocaleDateString('en-CA');
}

function fmtMoneda(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtKilos(n: number): string {
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

function fmtFecha(iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return iso; }
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, valueClass = 'text-slate-900',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className={`text-xl font-bold leading-tight ${valueClass}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function LiquidacionFleterosClient({ fleteros }: Props) {
  const router = useRouter();

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [fleteroId, setFleteroId] = useState('');
  const [desde, setDesde] = useState(() => {
    const hoy = getLocalDate();
    return `${hoy.slice(0, 7)}-01`;
  });
  const [hasta, setHasta] = useState(() => getLocalDate());

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [viajes,        setViajes]        = useState<ViajeRow[]>([]);
  const [pagos,         setPagos]         = useState<PagoRow[]>([]);
  const [vaciosMovs,    setVaciosMovs]    = useState<VaciosRow[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [cargado,       setCargado]       = useState(false);

  const fleteroSel = fleteros.find(f => String(f.id) === fleteroId);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchDatos() {
    if (!fleteroId) return;
    setLoading(true);
    setError(null);

    const tsDesde = `${desde}T00:00:00.000-03:00`;
    const tsHasta = `${hasta}T23:59:59.999-03:00`;

    const [
      { data: viajesRaw,  error: errViajes  },
      { data: pagosRaw,   error: errPagos   },
      { data: vaciosRaw,  error: errVacios  },
    ] = await Promise.all([
      // ① Viajes de fruta conciliados
      supabase
        .from('Salidas_Fruta')
        .select('id, fecha_salida, created_at, remito_nro, peso_llegada_cliente_kg, peso_salida_acopio_kg')
        .eq('fletero_id', Number(fleteroId))
        .eq('estado_conciliacion', 'CONCILIADO')
        .gte('created_at', tsDesde)
        .lte('created_at', tsHasta)
        .order('fecha_salida', { ascending: true }),

      // ② Pagos realizados al fletero
      supabase
        .from('Movimientos_Financieros')
        .select('id, fecha, created_at, monto, metodo_pago, descripcion')
        .eq('fletero_id', Number(fleteroId))
        .eq('tipo', 'EGRESO')
        .gte('created_at', tsDesde)
        .lte('created_at', tsHasta)
        .order('fecha', { ascending: true }),

      // ③ Movimientos de envases vacíos con este fletero
      supabase
        .from('Movimientos_Envases')
        .select('id, fecha_movimiento, created_at, tipo_movimiento, cantidad, envase_id')
        .eq('fletero_id', Number(fleteroId))
        .gte('created_at', tsDesde)
        .lte('created_at', tsHasta)
        .order('fecha_movimiento', { ascending: true }),
    ]);

    setLoading(false);

    if (errViajes) { setError(errViajes.message); return; }
    if (errPagos)  { setError(errPagos.message);  return; }
    if (errVacios) { setError(errVacios.message);  return; }

    setViajes((viajesRaw   ?? []) as ViajeRow[]);
    setPagos((pagosRaw     ?? []) as PagoRow[]);
    setVaciosMovs((vaciosRaw ?? []) as VaciosRow[]);
    setCargado(true);
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const precioPorKg       = fleteroSel?.precio_por_kg       ?? 0;
  const tarifaVacios      = fleteroSel?.precio_viaje_vacios ?? 0;

  const kilosTotales      = viajes.reduce((s, v) =>
    s + Number(v.peso_llegada_cliente_kg ?? v.peso_salida_acopio_kg ?? 0), 0);

  const valorViajes       = kilosTotales * precioPorKg;
  const valorVacios       = vaciosMovs.length * tarifaVacios;
  const valorGenerado     = valorViajes + valorVacios;
  const dineroPagado      = pagos.reduce((s, p) => s + Number(p.monto ?? 0), 0);
  const saldoPeriodo      = valorGenerado - dineroPagado;

  // ── Tabla unificada ───────────────────────────────────────────────────────
  const movimientos: MovUnificado[] = [
    ...viajes.map<MovUnificado>(v => {
      const kg = Number(v.peso_llegada_cliente_kg ?? v.peso_salida_acopio_kg ?? 0);
      return { tipo: 'VIAJE', fecha: v.fecha_salida ?? v.created_at.slice(0, 10), viaje: v, kilos: kg, costo: kg * precioPorKg };
    }),
    ...pagos.map<MovUnificado>(p => ({
      tipo: 'PAGO', fecha: p.fecha ?? p.created_at.slice(0, 10), pago: p,
    })),
    ...vaciosMovs.map<MovUnificado>(m => ({
      tipo: 'VACIOS', fecha: m.fecha_movimiento ?? m.created_at.slice(0, 10), vacios: m, tarifaViaje: tarifaVacios,
    })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ── PDF Export ────────────────────────────────────────────────────────────
  async function exportarPDF() {
    if (!fleteroSel || movimientos.length === 0) return;

    const { default: jsPDF }     = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('landscape');

    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(`Liquidación de Fletes — ${fleteroSel.nombre ?? ''}`, 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Período: ${fmtFecha(desde)} al ${fmtFecha(hasta)}   ·   Flete fruta: ${fmtMoneda(precioPorKg)}/kg   ·   Tarifa vacíos: ${fmtMoneda(tarifaVacios)}/viaje`,
      14, 26,
    );

    const head = [['Fecha', 'Tipo', 'Detalle', 'Kilos', 'Importe']];

    const body = movimientos.map(m => {
      if (m.tipo === 'VIAJE') {
        return [fmtFecha(m.fecha), 'Viaje fruta', m.viaje.remito_nro ?? '—', fmtKilos(m.kilos), fmtMoneda(m.costo)];
      } else if (m.tipo === 'VACIOS') {
        const cant = m.vacios.cantidad ?? 0;
        const dir  = m.vacios.tipo_movimiento === 'INGRESO' ? 'Retiro' : 'Entrega';
        return [fmtFecha(m.fecha), 'Flete vacíos', `${dir} · ${cant} und.`, '—', fmtMoneda(m.tarifaViaje)];
      } else {
        return [fmtFecha(m.fecha), 'Pago', m.pago.metodo_pago ?? (m.pago.descripcion ?? '—'), '—', fmtMoneda(Number(m.pago.monto ?? 0))];
      }
    });

    const foot = [[
      '', 'TOTALES',
      `${viajes.length} viajes · ${vaciosMovs.length} vac.`,
      fmtKilos(kilosTotales),
      fmtMoneda(valorGenerado),
    ]];

    autoTable(doc, {
      head, body, foot,
      startY: 32,
      theme: 'grid',
      styles: { halign: 'center', valign: 'middle', fontSize: 9, cellPadding: { top: 3.5, right: 6, bottom: 3.5, left: 6 }, lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: [236, 253, 245], textColor: [13, 92, 76], fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 28 } },
      didDrawPage: (data) => {
        const pageCount = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 8);
      },
    });

    doc.save(`liquidacion_${(fleteroSel.nombre ?? 'fletero').replace(/\s+/g, '_')}_${desde}.pdf`);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Fletero</label>
          <select
            value={fleteroId}
            onChange={e => { setFleteroId(e.target.value); setCargado(false); }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
          >
            <option value="">— Seleccioná un fletero —</option>
            {fleteros.map(f => (
              <option key={f.id} value={f.id}>
                {f.nombre ?? '(sin nombre)'}
                {f.precio_por_kg ? ` · ${fmtMoneda(f.precio_por_kg)}/kg` : ''}
                {f.precio_viaje_vacios ? ` · ${fmtMoneda(f.precio_viaje_vacios)}/viaje vacíos` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100" />
        </div>

        <button
          onClick={fetchDatos}
          disabled={!fleteroId || loading || !desde || !hasta || desde > hasta}
          className="flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Aplicar
        </button>

        {fleteroId && (
          <button
            onClick={() => router.push(`/cobros-pagos?fleteroId=${fleteroId}`)}
            className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <CreditCard className="h-4 w-4" />
            Pagar a Fletero
          </button>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Placeholder sin fletero ───────────────────────────────────────── */}
      {!fleteroId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-24">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Truck className="h-7 w-7 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Seleccioná un fletero para comenzar</p>
          <p className="mt-1 text-xs text-slate-400">Elegí un transportista del selector y aplicá el filtro</p>
        </div>
      )}

      {/* ── Dashboard ────────────────────────────────────────────────────── */}
      {cargado && fleteroSel && (
        <>
          {/* KPI Cards — 4 columnas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Kilos Transportados"
              value={fmtKilos(kilosTotales)}
              sub={`${viajes.length} viaje${viajes.length !== 1 ? 's' : ''} de fruta conciliados`}
              icon={Weight}
            />
            <KpiCard
              label="Valor Generado"
              value={fmtMoneda(valorGenerado)}
              sub={`${fmtMoneda(valorViajes)} fruta + ${fmtMoneda(valorVacios)} vacíos`}
              icon={Truck}
              valueClass="text-slate-800"
            />
            <KpiCard
              label="Dinero Pagado"
              value={fmtMoneda(dineroPagado)}
              sub={`${pagos.length} pago${pagos.length !== 1 ? 's' : ''} realizados`}
              icon={DollarSign}
              valueClass="text-emerald-700"
            />
            <KpiCard
              label="Saldo del Período"
              value={saldoPeriodo === 0 ? 'Saldado' : fmtMoneda(Math.abs(saldoPeriodo))}
              sub={
                saldoPeriodo > 0  ? `Debemos ${fmtMoneda(saldoPeriodo)} al fletero` :
                saldoPeriodo < 0  ? `Pagado de más: ${fmtMoneda(Math.abs(saldoPeriodo))}` :
                'Sin saldo pendiente'
              }
              icon={Scale}
              valueClass={saldoPeriodo > 0 ? 'text-red-700' : saldoPeriodo < 0 ? 'text-amber-700' : 'text-emerald-700'}
            />
          </div>

          {/* Leyenda de tarifas */}
          {tarifaVacios > 0 && vaciosMovs.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-700">
              <Package className="h-4 w-4 flex-shrink-0" />
              <span>
                <strong>{vaciosMovs.length} viaje{vaciosMovs.length !== 1 ? 's' : ''} de vacíos</strong> × {fmtMoneda(tarifaVacios)}/viaje = {fmtMoneda(valorVacios)} (tarifa plana logística inversa)
              </span>
            </div>
          )}

          {/* ── Tabla unificada ──────────────────────────────────────────── */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-800">Detalle de Movimientos</p>
                <p className="text-xs text-slate-400">
                  {movimientos.length} registro{movimientos.length !== 1 ? 's' : ''} en el período
                  {' · '}
                  <span className="text-slate-500">{viajes.length} viajes · {vaciosMovs.length} vacíos · {pagos.length} pagos</span>
                </p>
              </div>
              <button
                onClick={exportarPDF}
                disabled={movimientos.length === 0}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-3.5 w-3.5" />
                Exportar PDF
              </button>
            </div>

            {movimientos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <PackageSearch className="mb-3 h-12 w-12 text-slate-200" />
                <p className="text-sm font-medium text-slate-500">Sin movimientos en este período</p>
                <p className="mt-1 text-xs text-slate-400">
                  No hay viajes, movimientos de vacíos ni pagos registrados para el rango seleccionado
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Detalle</th>
                    <th className="px-4 py-3 text-right">Kilos</th>
                    <th className="px-4 py-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movimientos.map((m, i) => {
                    const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';

                    if (m.tipo === 'VIAJE') {
                      return (
                        <tr key={`v-${m.viaje.id}`} className={rowBg}>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{fmtFecha(m.fecha)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                              <Truck className="h-3 w-3" />
                              Viaje fruta
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {m.viaje.remito_nro
                              ? <span>Remito <span className="font-mono font-semibold">{m.viaje.remito_nro}</span></span>
                              : <span className="text-slate-400">Sin remito</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">{fmtKilos(m.kilos)}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{fmtMoneda(m.costo)}</td>
                        </tr>
                      );
                    }

                    if (m.tipo === 'VACIOS') {
                      const cant = m.vacios.cantidad ?? 0;
                      const dir  = m.vacios.tipo_movimiento === 'INGRESO' ? 'Retiro vacíos' : 'Entrega vacíos';
                      return (
                        <tr key={`vac-${m.vacios.id}`} className={rowBg}>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{fmtFecha(m.fecha)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                              <Package className="h-3 w-3" />
                              Flete vacíos
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {dir}
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                              {cant} unidades
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400">—</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-sky-700">
                            {fmtMoneda(m.tarifaViaje)}
                          </td>
                        </tr>
                      );
                    }

                    // PAGO
                    return (
                      <tr key={`p-${m.pago.id}`} className={rowBg}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{fmtFecha(m.fecha)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            <DollarSign className="h-3 w-3" />
                            Pago
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {m.pago.metodo_pago && (
                            <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{m.pago.metodo_pago}</span>
                          )}
                          {m.pago.descripcion ?? <span className="text-slate-400">Sin descripción</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">—</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                          {fmtMoneda(Number(m.pago.monto ?? 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* tfoot con totales */}
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Total devengado (fruta + vacíos)
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{fmtKilos(kilosTotales)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">{fmtMoneda(valorGenerado)}</td>
                  </tr>
                  <tr className="bg-white">
                    <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Total pagado al fletero
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{fmtMoneda(dineroPagado)}</td>
                  </tr>
                  <tr className={`border-t border-slate-200 ${saldoPeriodo > 0 ? 'bg-red-50/50' : 'bg-emerald-50/50'}`}>
                    <td colSpan={3} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${saldoPeriodo > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {saldoPeriodo > 0 ? '⚠ Saldo pendiente (deuda)' : saldoPeriodo < 0 ? 'Pagado de más' : '✓ Cuenta saldada'}
                    </td>
                    <td className="px-4 py-3" />
                    <td className={`px-4 py-3 text-right font-mono text-lg font-bold ${saldoPeriodo > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {saldoPeriodo === 0 ? '—' : fmtMoneda(Math.abs(saldoPeriodo))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
