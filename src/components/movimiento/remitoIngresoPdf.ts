import type { jsPDF } from 'jspdf';

export interface RemitoIngresoData {
  nroOperacion: number;
  fechaHora: string;
  proveedorNombre: string;
  proveedorCuit: string;
  items: {
    producto_nombre: string;
    envase_nombre: string;
    cantidad_envases: number;
    peso_bruto_kg: number;
    tara_total_kg: number;
    peso_neto_kg: number;
  }[];
  envasesIngresadosHoy: number;
  /** Envases vacíos retirados por el proveedor en esta operación (opcional, para reimpresión puede ser 0) */
  envasesRetiradosHoy?: number;
  saldoPendiente: number;
  empresaNombre: string;
  empresaLogoBase64?: string | null;
}

const MARGIN = 15;
const PAGE_W = 210;
const LINE_HEIGHT = 5;
const FONT_TITLE = 16;
const FONT_NORMAL = 10;
const FONT_SMALL = 9;
const FONT_SALDO = 12;

// Encabezado corporativo: logo empresa (si existe), nombre, sello, línea gruesa
function drawHeader(
  doc: jsPDF,
  data: RemitoIngresoData,
  startY: number,
  copyLabel: 'ORIGINAL' | 'DUPLICADO',
): number {
  const x = MARGIN;
  const logoW = 40;
  const logoH = 20;

  // Logo empresa (base64) o placeholder
  if (data.empresaLogoBase64) {
    try {
      doc.addImage(data.empresaLogoBase64, 'PNG', x, startY, logoW, logoH);
    } catch {
      // fallback simple en caso de error de imagen
      doc.setFillColor(230, 230, 232);
      doc.rect(x, startY, logoW, logoH, 'F');
    }
  } else {
    doc.setFillColor(230, 230, 232);
    doc.rect(x, startY, logoW, logoH, 'F');
    doc.setDrawColor(180, 180, 185);
    doc.setLineWidth(0.2);
    doc.rect(x, startY, logoW, logoH, 'S');
    doc.setTextColor(140, 140, 145);
    doc.setFontSize(FONT_SMALL);
    doc.setFont('helvetica', 'normal');
    doc.text('LOGO', x + logoW / 2, startY + logoH / 2 + 1.5, { align: 'center' });
  }

  // Nombre de la empresa (derecha del logo)
  const companyX = x + logoW + 6;
  doc.setFontSize(FONT_TITLE);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(data.empresaNombre || 'Acopio', companyX, startY + 8);

  doc.setFontSize(FONT_NORMAL);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 95, 115);
  doc.text('Dirección · Teléfono', companyX, startY + 14);

  // Sello: Nro Operación y Fecha/Hora (recuadro a la derecha)
  const stampW = 58;
  const stampH = 18;
  const stampX = PAGE_W - MARGIN - stampW;
  const stampY = startY;
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.25);
  doc.rect(stampX, stampY, stampW, stampH, 'S');
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(`Nº Operación: ${data.nroOperacion}`, stampX + 4, stampY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha/Hora: ${data.fechaHora}`, stampX + 4, stampY + 12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Copia: ${copyLabel}`, stampX + 4, stampY + 17);

  const headerBottom = startY + Math.max(logoH, stampH);
  // Línea horizontal gruesa debajo del encabezado
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, headerBottom, PAGE_W - MARGIN, headerBottom);

  return headerBottom + 4;
}

// Recuadro Datos del Proveedor (fondo gris suave, etiquetas en negrita)
function drawProveedorBox(doc: jsPDF, data: RemitoIngresoData, startY: number): number {
  const boxW = PAGE_W - MARGIN * 2;
  const boxH = 22;
  const pad = 5;

  doc.setFillColor(245, 245, 245);
  doc.rect(MARGIN, startY, boxW, boxH, 'F');
  doc.setDrawColor(200, 200, 205);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN, startY, boxW, boxH, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.setTextColor(51, 65, 85);
  doc.text('Señor(es):', MARGIN + pad, startY + 8);
  doc.text('CUIT:', MARGIN + pad, startY + 16);

  doc.setFont('helvetica', 'normal');
  doc.text(data.proveedorNombre || '—', MARGIN + pad + 32, startY + 8);
  doc.text(data.proveedorCuit || '—', MARGIN + pad + 32, startY + 16);

  // Dejar un poco más de aire antes de la tabla
  return startY + boxH + 8;
}

