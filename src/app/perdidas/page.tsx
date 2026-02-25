import { TrendingDown } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import PerdidasClient from '@/components/perdidas/PerdidasClient';
import { getPerdidasFiltradas, getPerdidasKPIs } from '@/app/perdidas/actions';

// Revalidar cada 60s; los datos de pérdidas cambian con conciliaciones
export const revalidate = 60;

export default async function PerdidasPage() {
  const [resultTabla, resultKpis, { data: clientes }] = await Promise.all([
    getPerdidasFiltradas(undefined, undefined, undefined, 1, 50),
    getPerdidasKPIs(undefined, undefined, undefined),
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  const clientesList = (clientes ?? []).map(c => ({ id: c.id, nombre: c.nombre ?? `Cliente #${c.id}` }));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100">
            <TrendingDown className="h-5 w-5 text-red-600" />
          </span>
          Análisis de Pérdidas
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Merma y descuentos de calidad · Visualización y exportación de fugas de capital
        </p>
      </div>

      <PerdidasClient
        filas={resultTabla.filas}
        total={resultTabla.total}
        kpis={resultKpis}
        clientes={clientesList}
      />
    </div>
  );
}
