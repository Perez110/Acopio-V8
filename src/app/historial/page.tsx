import { ClockIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import HistorialClient from '@/components/historial/HistorialClient';
import type { EventoHistorial } from '@/components/historial/HistorialClient';

const MAX_DIAS_RANGO = 31;

// Forzar renderizado dinámico estricto: nunca usar caché para este módulo
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ── Tipo que espeja exactamente las columnas de la VIEW historial_unificado ──
type HistorialRow = {
  uid: string;
  id_origen: number;
  tipo_evento: string;
  created_at: string | null;
  entidad_proveedor_id: number | null;
  entidad_cliente_id: number | null;
  entidad_fletero_id: number | null;
  entidad_envase_id: number | null;
  producto_id: number | null;
  envase_id: number | null;
  cantidad: number | null;
  peso_bruto_kg: number | null;
  peso_neto_kg: number | null;
  monto: number | null;
  metodo_pago: string | null;
  descripcion_txt: string | null;
  notas_txt: string | null;
  estado_conciliacion: string | null;
  descuento_calidad_kg: number | null;
  href: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseMotivoAjuste(notas: string | null): string {
  if (!notas) return 'Sin motivo registrado';
  if (notas.startsWith('Motivo: ')) {
    const rest = notas.slice(8);
    const pipeIdx = rest.indexOf(' | ');
    return pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest;
  }
  return notas;
}

/** Convierte una fila de historial_unificado en un EventoHistorial para la UI. */
function mapRowToEvento(
  row: HistorialRow,
  provNombre: Map<number, string>,
  cliNombre: Map<number, string>,
  fletNombre: Map<number, string>,
  envNombre: Map<number, string>,
  prodNombre: Map<number, string>,
): EventoHistorial {
  const prod = prodNombre.get(row.producto_id ?? 0) ?? '—';
  const env  = envNombre.get(row.envase_id  ?? 0) ?? '—';

  switch (row.tipo_evento) {

    case 'INGRESO_FRUTA': {
      const prov = provNombre.get(row.entidad_proveedor_id ?? 0) ?? 'Proveedor desconocido';
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'INGRESO_FRUTA',
        entidad: prov,
        detalle: [
          row.peso_neto_kg  != null ? `${Number(row.peso_neto_kg).toFixed(2)} kg neto`           : '',
          row.peso_bruto_kg != null ? `(bruto: ${Number(row.peso_bruto_kg).toFixed(2)} kg)`      : '',
          row.cantidad      != null ? `· ${row.cantidad} ${env}`                                  : '',
          prod !== '—'              ? `· ${prod}`                                                  : '',
        ].filter(Boolean).join(' '),
        href: row.href,
      };
    }

    case 'SALIDA_FRUTA': {
      const cli = cliNombre.get(row.entidad_cliente_id ?? 0) ?? 'Cliente desconocido';
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'SALIDA_FRUTA',
        entidad: cli,
        detalle: `${Number(row.peso_neto_kg ?? 0).toFixed(2)} kg despachados${prod !== '—' ? ` · ${prod}` : ''} · estado: PENDIENTE`,
        href: row.href,
      };
    }

    case 'CONCILIACION': {
      const cli   = cliNombre.get(row.entidad_cliente_id ?? 0) ?? 'Cliente desconocido';
      const merma = row.descuento_calidad_kg != null
        ? ` · merma: ${Number(row.descuento_calidad_kg).toFixed(2)} kg`
        : '';
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'CONCILIACION',
        entidad: cli,
        detalle: `${Number(row.peso_neto_kg ?? 0).toFixed(2)} kg llegada${merma} · $${Number(row.monto ?? 0).toFixed(2)}${prod !== '—' ? ` · ${prod}` : ''}`,
        monto: row.monto ?? undefined,
        href: row.href,
      };
    }

    case 'COBRO': {
      const cli    = cliNombre.get(row.entidad_cliente_id ?? 0) ?? '—';
      const metodo = row.metodo_pago   ? ` · ${row.metodo_pago}`   : '';
      const desc   = row.descripcion_txt ? ` — ${row.descripcion_txt}` : '';
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'COBRO',
        entidad: cli,
        detalle: `$${Number(row.monto ?? 0).toFixed(2)}${metodo}${desc}`,
        monto: row.monto ?? undefined,
        href: row.href,
      };
    }

    case 'PAGO': {
      let entidad = '—';
      if (row.entidad_proveedor_id) entidad = provNombre.get(row.entidad_proveedor_id) ?? '—';
      else if (row.entidad_fletero_id) entidad = fletNombre.get(row.entidad_fletero_id) ?? '—';
      const metodo = row.metodo_pago   ? ` · ${row.metodo_pago}`   : '';
      const desc   = row.descripcion_txt ? ` — ${row.descripcion_txt}` : '';
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'PAGO',
        entidad,
        detalle: `$${Number(row.monto ?? 0).toFixed(2)}${metodo}${desc}`,
        monto: row.monto ?? undefined,
        href: row.href,
      };
    }

    case 'AJUSTE_STOCK': {
      const envNom = envNombre.get(row.entidad_envase_id ?? 0) ?? envNombre.get(row.envase_id ?? 0) ?? 'Envase desconocido';
      const motivo = parseMotivoAjuste(row.notas_txt ?? null);
      const esVacio = row.estado_conciliacion === 'AJUSTE_VACIO';
      const diff    = row.cantidad ?? 0;
      // Trazabilidad: mostrar proveedor o cliente asignado al movimiento; si no hay, el motivo
      const persona =
        (row.entidad_proveedor_id != null ? provNombre.get(row.entidad_proveedor_id) : undefined) ??
        (row.entidad_cliente_id != null ? cliNombre.get(row.entidad_cliente_id) : undefined) ??
        motivo;
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'AJUSTE_STOCK',
        entidad: envNom,
        detalle: `${diff >= 0 ? '+' : ''}${diff} ${esVacio ? 'vacíos' : 'ocupados'} · ${persona}`,
        href: row.href,
      };
    }

    case 'MOVIMIENTO_INTERNO': {
      const desc = row.descripcion_txt ?? 'Transferencia entre cuentas';
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'MOVIMIENTO_INTERNO',
        entidad: 'Mov. interno',
        detalle: `${desc} · $${Number(row.monto ?? 0).toFixed(2)}`,
        monto: row.monto ?? undefined,
        href: row.href,
      };
    }

    default:
      return {
        id: row.uid,
        idOrigen: row.id_origen,
        created_at: row.created_at,
        tipo: 'INGRESO_FRUTA',
        entidad: '—',
        detalle: '—',
        href: row.href,
      };
  }
}

