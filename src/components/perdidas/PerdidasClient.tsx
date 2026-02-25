'use client';

import { useState } from 'react';
import { Calendar, User, FileDown, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getPerdidasFiltradas, getPerdidasKPIs } from '@/app/perdidas/actions';
import type { PerdidasKPIsResult } from '@/app/perdidas/actions';

// ── Tipos ────────────────────────────────────────────────────────────────────
export type FilaPerdida = {
  salidaId: number;
  fecha: string;
  clienteId: number;
  clienteNombre: string;
  productoId: number;
  productoNombre: string;
  kilosSalida: number;
  kilosMerma: number;
  descuentoCalidadKg: number;
  totalPerdidoKg: number;
  valorMonetizado: number;
};

type ClienteOption = { id: number; nombre: string };

const ITEMS_PER_PAGE = 50;

interface Props {
  filas: FilaPerdida[];
  total: number;
  kpis: PerdidasKPIsResult;
  clientes: ClienteOption[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtKg(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function principalMotivoFromKpis(kpis: PerdidasKPIsResult): string {
  const { sumaMerma, sumaDescuentoCalidad } = kpis;
  if (sumaMerma >= sumaDescuentoCalidad) return 'Merma';
  if (sumaDescuentoCalidad > 0) return 'Descuento por calidad';
  return 'Sin datos';
}

export default function PerdidasClient({ filas: filasIniciales, total: totalInicial, kpis: kpisIniciales, clientes }: Props) {
  const [filas, setFilas] = useState<FilaPerdida[]>(filasIniciales);
  const [totalItems, setTotalItems] = useState(totalInicial);
  const [currentPage, setCurrentPage] = useState(1);
  const [kpis, setKpis] = useState<PerdidasKPIsResult>(kpisIniciales);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  const aplicarFiltros = async () => {
    setLoading(true);
    try {
      const [resultTabla, resultKpis] = await Promise.all([
        getPerdidasFiltradas(desde || undefined, hasta || undefined, clienteId === '' ? undefined : clienteId, 1, ITEMS_PER_PAGE),
        getPerdidasKPIs(desde || undefined, hasta || undefined, clienteId === '' ? undefined : clienteId),
      ]);
      setFilas(resultTabla.filas);
      setTotalItems(resultTabla.total);
      setCurrentPage(1);
      setKpis(resultKpis);
    } finally {
      setLoading(false);
    }
  };

  const irAPagina = async (page: number) => {
    if (page < 1 || page > totalPages) return;
    setLoadingPage(true);
    try {
      const result = await getPerdidasFiltradas(
        desde || undefined,
        hasta || undefined,
        clienteId === '' ? undefined : clienteId,
        page,
        ITEMS_PER_PAGE
      );
      setFilas(result.filas);
      setCurrentPage(page);
    } finally {
      setLoadingPage(false);
    }
  };

  const principalMotivo = principalMotivoFromKpis(kpis);

  const exportarPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(153, 27, 27);
    doc.text('Informe de Pérdidas — Análisis de Merma y Calidad', 14, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Período: ${desde || '—'}  al  ${hasta || '—'}  ·  Página ${currentPage}  ·  Generado: ${new Date().toLocaleString('es-AR')}`, 14, 26);

    autoTable(doc, {
      startY: 32,
      theme: 'grid',
      headStyles: {
        fillColor: [254, 226, 226],
        textColor: [153, 27, 27],
        fontStyle: 'bold',
      },
      head: [[
        'Fecha',
        'Cliente',
        'Producto',
        'Kilos Salida',
        'Kilos Merma',
        'Descuento Calidad',
        'Total Perdido (kg)',
        'Valor ($)',
      ]],
      body: filas.map(f => [
        f.fecha,
        f.clienteNombre,
        f.productoNombre,
        fmtKg(f.kilosSalida),
        fmtKg(f.kilosMerma),
        fmtKg(f.descuentoCalidadKg),
        fmtKg(f.totalPerdidoKg),
        fmtMoney(f.valorMonetizado),
      ]),
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 24 },
        4: { cellWidth: 24 },
        5: { cellWidth: 28 },
        6: { cellWidth: 26 },
        7: { cellWidth: 28 },
      },
    });

    doc.save(`informe-perdidas-${desde || 'todo'}-${hasta || 'hoy'}-p${currentPage}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <label className="text-sm font-medium text-slate-600">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-200"
          />
        </div>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-slate-400" />
          <label className="text-sm font-medium text-slate-600">Cliente</label>
          <select
            value={clienteId === '' ? '' : clienteId}
            onChange={e => setClienteId(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-200"
          >
            <option value="">Todos</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={aplicarFiltros}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Cargando…' : 'Aplicar'}
        </button>
      </div>

      {/* ── KPI Cards (datos globales independientes de la página) ────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Kilos Totales Perdidos</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{fmtKg(kpis.kilosTotalesPerdidos)} kg</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Pérdida Monetizada</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{fmtMoney(kpis.perdidaMonetizada)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Principal Motivo</p>
          <p className="mt-1 text-xl font-bold text-slate-800">{principalMotivo}</p>
        </div>
      </div>

      {/* ── Tabla + paginación + PDF ────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Detalle por salida</h2>
          <button
            type="button"
            onClick={exportarPDF}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            <FileDown className="h-4 w-4" />
            Exportar Informe PDF
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 font-semibold text-slate-600">Fecha</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Cliente</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Producto</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Kilos Salida</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Kilos Merma</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Descuento Calidad</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Total Perdido (kg)</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Valor Monetizado ($)</th>
              </tr>
            </thead>
            <tbody>
              {loadingPage ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filas.map(f => (
                  <tr key={f.salidaId} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-700">{f.fecha}</td>
                    <td className="px-4 py-3 text-slate-700">{f.clienteNombre}</td>
                    <td className="px-4 py-3 text-slate-700">{f.productoNombre}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtKg(f.kilosSalida)}</td>
                    <td className="px-4 py-3 text-red-600">{fmtKg(f.kilosMerma)}</td>
                    <td className="px-4 py-3 text-red-600">{fmtKg(f.descuentoCalidadKg)}</td>
                    <td className="px-4 py-3 font-medium text-red-700">{fmtKg(f.totalPerdidoKg)}</td>
                    <td className="px-4 py-3 font-medium text-red-800">{fmtMoney(f.valorMonetizado)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Controles de paginación (Private Banking) ──────────────────────── */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-sm text-slate-500">
              Página <span className="font-medium text-slate-700">{currentPage}</span> de <span className="font-medium text-slate-700">{totalPages}</span>
              {totalItems > ITEMS_PER_PAGE && (
                <span className="ml-2"> · {totalItems.toLocaleString('es-AR')} registros</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => irAPagina(currentPage - 1)}
                disabled={currentPage <= 1 || loadingPage}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => irAPagina(currentPage + 1)}
                disabled={currentPage >= totalPages || loadingPage}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