// Dibuja la tabla estilizada y devuelve la Y final
function drawTable(
  doc: jsPDF,
  data: RemitoIngresoData,
  startY: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: jsPDF, options: any) => void,
): number {
  const tableHead = [['Producto', 'Tipo Envase', 'Cant.', 'Kilos Brutos', 'Tara (kg)', 'Kilos Netos']];
  const tableBody = data.items.map(p => [
    p.producto_nombre,
    p.envase_nombre,
    String(p.cantidad_envases),
    p.peso_bruto_kg.toFixed(2),
    p.tara_total_kg.toFixed(2),
    p.peso_neto_kg.toFixed(2),
  ]);

  autoTable(doc, {
    startY,
    head: tableHead,
    body: tableBody,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'grid',
    styles: {
      fontSize: FONT_NORMAL,
      cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
      textColor: [51, 65, 85],
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
    },
    headStyles: {
      fillColor: [60, 60, 60],
      textColor: [255, 255, 255],
      fontSize: FONT_NORMAL,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: FONT_NORMAL,
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 35 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
  });

  // Dejar un margen entre la tabla y el recuadro de totales
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

// Sección Totales + Estado de Envases (recuadro prominente, saldo destacado)
function drawTotalesYEnvases(
  doc: jsPDF,
  data: RemitoIngresoData,
  startY: number,
): number {
  const totalNeto = data.items.reduce((s, i) => s + i.peso_neto_kg, 0);
  const retirados = data.envasesRetiradosHoy ?? 0;
  const hasRetirados = retirados > 0;
  const boxW = PAGE_W - MARGIN * 2;
  const boxH = hasRetirados ? 42 : 36;
  const pad = 6;

  doc.setDrawColor(80, 80, 90);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN, startY, boxW, boxH, 'S');
  doc.setFillColor(252, 252, 253);
  doc.rect(MARGIN, startY, boxW, boxH, 'F');
  doc.rect(MARGIN, startY, boxW, boxH, 'S');

  // Izquierda: Total Kilos Netos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.setTextColor(51, 65, 85);
  doc.text(`Total Kilos Netos: ${totalNeto.toFixed(2)} kg`, MARGIN + pad, startY + 10);

  // Derecha: Estado de Envases (muy destacado, alineado a la derecha dentro del recuadro)
  const envRightX = MARGIN + boxW - pad;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SMALL);
  doc.setTextColor(51, 65, 85);
  let yLine = startY + 10;
  doc.text('Estado de Envases', envRightX, yLine, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SMALL);
  yLine += 6;
  doc.text(`Envases llenos ingresados: ${data.envasesIngresadosHoy}`, envRightX, yLine, { align: 'right' });
  if (hasRetirados) {
    yLine += 6;
    doc.text(`Envases vacíos retirados: ${retirados}`, envRightX, yLine, { align: 'right' });
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SALDO);
  doc.setTextColor(30, 58, 95);
  yLine += hasRetirados ? 8 : 10;
  doc.text(
    `Saldo total pendiente (tras esta operación): ${data.saldoPendiente}`,
    envRightX,
    yLine,
    { align: 'right' },
  );

  return startY + boxH;
}

// Dibuja una mitad completa del remito (ORIGINAL o DUPLICADO)
function drawRemitoHalf(
  doc: jsPDF,
  data: RemitoIngresoData,
  startY: number,
  copyLabel: 'ORIGINAL' | 'DUPLICADO',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: jsPDF, options: any) => void,
): number {
  let y = drawHeader(doc, data, startY, copyLabel);
  y = drawProveedorBox(doc, data, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_NORMAL);
  doc.setTextColor(51, 65, 85);
  doc.text('Detalle de Pesada', MARGIN, y);
  // Un pequeño espacio extra entre el título y la tabla
  y += LINE_HEIGHT + 1;
  y = drawTable(doc, data, y, autoTable);
  y = drawTotalesYEnvases(doc, data, y);
  return y;
}

export async function generarRemitoIngresoPdf(data: RemitoIngresoData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const halfHeight = 148;
  const baseData: RemitoIngresoData = { ...data };

  const yEnd1 = drawRemitoHalf(doc, baseData, 12, 'ORIGINAL', autoTable);

  // Línea punteada de corte y etiquetas
  const yDotted = halfHeight;
  doc.setDrawColor(150, 150, 160);
  doc.setLineWidth(0.2);
  for (let x = MARGIN; x <= PAGE_W - MARGIN; x += 3) {
    doc.line(x, yDotted, Math.min(x + 2, PAGE_W - MARGIN), yDotted);
  }
  doc.setFontSize(FONT_SMALL);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('ORIGINAL', MARGIN, yDotted - 2);
  doc.text('DUPLICADO', MARGIN, yDotted + 4);

  const yEnd2 = drawRemitoHalf(doc, baseData, yDotted + 8, 'DUPLICADO', autoTable);

  doc.save(`remito_ingreso_${data.nroOperacion}.pdf`);
}
