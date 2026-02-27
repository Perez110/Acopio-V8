import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import { formatCurrency, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Tipo que devuelve la RPC get_dashboard_kpis (una fila)
interface DashboardKPIsRow {
  entradas_mes_kg?: number | null;
  salidas_mes_kg?: number | null;
  saldo_financiero_mes?: number | null;
  stock_bines_actual?: number | null;
}

// Tipos para las listas limitadas (Supabase puede devolver la relación FK como array u objeto)
type ProveedorNombre = { nombre: string | null };
type ClienteNombre = { nombre: string | null };

interface UltimaEntradaRow {
  id: number;
  fecha_entrada: string | null;
  created_at: string | null;
  peso_neto_kg: number | null;
  Proveedores: ProveedorNombre[] | ProveedorNombre | null;
}

interface UltimaSalidaRow {
  id: number;
  fecha_salida: string | null;
  created_at: string | null;
  peso_salida_acopio_kg: number | null;
  Clientes: ClienteNombre[] | ClienteNombre | null;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** Formato fecha + hora para trazabilidad (ej: 27/02/2026 14:30 hs) */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes} hs`;
}

function nombreProveedor(e: UltimaEntradaRow): string {
  const p = e.Proveedores;
  if (!p) return 'Sin nombre';
  const name = Array.isArray(p) ? p[0]?.nombre : p.nombre;
  return (name?.trim()) || 'Sin nombre';
}

function nombreCliente(s: UltimaSalidaRow): string {
  const c = s.Clientes;
  if (!c) return 'Sin nombre';
  const name = Array.isArray(c) ? c[0]?.nombre : c.nombre;
  return (name?.trim()) || 'Sin nombre';
}

export default async function DashboardPage() {
  const now = new Date();
  const p_mes = now.getMonth() + 1;
  const p_anio = now.getFullYear();

  // Inicio y fin del mes actual (YYYY-MM-DD) para filtro estricto en listas
  const startOfMonth = `${p_anio}-${String(p_mes).padStart(2, '0')}-01`;
  const lastDay = new Date(p_anio, p_mes, 0).getDate();
  const endOfMonth = `${p_anio}-${String(p_mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Una sola RPC para todos los KPIs (cálculo en base de datos, filtrado por mes/año)
  const { data: kpisRows } = await supabaseServer.rpc('get_dashboard_kpis', {
    p_mes,
    p_anio,
  });

  // Últimas 10 entradas y 10 salidas del MES ACTUAL (join con Proveedores/Clientes, created_at para fecha+hora)
  const [
    { data: ultimasEntradas },
    { data: ultimasSalidas },
  ] = await Promise.all([
    supabaseServer
      .from('Entradas_Fruta')
      .select('id, fecha_entrada, created_at, peso_neto_kg, Proveedores(nombre)')
      .gte('fecha_entrada', startOfMonth)
      .lte('fecha_entrada', endOfMonth)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseServer
      .from('Salidas_Fruta')
      .select('id, fecha_salida, created_at, peso_salida_acopio_kg, Clientes(nombre)')
      .gte('fecha_salida', startOfMonth)
      .lte('fecha_salida', endOfMonth)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const row = (kpisRows ?? [])[0] as DashboardKPIsRow | undefined;
  const entradasMesKg = Number(row?.entradas_mes_kg ?? 0);
  const salidasMesKg = Number(row?.salidas_mes_kg ?? 0);
  const saldoFinancieroMes = Number(row?.saldo_financiero_mes ?? 0);
  const stockBinesActual = Number(row?.stock_bines_actual ?? 0);

  const entradasList = (ultimasEntradas ?? []) as unknown as UltimaEntradaRow[];
  const salidasList = (ultimasSalidas ?? []) as unknown as UltimaSalidaRow[];

  const stats = [
    {
      label: 'Entradas del mes',
      value: formatNumber(entradasMesKg),
      unit: 'kg',
      icon: ArrowDownToLine,
      color: 'bg-emerald-50 text-emerald-700',
      border: 'border-emerald-100',
    },
    {
      label: 'Salidas del mes',
      value: formatNumber(salidasMesKg),
      unit: 'kg',
      icon: ArrowUpFromLine,
      color: 'bg-teal-50 text-teal-700',
      border: 'border-teal-100',
    },
    {
      label: 'Stock en Bines',
      value: formatNumber(stockBinesActual),
      unit: 'bines',
      icon: Package,
      color: 'bg-green-50 text-green-700',
      border: 'border-green-100',
    },
    {
      label: 'Saldo Financiero',
      value: formatCurrency(saldoFinancieroMes),
      unit: '',
      icon: Landmark,
      color: 'bg-slate-100 text-slate-600',
      border: 'border-slate-200',
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <TrendingUp className="h-4 w-4" />
          <span>Resumen general</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Bienvenido al sistema de gestión de acopio</p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, unit, icon: Icon, color, border }) => (
          <div
            key={label}
            className={`rounded-xl border ${border} bg-white p-6 shadow-sm`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {value}
                  {unit ? (
                    <span className="ml-1 text-base font-normal text-gray-400">{unit}</span>
                  ) : null}
                </p>
              </div>
              <div className={`rounded-lg p-2.5 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sección de actividad reciente */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Últimas Entradas</h2>
          {entradasList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ArrowDownToLine className="h-10 w-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin entradas registradas aún</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {entradasList.map((e) => (
                <li key={e.id} className="grid grid-cols-[1fr_minmax(0,2fr)_auto] items-center gap-3 py-2.5 first:pt-0">
                  <span className="text-sm text-gray-500 shrink-0" title={e.created_at ?? undefined}>
                    {formatDateTime(e.created_at)}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate min-w-0" title={nombreProveedor(e)}>
                    {nombreProveedor(e)}
                  </span>
                  <span className="font-mono text-sm font-semibold text-gray-900 text-right shrink-0">
                    {formatNumber(e.peso_neto_kg ?? 0)} kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Últimas Salidas</h2>
          {salidasList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ArrowUpFromLine className="h-10 w-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-400">Sin salidas registradas aún</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {salidasList.map((s) => (
                <li key={s.id} className="grid grid-cols-[1fr_minmax(0,2fr)_auto] items-center gap-3 py-2.5 first:pt-0">
                  <span className="text-sm text-gray-500 shrink-0" title={s.created_at ?? undefined}>
                    {formatDateTime(s.created_at)}
                  </span>
                  <span className="text-sm font-medium text-gray-900 truncate min-w-0" title={nombreCliente(s)}>
                    {nombreCliente(s)}
                  </span>
                  <span className="font-mono text-sm font-semibold text-gray-900 text-right shrink-0">
                    {formatNumber(s.peso_salida_acopio_kg ?? 0)} kg
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
