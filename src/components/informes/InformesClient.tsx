'use client';

import { useState, useTransition, useCallback } from 'react';
import {
  Truck, Users, Download, FileText, Search, RefreshCw, AlertTriangle, CheckCircle,
} from 'lucide-react';
import {
  fetchInformeProveedores,
  fetchInformeClientes,
  type RowProveedor,
  type RowCliente,
} from '@/app/informes/actions';
import { useConfigEmpresa } from '@/components/ClientShell';
import { convertUrlToBase64 } from '@/lib/imageUtils';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Tab = 'proveedores' | 'clientes';
type Row = RowProveedor | RowCliente;

interface Props {
  rowsProveedoresInicial: RowProveedor[];
  rowsClientesInicial: RowCliente[];
  startInicial: string;
  endInicial: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(n: number) {
  return `$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtKg(n: number) {
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

function nombreRow(r: Row, tab: Tab) {
  return tab === 'proveedores'
    ? (r as RowProveedor).proveedorNombre
    : (r as RowCliente).clienteNombre;
}

/** Convierte los datos actuales a CSV y lo descarga en el navegador. */
function exportCSV(rows: Row[], tab: Tab, start: string, end: string) {
  const headers = [
    'Entidad',
    'Saldo Anterior ($)',
    'Kilos del Período (kg)',
    'Valor Generado ($)',
    'Dinero Movido ($)',
    'Saldo Final ($)',
  ];

  const body = rows.map(r => {
    const nombre = nombreRow(r, tab);
    // Escapar comas y comillas en el nombre
    const safeNombre = `"${nombre.replace(/"/g, '""')}"`;
    return [
      safeNombre,
      r.saldoAnterior.toFixed(2),
      r.kilosDelPeriodo.toFixed(2),
      r.valorGenerado.toFixed(2),
      r.dineroMovido.toFixed(2),
      r.saldoFinal.toFixed(2),
    ].join(',');
  });

  const csv = [headers.join(','), ...body].join('\n');
  // BOM UTF-8 para que Excel lo abra correctamente con acentos
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `informe-${tab}-${start}_${end}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Formatea un número como moneda plana para el PDF (sin símbolos Unicode especiales). */
function pdfMoney(n: number): string {
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${abs}`;
}

/** Etiqueta de usuario para firma/auditoría del PDF (nombre real o rol). */
const PDF_USUARIO_LABEL = 'Franco';

