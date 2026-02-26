import type { jsPDF } from 'jspdf';
import type { HistorialEnvaseRow, TipoEntidadEnvase } from '@/app/envases/actions';

export interface ResumenEnvasesData {
  empresaNombre: string;
  empresaLogoBase64?: string | null;
  entidadNombre: string;
  entidadTipo: TipoEntidadEnvase;
  saldoActualEsperado: number;
  movimientos: HistorialEnvaseRow[];
}

const MARGIN = 15;
const PAGE_W = 210;
const FONT_TITLE = 16;
const FONT_NORMAL = 10;
const FONT_SMALL = 9;

function drawHeader(
  doc: jsPDF,
  data: ResumenEnvasesData,
  startY: number,
): number {
  const x = MARGIN;
  const logoW = 32;
  const logoH = 18;

  // Logo empresa (si existe) o recuadro
  if (data.empresaLogoBase64) {
    try {
      doc.addImage(data.empresaLogoBase64, 'PNG', x, startY, logoW, logoH);
    } catch {
      doc.setFillColor(230, 230, 232);
      doc.rect(x, startY, logoW, logoH, 'F');
    }
  } else {
    doc.setFillColor(230, 230, 232);
    doc.rect(x, startY, logoW, logoH, 'F');
  }

  const companyX = x + logoW + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_TITLE);
  doc.setTextColor(30, 41, 59);
  doc.text(data.empresaNombre || 'Acopio', companyX, startY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(100, 116, 139);
  doc.text('Resumen de Cuenta de Envases', companyX, startY + 13);

  const headerBottom = startY + logoH;
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, headerBottom + 3, PAGE_W - MARGIN, headerBottom + 3);

  return headerBottom + 7;
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR');
  } catch {
    return iso;
  }
}

function leerNumeroCampo(
  row: HistorialEnvaseRow,
  principal: string,
  aliases: string[],
): number {
  const r = row as unknown as Record<string, unknown>;
  for (const key of [principal, ...aliases]) {
    if (!(key in r)) continue;
    const v = r[key];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function leerEntregados(row: HistorialEnvaseRow): number {
  // Soporta distintos nombres que pueda devolver la vista/RPC
  return leerNumeroCampo(row, 'entregados', [
    'cargo',
    'cantidad_cargo',
    'cantidad_entregados',
    'cantidad',
    'ingreso',
  ]);
}

function leerDevueltos(row: HistorialEnvaseRow): number {
  return leerNumeroCampo(row, 'devueltos', [
    'abono',
    'cantidad_abono',
    'cantidad_devueltos',
    'egreso',
  ]);
}

export async function generarResumenEnvasesPdf(data: ResumenEnvasesData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let y = drawHeader(doc, data, 12);

  // Datos de la entidad
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.setTextColor(51, 65, 85);
  const tipoLabel = data.entidadTipo === 'PROVEEDOR' ? 'Proveedor' : 'Cliente';
  doc.text(`${tipoLabel}: ${data.entidadNombre}`, MARGIN, y + 6);

  y += 12;

  // Recalcular saldos acumulados y aplicar lógica de corte por último saldo 0
  const movimientosOrdenados = [...data.movimientos].sort((a, b) =>
    a.fecha.localeCompare(b.fecha),
  );

  type RowConSaldo = HistorialEnvaseRow & { saldo_acumulado: number };

  function recalcularConSigno(sign: 1 | -1): {
    filas: RowConSaldo[];
    saldoFinal: number;
    indicesCero: number[];
  } {
    let saldo = 0;
    const filas: RowConSaldo[] = [];
    const indicesCero: number[] = [];

    movimientosOrdenados.forEach((m, idx) => {
      const entregados = leerEntregados(m);
      const devueltos = leerDevueltos(m);
      saldo += sign * (entregados - devueltos);
      const fila: RowConSaldo = { ...m, saldo_acumulado: saldo };
      filas.push(fila);
      if (saldo === 0) indicesCero.push(idx);
    });

    return { filas, saldoFinal: saldo, indicesCero };
  }

  const esperado = data.saldoActualEsperado ?? 0;
  const variantePos = recalcularConSigno(1);
  const varianteNeg = recalcularConSigno(-1);

  const usarNeg =
    Math.abs(varianteNeg.saldoFinal - esperado) < Math.abs(variantePos.saldoFinal - esperado);

  const elegido = usarNeg ? varianteNeg : variantePos;
  const filasConSaldo = elegido.filas;
  const saldoFinal = elegido.saldoFinal;
  const indicesCero = elegido.indicesCero;

  let inicio = 0;
  let fin = filasConSaldo.length;

  if (indicesCero.length > 0) {
    if (saldoFinal === 0) {
      const ultimoCero = indicesCero[indicesCero.length - 1];
      const penultimoCero = indicesCero.length >= 2 ? indicesCero[indicesCero.length - 2] : -1;
      inicio = penultimoCero + 1;
      fin = ultimoCero + 1;
    } else {
      const ultimoCero = indicesCero[indicesCero.length - 1];
      inicio = ultimoCero + 1;
    }
  }

  let filasVisibles = filasConSaldo.slice(inicio, fin);
  if (filasVisibles.length === 0) {
    filasVisibles = filasConSaldo;
  }

  const head = [['Fecha', 'Concepto', 'Envase', 'Entregados (Cargo)', 'Devueltos (Abono)', 'Saldo Acumulado']];
  const body = filasVisibles.map(m => {
    const entregadosNum = leerEntregados(m);
    const devueltosNum = leerDevueltos(m);
    const entregados = entregadosNum !== 0 ? String(entregadosNum) : '-';
    const devueltos = devueltosNum !== 0 ? String(devueltosNum) : '-';
    const saldo = String(m.saldo_acumulado ?? 0);
    return [
      formatFecha(m.fecha),
      m.concepto,
      m.envase_nombre,
      entregados,
      devueltos,
      saldo,
    ];
  });

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'grid',
    styles: {
      fontSize: FONT_NORMAL,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      textColor: [51, 65, 85],
      lineWidth: 0.1,
      lineColor: [210, 210, 210],
    },
    headStyles: {
      fillColor: [60, 60, 60],
      textColor: [255, 255, 255],
      fontSize: FONT_NORMAL,
      fontStyle: 'bold',
    },
    columnStyles: {
      // Suma total de anchos = 180mm (ancho útil A4 con márgenes de 15mm)
      0: { cellWidth: 24 },                      // Fecha
      1: { cellWidth: 56 },                      // Concepto
      2: { cellWidth: 30 },                      // Envase
      3: { cellWidth: 22, halign: 'right' },     // Entregados (Cargo)
      4: { cellWidth: 22, halign: 'right' },     // Devueltos (Abono)
      5: { cellWidth: 26, halign: 'right' },     // Saldo Acumulado
    },
  });

  const last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable;
  const saldoActual = esperado;

  const boxY = last.finalY + 6;
  const boxW = PAGE_W - MARGIN * 2;
  const boxH = 18;

  doc.setDrawColor(80, 80, 90);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, boxY, boxW, boxH, 'S');
  doc.setFillColor(248, 250, 252);
  doc.rect(MARGIN, boxY, boxW, boxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.setTextColor(51, 65, 85);
  doc.text('Saldo Actual Pendiente', MARGIN + 6, boxY + 9);

  doc.setFontSize(14);
  doc.setTextColor(30, 64, 175);
  doc.text(
    `${saldoActual} envases`,
    MARGIN + boxW - 6,
    boxY + 11,
    { align: 'right' },
  );

  doc.save(`resumen_envases_${data.entidadNombre.replace(/\s+/g, '_')}.pdf`);
}

