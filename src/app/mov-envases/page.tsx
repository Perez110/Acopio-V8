import { ArrowLeftRight } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import FormMovEnvases from '@/components/mov-envases/FormMovEnvases';

// revalidatePath en las actions invalida el caché tras cada movimiento.
// 5 min de caché para los catálogos de entidades y envases.
export const revalidate = 300;

export default async function MovEnvasesPage() {
  const [
    { data: proveedores },
    { data: clientes },
    { data: fleteros },
    { data: envases },
  ] = await Promise.all([
    supabaseServer.from('Proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Fleteros').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Envases').select('id, nombre, tara_kg').eq('activo', true).order('nombre'),
  ]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <ArrowLeftRight className="h-5 w-5 text-orange-600" />
          </span>
          Movimiento de Envases
        </h1>
        <p className="mt-1 text-sm text-gray-500">Registrar entrada o salida de envases</p>
      </div>

      {/* Formulario interactivo (Client Component) */}
      <FormMovEnvases
        proveedores={proveedores ?? []}
        clientes={clientes ?? []}
        fleteros={fleteros ?? []}
        envases={envases ?? []}
      />
    </div>
  );
}
