import { Truck } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import LiquidacionFleterosClient from '@/components/fleteros/LiquidacionFleterosClient';

// Sin caché: los pagos y viajes cambian constantemente
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface FleteroBasico {
  id: number;
  nombre: string | null;
  precio_por_kg: number | null;
  precio_viaje_vacios: number | null;
}

export default async function FleterosPage() {
  // Solo traemos los fleteros activos para el selector — datos mínimos
  const { data } = await supabaseServer
    .from('Fleteros')
    .select('id, nombre, precio_por_kg, precio_viaje_vacios')
    .eq('activo', true)
    .order('nombre');

  const fleteros = (data ?? []) as FleteroBasico[];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <Truck className="h-5 w-5 text-slate-600" />
          </span>
          Liquidación de Fleteros
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Viajes devengados vs. adelantos realizados · gestión de pagos a transportistas
        </p>
      </div>

      <LiquidacionFleterosClient fleteros={fleteros} />
    </div>
  );
}
