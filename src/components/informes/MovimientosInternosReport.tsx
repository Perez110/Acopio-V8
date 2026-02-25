'use client';

import { useState, useTransition } from 'react';
import { RefreshCw, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  getInformeMovimientosInternos,
  type RowMovimientoInterno,
} from '@/app/informes/actions';

const MAX_DIAS = 180;

function getDefaultDates(): { desde: string; hasta: string } {
  const now = new Date();
  const hasta = now.toISOString().slice(0, 10);
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  const desde = d.toISOString().slice(0, 10);
  return { desde, hasta };
}

function fmtCurrency(n: number): string {
  return `$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pdfMoney(n: number): string {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${abs}`;
}

async function exportPDF(
  rows: RowMovimientoInterno[],
  desde: string,
  hasta: string,
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Reporte de Movimientos Internos', 14, 18);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Rango: ${desde}  al  ${hasta}`, 14, 26);

  const totalTransferido = rows.reduce((s, r) => s + r.monto, 0);
  const body = rows.map(r => [
    r.fecha,
    r.cuentaOrigen,
    r.cuentaDestino,
    r.descripcion,
    pdfMoney(r.monto),
  ]);

  autoTable(doc, {
    margin: { top: 30, right: 15, bottom: 30, left: 15 },
    tableWidth: 'auto',
    startY: 38,
    head: [['Fecha', 'Cuenta Origen', 'Cuenta Destino', 'Descripción', 'Monto']],
    body: [...body, ['', '', '', 'TOTAL TRANSFERIDO', pdfMoney(totalTransferido)]],
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: { top: 3.5, right: 6, bottom: 3.5, left: 6 },
      overflow: 'linebreak',
      textColor: [51, 65, 85],
      halign: 'center',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [236, 253, 245],
      textColor: [13, 92, 76],
      fontSize: 9,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 30, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 30, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length && data.column.index === 4) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
      if (data.row.index === body.length && data.column.index === 3) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  const totalPags = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 170);
    doc.text(
      `Página ${i} de ${totalPags}  |  Sistema de Acopio`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' },
    );
  }

  doc.save(`reporte_movimientos_internos_${desde}_${hasta}.pdf`);
}

export default function MovimientosInternosReport() {
  const { desde: d0, hasta: h0 } = getDefaultDates();
  const [desde, setDesde] = useState(d0);
  const [hasta, setHasta] = useState(h0);
  const [rows, setRows] = useState<RowMovimientoInterno[] | null>(null);
  const [toast, setToast] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleGenerar = () => {
    if (!desde || !hasta) {
      setToast({ type: 'error', msg: 'Completá las fechas Desde y Hasta.' });
      return;
    }
    if (desde > hasta) {
      setToast({ type: 'error', msg: 'La fecha Desde no puede ser mayor que Hasta.' });
      return;
    }
    const diff = (new Date(hasta).getTime() - new Date(desde).getTime()) / (1000 * 60 * 60 * 24);
    if (diff > MAX_DIAS) {
      setToast({
        type: 'error',
        msg: 'Por rendimiento, el rango máximo para exportar en PDF es de 6 meses.',
      });
      return;
    }
    setToast(null);
    startTransition(async () => {
      const result = await getInformeMovimientosInternos(desde, hasta);
      if (result.error) {
        setToast({ type: 'error', msg: result.error });
        setRows(null);
        return;
      }
      setRows(result.data);
      setToast({ type: 'success', msg: `Se encontraron ${result.data.length} movimiento(s).` });
    });
  };

  const handleExportPDF = () => {
    if (!rows || rows.length === 0) return;
    exportPDF(rows, desde, hasta);
  };

  return (
    <div className="space-y-5">
      {/* Filtros: no se cargan datos al entrar, solo al pulsar Generar */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Desde
          </label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
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
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
        </div>
        <button
          onClick={handleGenerar}
          disabled={isPending || !desde || !hasta || desde > hasta}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isPending ? 'Generando…' : 'Generar Reporte'}
        </button>
        {rows != null && rows.length > 0 && (
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            title="Exportar tabla a PDF"
          >
            <FileText className="h-4 w-4" />
            Exportar a PDF
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{toast.msg}</span>
        </div>
      )}

      {/* Tabla (solo cuando hay datos) */}
      {rows != null && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              No hay movimientos internos en el rango seleccionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-gray-700">Fecha</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Cuenta Origen</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Cuenta Destino</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Descripción</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 text-gray-700">{r.fecha}</td>
                      <td className="px-4 py-3 text-gray-700">{r.cuentaOrigen}</td>
                      <td className="px-4 py-3 text-gray-700">{r.cuentaDestino}</td>
                      <td className="px-4 py-3 text-gray-600">{r.descripcion}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {fmtCurrency(r.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <td className="px-4 py-3" colSpan={4}>
                      TOTAL TRANSFERIDO
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {fmtCurrency(rows.reduce((s, r) => s + r.monto, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {rows == null && !isPending && (
        <p className="text-center text-sm text-gray-400">
          Seleccioná un rango de fechas (máx. 6 meses) y pulsá «Generar Reporte».
        </p>
      )}
    </div>
  );
}
