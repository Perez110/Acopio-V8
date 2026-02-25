import { Database } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import MaestrosClient from '@/components/maestros/MaestrosClient';

// revalidatePath en las Server Actions invalida el caché en cada mutación.
// 5 min de caché para lecturas estáticas evita miles de consultas innecesarias.
export const revalidate = 300;

export default async function MaestrosPage() {
  // Traemos TODOS los registros (incluidos inactivos) para que el CRUD pueda reactivarlos
  const [
    { data: proveedores },
    { data: clientes },
    { data: fleteros },
    { data: envases },
  ] = await Promise.all([
    supabaseServer.from('Proveedores').select('*').order('nombre'),
    supabaseServer.from('Clientes').select('*').order('nombre'),
    supabaseServer.from('Fleteros').select('*').order('nombre'),
    supabaseServer.from('Envases').select('*').order('nombre'),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
            <Database className="h-5 w-5 text-gray-600" />
          </span>
          Maestros
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Proveedores, clientes, fleteros y tipos de envase — gestión centralizada
        </p>
      </div>

      <MaestrosClient
        proveedores={proveedores ?? []}
        clientes={clientes ?? []}
        fleteros={fleteros ?? []}
        envases={envases ?? []}
      />
    </div>
  );
}
