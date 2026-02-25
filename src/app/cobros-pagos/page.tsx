import { ArrowRightLeft, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import FormCobrosPagos from '@/components/cobros-pagos/FormCobrosPagos';
import { getHistorialMovimientos, getChequesEnCartera } from '@/app/cobros-pagos/actions';

// revalidatePath en actions.ts invalida el caché tras cada cobro/pago.
// 5 min de caché para el catálogo de entidades (rara vez cambia).
export const revalidate = 300;

function fmt(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Tipo que devuelve la RPC get_kpis_financieros_mes (una fila con totales del mes)
interface KpisFinancierosMesRow {
  total_ingresos?: number | null;
  total_egresos?: number | null;
}

export default async function CobrosPagosPage() {
  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const anioActual = now.getFullYear();

  // ── Fetch en paralelo: catálogos + historial + KPIs + cheques en cartera ─
  const [
    { data: clientes },
    { data: proveedores },
    { data: fleteros },
    { data: cuentas },
    historialPaginado,
    { data: kpisMes },
    chequesEnCartera,
  ] = await Promise.all([
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Fleteros').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Cuentas_Financieras').select('id, nombre, tipo').eq('activo', true).order('nombre'),
    getHistorialMovimientos(1, 50),
    supabaseServer.rpc('get_kpis_financieros_mes', { p_mes: mesActual, p_anio: anioActual }),
    getChequesEnCartera(),
  ]);

  // KPIs del mes desde la RPC (sin reduce en JS)
  const row = (kpisMes ?? [])[0] as KpisFinancierosMesRow | undefined;
  const ingresosMes = Number(row?.total_ingresos ?? 0);
  const egresosMes = Number(row?.total_egresos ?? 0);
  const balanceMes = ingresosMes - egresosMes;

  const historialInicial = historialPaginado.items;
  const totalInicial = historialPaginado.total;

  const mesLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100">
            <ArrowRightLeft className="h-5 w-5 text-green-600" />
          </span>
          Cobros y Pagos
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Registrá cobros de clientes y pagos a proveedores o fleteros
        </p>
      </div>

      {/* Cards de resumen del mes */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`Cobros · ${mesLabel}`}
          value={fmt(ingresosMes)}
          Icon={TrendingUp}
          color="green"
        />
        <StatCard
          label={`Pagos · ${mesLabel}`}
          value={fmt(egresosMes)}
          Icon={TrendingDown}
          color="orange"
        />
        <StatCard
          label={`Balance · ${mesLabel}`}
          value={`${balanceMes >= 0 ? '+' : ''}${fmt(balanceMes)}`}
          Icon={Scale}
          color={balanceMes >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Formulario + Historial */}
      <FormCobrosPagos
        clientes={clientes ?? []}
        proveedores={proveedores ?? []}
        fleteros={fleteros ?? []}
        cuentas={cuentas ?? []}
        historialInicial={historialInicial}
        totalInicial={totalInicial}
        chequesEnCartera={chequesEnCartera ?? []}
      />
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  Icon,
  color,
}: {
  label: string;
  value: string;
  Icon: React.ElementType;
  color: 'green' | 'orange' | 'red';
}) {
  const palette = {
    green:  { icon: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
    orange: { icon: 'bg-slate-100 text-slate-500',     text: 'text-slate-900'   },
    red:    { icon: 'bg-red-100 text-red-700',          text: 'text-red-700'     },
  }[color];

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${palette.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className={`mt-0.5 text-xl font-bold ${palette.text}`}>{value}</p>
      </div>
    </div>
  );
}