/** Genera y descarga el informe en formato PDF (nombre y logo desde Ajustes Generales). */
async function exportPDF(
  nombreSistema: string,
  logoBase64: string | null,
  rows: Row[],
  tab: Tab,
  start: string,
  end: string,
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  // Márgenes simétricos mínimo ~40pt (≈14mm), usar 15mm para uniformidad
  const margin = 15;
  const entidadLabel = tab === 'proveedores' ? 'Proveedores' : 'Clientes';
  const entidadSingular = tab === 'proveedores' ? 'proveedor' : 'cliente';
  const entidadPlural = tab === 'proveedores' ? 'proveedores' : 'clientes';
  const totalesLabel = rows.length === 1 ? entidadSingular : entidadPlural;

  const tituloMarca = `${nombreSistema} — Sistema de Gestión`;
  const logoW = 20;
  const logoH = 8;
  const headerCenterY = 13;  // Eje Y común para logo y título (alineación vertical al centro)

  // ── Header: logo + título alineados verticalmente al centro ─────────────────
  if (logoBase64) {
    const format = logoBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    try {
      doc.addImage(logoBase64, format, margin, headerCenterY - logoH / 2, logoW, logoH);
    } catch {
      // Si falla addImage, se muestra solo el texto
    }
  }
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 26);
  const textX = logoBase64 ? margin + logoW + 4 : margin;
  doc.text(tituloMarca, textX, headerCenterY + 1.5);

  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.55);
  doc.line(margin, 18, pageW - margin, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Estado de Cuenta — ${entidadLabel}`, margin, 22);

  // ── Fecha, período y usuario a la derecha, en columna, mismo margen derecho ───
  const fechaEmision = new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  doc.setTextColor(80, 80, 80);
  doc.text(`Fecha de emisión: ${fechaEmision}`, pageW - margin, 12, { align: 'right' });
  doc.text(`Período: ${start} al ${end}`, pageW - margin, 17, { align: 'right' });
  doc.text(`Usuario: ${PDF_USUARIO_LABEL}`, pageW - margin, 22, { align: 'right' });

  // ── Totales para resumen y pie de tabla ──────────────────────────────────────
  const totSaldoAnt = rows.reduce((s, r) => s + r.saldoAnterior, 0);
  const totKilos    = rows.reduce((s, r) => s + r.kilosDelPeriodo, 0);
  const totValor    = rows.reduce((s, r) => s + r.valorGenerado, 0);
  const totMovido   = rows.reduce((s, r) => s + r.dineroMovido, 0);
  const totSaldo    = rows.reduce((s, r) => s + r.saldoFinal, 0);

  const fmtSaldo = (n: number) =>
    n === 0 ? 'Saldado' : n > 0 ? pdfMoney(n) : `-${pdfMoney(Math.abs(n))} a favor`;

  // ── Resumen Ejecutivo: 5 tarjetas (igual que la UI web) ──────────────────────
  const resumenY = 28;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 26);
  doc.text('Resumen Ejecutivo', margin, resumenY);

  const gap = 3;
  const numKpis = 5;
  const kpiW = (pageW - 2 * margin - (numKpis - 1) * gap) / numKpis;
  const kpiY = resumenY + 2;
  const kpiH = 18;
  const kpiLabels = [
    'Saldo Arrastrado',
    'Kilos del Período',
    'Valor Generado',
    'Dinero Movido',
    'Saldo Final Neto',
  ];
  const kpiSubs = [
    totSaldoAnt >= 0 ? 'Deuda anterior' : 'Crédito anterior',
    'Movimiento físico',
    'Compras / ventas',
    tab === 'proveedores' ? 'Pagado' : 'Cobrado',
    totSaldo > 0 ? `${rows.filter(r => r.saldoFinal > 0).length} con deuda activa` : 'Saldado',
  ];
  const kpiValues = [
    totSaldoAnt === 0 ? '—' : fmtSaldo(totSaldoAnt),
    `${totKilos.toFixed(2)} kg`,
    pdfMoney(totValor),
    pdfMoney(totMovido),
    fmtSaldo(totSaldo),
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  for (let i = 0; i < numKpis; i++) {
    const x = margin + i * (kpiW + gap);
    doc.setDrawColor(220, 220, 220);
    doc.rect(x, kpiY, kpiW, kpiH, 'S');
    doc.text(kpiLabels[i], x + 3, kpiY + 5);
    const isSaldoFinal = i === 4;
    if (isSaldoFinal && totSaldo > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 82, 82);
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 26, 26);
    }
    doc.text(kpiValues[i], x + 3, kpiY + 10);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(kpiSubs[i], x + 3, kpiY + 15);
  }
  doc.setTextColor(51, 65, 85);

  const startY = kpiY + kpiH + 6;

  // ── Tabla: 6 columnas como en la web (Proveedor | Saldo Anterior | Kilos | Valor | Dinero Movido | Saldo Final) ─
  autoTable(doc, {
    startY,
    head: [[
      tab === 'proveedores' ? 'Proveedor' : 'Cliente',
      'Saldo Anterior',
      'Kilos del Período',
      'Valor Generado',
      'Dinero Movido',
      'Saldo Final',
    ]],
    body: rows.map(r => {
      const nombre = tab === 'proveedores'
        ? (r as RowProveedor).proveedorNombre
        : (r as RowCliente).clienteNombre;
      return [
        nombre,
        r.saldoAnterior === 0 ? '—' : fmtSaldo(r.saldoAnterior),
        r.kilosDelPeriodo > 0 ? `${r.kilosDelPeriodo.toFixed(2)} kg` : '—',
        r.valorGenerado > 0   ? pdfMoney(r.valorGenerado)            : '—',
        r.dineroMovido > 0    ? pdfMoney(r.dineroMovido)             : '—',
        fmtSaldo(r.saldoFinal),
      ];
    }),
    foot: [[
      `TOTALES — ${rows.length} ${totalesLabel}`,
      totSaldoAnt !== 0 ? fmtSaldo(totSaldoAnt) : '—',
      `${totKilos.toFixed(2)} kg`,
      pdfMoney(totValor),
      pdfMoney(totMovido),
      fmtSaldo(totSaldo),
    ]],

    theme: 'striped',

    styles: {
      fontSize: 9,
      cellPadding: { top: 3.5, right: 6, bottom: 3.5, left: 6 },
      overflow: 'linebreak',
      textColor: [51, 65, 85],
      halign: 'left',
      valign: 'middle',
      lineColor: [220, 220, 220],
      lineWidth: 0.08,
    },

    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      lineWidth: 0.08,
      lineColor: [26, 26, 26],
    },

    alternateRowStyles: {
      fillColor: [248, 249, 250],  // #f8f9fa gris ultra tenue
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },

    footStyles: {
      fillColor: [248, 249, 250],
      textColor: [26, 26, 26],
      fontStyle: 'bold',
      fontSize: 10,
      lineWidth: 0.2,
      lineColor: [180, 180, 180],
    },

    columnStyles: {
      0: { cellWidth: (pageW - 2 * margin) * 0.22, fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: (pageW - 2 * margin) * 0.14, halign: 'right' },
      2: { cellWidth: (pageW - 2 * margin) * 0.16, halign: 'right' },
      3: { cellWidth: (pageW - 2 * margin) * 0.14, halign: 'right' },
      4: { cellWidth: (pageW - 2 * margin) * 0.12, halign: 'right' },
      5: { cellWidth: (pageW - 2 * margin) * 0.22, fontStyle: 'bold', halign: 'right' },
    },

    didParseCell: (data) => {
      if (data.section === 'body') {
        const row = rows[data.row.index];
        if (!row) return;
        if (data.column.index === 5) {
          if (row.saldoFinal > 0) {
            data.cell.styles.textColor = [180, 82, 82];
          } else if (row.saldoFinal < 0) {
            data.cell.styles.textColor = [6, 95, 70];
          } else {
            data.cell.styles.textColor = [100, 116, 139];
          }
        }
        if (data.column.index === 1 && row.saldoAnterior > 0) {
          data.cell.styles.textColor = [180, 82, 82];
        }
      }
      if (data.section === 'foot' && data.column.index === 5) {
        if (totSaldo > 0) data.cell.styles.textColor = [180, 82, 82];
        else if (totSaldo < 0) data.cell.styles.textColor = [6, 95, 70];
      }
    },

    didDrawCell: (data) => {
      if (data.section === 'foot' && data.row.index === 0 && data.column.index === 0) {
        const footTop = data.cell.y;
        doc.setDrawColor(160, 160, 160);
        doc.setLineWidth(0.15);
        doc.line(margin, footTop, pageW - margin, footTop);
        doc.setLineWidth(0.08);
        doc.line(margin, footTop - 0.6, pageW - margin, footTop - 0.6);
      }
    },

    margin: { left: margin, right: margin },
    showHead: 'firstPage',
    showFoot: 'lastPage',
  });

  // ── Leyenda al pie de la tabla (solo en primera página si hay datos) ───────────
  const tableFinalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  if (rows.length > 0 && tableFinalY != null && tableFinalY < pageH - 28) {
    doc.setPage(1);
    const leyendaY = tableFinalY + 8;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const leyendas = [
      { color: [248, 113, 113] as [number, number, number], text: 'Saldo en rojo = deuda pendiente' },
      { color: [52, 211, 153] as [number, number, number], text: 'Saldo en verde = saldo a favor' },
      { color: [251, 146, 60] as [number, number, number], text: 'Deuda mayor a $5.000' },
      { color: [34, 197, 94] as [number, number, number], text: 'Saldado en el período' },
    ];
    const anchoLeyenda = (pageW - 2 * margin) / leyendas.length;
    leyendas.forEach((l, idx) => {
      const leyendaX = margin + idx * anchoLeyenda;
      doc.setFillColor(...l.color);
      doc.rect(leyendaX, leyendaY - 1.2, 2, 2, 'F');
      doc.setTextColor(80, 80, 80);
      doc.text(l.text, leyendaX + 3, leyendaY);
    });
  }

  // ── Footer: izquierda (barcode) | centro (página + documento) | derecha (usuario) ─
  const totalPags = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  const footerMarginBottom = 18;
  const footerY = pageH - footerMarginBottom;
  const barcodeH = 5;
  const barcodeY = pageH - footerMarginBottom - 4;

  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${i} de ${totalPags}`, pageW / 2, footerY, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(`${nombreSistema} — Documento generado automáticamente`, pageW / 2, footerY + 4, { align: 'center' });

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Usuario: ${PDF_USUARIO_LABEL}`, pageW - margin, footerY, { align: 'right' });

    doc.setFillColor(40, 40, 40);
    const seed = (i * 31 + start.length + end.length) % 97;
    let x = margin;
    for (let b = 0; b < 18; b++) {
      const w = (seed + b * 7) % 3 === 0 ? 0.8 : 1.2;
      doc.rect(x, barcodeY, w, barcodeH, 'F');
      x += w + 0.4;
    }
  }

  doc.save(`informe_${tab}_${start}.pdf`);
}

// ── Componente de tarjeta de resumen ─────────────────────────────────────────
function SummaryCard({
  label, value, sub, variant,
}: {
  label: string; value: string; sub?: string;
  variant: 'blue' | 'green' | 'orange' | 'purple' | 'red';
}) {
  // Color solo en el número principal — fondo siempre blanco (corporativo)
  const valueColor = {
    blue:   'text-slate-900',    // kilos / datos neutros
    green:  'text-emerald-700',  // dinero cobrado / pagado
    orange: 'text-slate-900',    // saldo arrastrado neutro
    purple: 'text-slate-900',    // valor generado neutro
    red:    'text-red-700',      // deuda / pendiente
  }[variant];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function InformesClient({
  rowsProveedoresInicial,
  rowsClientesInicial,
  startInicial,
  endInicial,
}: Props) {
  const configEmpresa = useConfigEmpresa();
  const [tab, setTab] = useState<Tab>('proveedores');
  const [startDate, setStartDate] = useState(startInicial);
  const [endDate, setEndDate] = useState(endInicial);
  const [rowsProv, setRowsProv] = useState<RowProveedor[]>(rowsProveedoresInicial);
  const [rowsCli, setRowsCli] = useState<RowCliente[]>(rowsClientesInicial);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [exportingPdf, setExportingPdf] = useState(false);

  // ── Aplicar filtros (llama server actions) ────────────────────────────────
  const handleApply = useCallback(() => {
    if (!startDate || !endDate || startDate > endDate) return;
    startTransition(async () => {
      const [prov, cli] = await Promise.all([
        fetchInformeProveedores(startDate, endDate),
        fetchInformeClientes(startDate, endDate),
      ]);
      setRowsProv(prov);
      setRowsCli(cli);
      setSearch('');
    });
  }, [startDate, endDate]);

  // ── Datos de la tab activa (con filtro de búsqueda) ───────────────────────
  const rawRows: Row[] = tab === 'proveedores' ? rowsProv : rowsCli;
  const filteredRows = rawRows.filter(r =>
    nombreRow(r, tab).toLowerCase().includes(search.toLowerCase())
  );

  // ── Totales del footer ────────────────────────────────────────────────────
  const totKilos = filteredRows.reduce((s, r) => s + r.kilosDelPeriodo, 0);
  const totValor = filteredRows.reduce((s, r) => s + r.valorGenerado, 0);
  const totMovido = filteredRows.reduce((s, r) => s + r.dineroMovido, 0);
  const totSaldo = filteredRows.reduce((s, r) => s + r.saldoFinal, 0);

  // ── Cards de resumen (todos los registros, sin filtro de búsqueda) ────────
  const allRows: Row[] = tab === 'proveedores' ? rowsProv : rowsCli;
  const totSaldoAnteriorAll = allRows.reduce((s, r) => s + r.saldoAnterior, 0);
  const totKilosAll = allRows.reduce((s, r) => s + r.kilosDelPeriodo, 0);
  const totValorAll = allRows.reduce((s, r) => s + r.valorGenerado, 0);
  const totMovidoAll = allRows.reduce((s, r) => s + r.dineroMovido, 0);
  const totSaldoAll = allRows.reduce((s, r) => s + r.saldoFinal, 0);

  const conDeuda = allRows.filter(r => r.saldoFinal > 0).length;

  const handleExportPDF = useCallback(async () => {
    const nombreSistema = (configEmpresa?.nombre_empresa ?? '').trim() || 'Acopio';
    let logoBase64: string | null = null;
    if (configEmpresa?.logo_url) {
      logoBase64 = await convertUrlToBase64(configEmpresa.logo_url);
    }
    setExportingPdf(true);
    try {
      await exportPDF(nombreSistema, logoBase64, filteredRows, tab, startDate, endDate);
    } finally {
      setExportingPdf(false);
    }
  }, [configEmpresa?.nombre_empresa, configEmpresa?.logo_url, filteredRows, tab, startDate, endDate]);

  return (
    <div className="space-y-5">
      {/* ── Selector de entidad ───────────────────────────────────────────── */}
      <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm">
        <button
          onClick={() => { setTab('proveedores'); setSearch(''); }}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            tab === 'proveedores' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="h-4 w-4" />
          Proveedores
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            tab === 'proveedores' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-500'
          }`}>
            {rowsProv.length}
          </span>
        </button>
        <button
          onClick={() => { setTab('clientes'); setSearch(''); }}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            tab === 'clientes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Clientes
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
            tab === 'clientes' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
          }`}>
            {rowsCli.length}
          </span>
        </button>
      </div>

      {/* ── Barra de filtros ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Desde
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Hasta
          </label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
        </div>

        <button
          onClick={handleApply}
          disabled={isPending || !startDate || !endDate || startDate > endDate}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isPending ? 'Calculando…' : 'Aplicar'}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* Buscador */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Buscar ${tab === 'proveedores' ? 'proveedor' : 'cliente'}…`}
              className="w-40 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>

          {/* Exportar CSV */}
          <button
            onClick={() => exportCSV(filteredRows, tab, startDate, endDate)}
            disabled={filteredRows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
            title="Exportar tabla a CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>

          {/* Exportar PDF (nombre y logo desde Ajustes Generales) */}
          <button
            onClick={handleExportPDF}
            disabled={filteredRows.length === 0 || exportingPdf}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40"
            title="Exportar tabla a PDF"
          >
            <FileText className="h-3.5 w-3.5" />
            {exportingPdf ? 'Generando PDF…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* ── Tarjetas de resumen ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SummaryCard
          label="Saldo Arrastrado"
          value={fmtCurrency(totSaldoAnteriorAll)}
          sub={totSaldoAnteriorAll >= 0 ? 'Deuda anterior' : 'Crédito anterior'}
          variant={totSaldoAnteriorAll >= 0 ? 'orange' : 'blue'}
        />
        <SummaryCard
          label="Kilos del período"
          value={fmtKg(totKilosAll)}
          sub="Movimiento físico"
          variant="blue"
        />
        <SummaryCard
          label="Valor generado"
          value={fmtCurrency(totValorAll)}
          sub="Compras / ventas"
          variant="purple"
        />
        <SummaryCard
          label="Dinero movido"
          value={fmtCurrency(totMovidoAll)}
          sub={tab === 'proveedores' ? 'Pagado' : 'Cobrado'}
          variant="green"
        />
        <SummaryCard
          label="Saldo final neto"
          value={fmtCurrency(totSaldoAll)}
          sub={`${conDeuda} con deuda activa`}
          variant={totSaldoAll > 0 ? 'red' : 'green'}
        />
      </div>

      {/* ── Tabla principal ───────────────────────────────────────────────── */}
      <div className={`relative rounded-xl border border-slate-300 bg-white shadow-sm ${isPending ? 'opacity-60' : ''} transition-opacity`}>
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70">
            <RefreshCw className="h-6 w-6 animate-spin text-purple-500" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th className="px-5 py-3.5 text-left">
                  {tab === 'proveedores' ? 'Proveedor' : 'Cliente'}
                </th>
                <th className="px-5 py-3.5 text-right">Saldo Anterior ($)</th>
                <th className="px-5 py-3.5 text-right">Kilos del Período</th>
                <th className="px-5 py-3.5 text-right">Valor Generado ($)</th>
                <th className="px-5 py-3.5 text-right">Dinero Movido ($)</th>
                <th className="px-5 py-3.5 text-right">Saldo Final ($)</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-gray-400">
                    {search
                      ? 'No hay resultados para esa búsqueda.'
                      : 'Sin actividad en el período seleccionado.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => {
                  const nombre = nombreRow(r, tab);
                  const id = tab === 'proveedores'
                    ? (r as RowProveedor).proveedorId
                    : (r as RowCliente).clienteId;

                  // Saldo final: positivo = deuda (rojo prov / rojo cli), negativo = crédito (azul)
                  const saldoFinalPos = r.saldoFinal > 0;
                  const saldoFinalNeg = r.saldoFinal < 0;

                  // Saldo anterior: contexto de arrastre
                  const saldoAntPos = r.saldoAnterior > 0;

                  return (
                    <tr
                      key={`${tab}-${id}`}
                      className={`transition-colors hover:bg-gray-50 ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}
                    >
                      {/* Nombre */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {saldoFinalPos && r.saldoFinal > 5000 && (
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-orange-400" />
                          )}
                          {!saldoFinalPos && r.kilosDelPeriodo > 0 && (
                            <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-400" />
                          )}
                          <span className="font-semibold text-gray-900">{nombre}</span>
                        </div>
                      </td>

                      {/* Saldo anterior */}
                      <td className="px-5 py-4 text-right">
                        <span className={`font-mono text-xs ${
                          r.saldoAnterior === 0
                            ? 'text-gray-400'
                            : saldoAntPos
                            ? 'text-orange-600'
                            : 'text-blue-600'
                        }`}>
                          {r.saldoAnterior === 0
                            ? '—'
                            : `${saldoAntPos ? '' : '−'}${fmtCurrency(r.saldoAnterior)}`}
                        </span>
                      </td>

                      {/* Kilos */}
                      <td className="px-5 py-4 text-right">
                        <span className="font-mono text-gray-700">
                          {r.kilosDelPeriodo > 0 ? fmtKg(r.kilosDelPeriodo) : '—'}
                        </span>
                      </td>

                      {/* Valor generado */}
                      <td className="px-5 py-4 text-right">
                        <span className="font-mono text-gray-700">
                          {r.valorGenerado > 0 ? fmtCurrency(r.valorGenerado) : '—'}
                        </span>
                      </td>

                      {/* Dinero movido */}
                      <td className="px-5 py-4 text-right">
                        <span className="font-mono text-green-600">
                          {r.dineroMovido > 0 ? fmtCurrency(r.dineroMovido) : '—'}
                        </span>
                      </td>

                      {/* Saldo final — el dato más importante */}
                      <td className="px-5 py-4 text-right">
                        <span className={`inline-block rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                          r.saldoFinal === 0
                            ? 'bg-gray-100 text-gray-500'
                            : saldoFinalPos
                            ? 'bg-red-50 text-red-700'
                            : saldoFinalNeg
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {r.saldoFinal === 0
                            ? '✓ Saldado'
                            : saldoFinalPos
                            ? fmtCurrency(r.saldoFinal)
                            : `−${fmtCurrency(Math.abs(r.saldoFinal))} a favor`}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Footer con totales */}
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs font-bold text-gray-700">
                  <td className="px-5 py-3.5">
                    TOTALES — {filteredRows.length} {tab === 'proveedores' ? 'proveedor' : 'cliente'}
                    {filteredRows.length !== 1 ? (tab === 'proveedores' ? 'es' : 's') : ''}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-gray-500">
                    {fmtCurrency(filteredRows.reduce((s, r) => s + r.saldoAnterior, 0))}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-gray-700">
                    {fmtKg(totKilos)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-gray-700">
                    {fmtCurrency(totValor)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-green-700">
                    {fmtCurrency(totMovido)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono">
                    <span className={totSaldo >= 0 ? 'text-red-700' : 'text-blue-700'}>
                      {totSaldo >= 0
                        ? fmtCurrency(totSaldo)
                        : `−${fmtCurrency(Math.abs(totSaldo))} a favor`}
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Leyenda de colores */}
        {filteredRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-100" />
              Saldo en rojo = deuda pendiente
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100" />
              Saldo en verde = saldo a favor
            </span>
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-orange-400" />
              Deuda mayor a $5.000
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-green-400" />
              Saldado en el período
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
