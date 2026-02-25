import { Tag } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import ProductosPreciosClient from '@/components/productos/ProductosPreciosClient';

// revalidatePath en las actions invalida el caché al editar precios.
export const revalidate = 300;

export default async function ProductosPreciosPage() {
  const { data: productos } = await supabaseServer
    .from('Productos')
    .select('*')
    .order('nombre');

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
            <Tag className="h-5 w-5 text-amber-600" />
          </span>
          Productos y Precios
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Catálogo de productos — precios de compra y venta configurables
        </p>
      </div>

      <ProductosPreciosClient productos={productos ?? []} />
    </div>
  );
}