// ── Tipos Next.js 15+ (searchParams como Promise) ─────────────────────────────
type SearchParamsPromise = Promise<{ desde?: string; hasta?: string; pagina?: string }>;

const ITEMS_POR_PAGINA = 50;

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: SearchParamsPromise;
}) {
  // ── Resolver searchParams (Next.js 15+ los pasa como Promise) ─────────────
  const params = await searchParams;

  // ── Fecha de hoy en horario Argentina (UTC-3) ─────────────────────────────
  const nowAR = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }),
  );
  const today = `${nowAR.getFullYear()}-${String(nowAR.getMonth() + 1).padStart(2, '0')}-${String(nowAR.getDate()).padStart(2, '0')}`;

  let desde  = params?.desde  ?? today;
  const hasta  = params?.hasta  ?? today;
  const pagina = Math.max(1, parseInt(params?.pagina ?? '1', 10) || 1);

  // Límite de seguridad: rango máximo 31 días para evitar consultas masivas
  const desdeDate = new Date(desde + 'T12:00:00');
  const hastaDate = new Date(hasta + 'T12:00:00');
  const diffMs = hastaDate.getTime() - desdeDate.getTime();
  const diffDias = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (diffDias > MAX_DIAS_RANGO) {
    const clamped = new Date(hastaDate);
    clamped.setDate(clamped.getDate() - MAX_DIAS_RANGO);
    const clampedStr = clamped.toISOString().slice(0, 10);
    redirect(`/historial?desde=${clampedStr}&hasta=${hasta}&pagina=1`);
  }

  // Timestamptz con offset explícito de Argentina (-03:00)
  const tsDesde = `${desde}T00:00:00.000-03:00`;
  const tsHasta = `${hasta}T23:59:59.999-03:00`;

  // ── Un único fetch a la VIEW + lookups de nombres en paralelo ─────────────
  // La VIEW hace el UNION ALL y Postgres pagina con .range() → O(50) filas a Node.js
  const [
    { data: proveedores },
    { data: clientes },
    { data: fleteros },
    { data: envases },
    { data: productos },
    { data: rows, count },
  ] = await Promise.all([
    supabaseServer.from('Proveedores').select('id, nombre'),
    supabaseServer.from('Clientes').select('id, nombre'),
    supabaseServer.from('Fleteros').select('id, nombre'),
    supabaseServer.from('Envases').select('id, nombre'),
    supabaseServer.from('Productos').select('id, nombre'),

    // Un solo fetch a la vista unificada — Postgres ordena y pagina
    // count: 'exact' devuelve el total real sin traer todas las filas
    supabaseServer
      .from('historial_unificado' as string)
      .select('*', { count: 'exact' })
      .gte('created_at', tsDesde)
      .lte('created_at', tsHasta)
      .order('created_at', { ascending: false })
      .range(
        (pagina - 1) * ITEMS_POR_PAGINA,
        pagina * ITEMS_POR_PAGINA - 1,
      ),
  ]);

  // ── Lookup maps O(1) ──────────────────────────────────────────────────────
  const provNombre = new Map((proveedores ?? []).map(p => [p.id, p.nombre ?? '—']));
  const cliNombre  = new Map((clientes   ?? []).map(c => [c.id, c.nombre ?? '—']));
  const fletNombre = new Map((fleteros   ?? []).map(f => [f.id, f.nombre ?? '—']));
  const envNombre  = new Map((envases    ?? []).map(e => [e.id, e.nombre ?? '—']));
  const prodNombre = new Map((productos  ?? []).map(p => [p.id, p.nombre ?? '—']));

  // ── Mapeo ligero: VIEW row → EventoHistorial (sin sort, Postgres ya lo hizo) ──
  const eventosPaginados: EventoHistorial[] = ((rows ?? []) as HistorialRow[]).map(r =>
    mapRowToEvento(r, provNombre, cliNombre, fletNombre, envNombre, prodNombre),
  );

  // ── Paginación con datos reales de Postgres ───────────────────────────────
  const totalEventos = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalEventos / ITEMS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <ClockIcon className="h-5 w-5 text-slate-600" />
          </span>
          Historial de Operaciones
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Log de auditoría · Todas las operaciones ordenadas por hora exacta
        </p>
      </div>

      <HistorialClient
        eventos={eventosPaginados}
        desdeInicial={desde}
        hastaInicial={hasta}
        paginaActual={paginaSegura}
        totalPaginas={totalPaginas}
        totalEventos={totalEventos}
      />
    </div>
  );
}
