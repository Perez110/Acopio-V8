import { ArrowRightLeft } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import FormCobrosPagos from '@/components/cobros-pagos/FormCobrosPagos';
import { getHistorialMovimientos, getChequesEnCartera } from '@/app/cobros-pagos/actions';

// revalidatePath en actions.ts invalida el caché tras cada cobro/pago.
// 5 min de caché para el catálogo de entidades (rara vez cambia).
export const revalidate = 300;

/** Rango por defecto: primer día del mes actual y hoy (evita cargar todo el historial). */
function getDefaultRangoMes() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${d}` };
}

export default async function CobrosPagosPage() {
  const { desde: defaultDesde, hasta: defaultHasta } = getDefaultRangoMes();

  const [
    { data: clientes },
    { data: proveedores },
    { data: fleteros },
    { data: cuentas },
    historialPaginado,
    chequesEnCartera,
  ] = await Promise.all([
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Fleteros').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Cuentas_Financieras').select('id, nombre, tipo').eq('activo', true).order('nombre'),
    getHistorialMovimientos(1, 50, defaultDesde, defaultHasta),
    getChequesEnCartera(),
  ]);

  const historialInicial = historialPaginado.items;
  const totalInicial = historialPaginado.total;

  return (
    <div className="p-8">
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
