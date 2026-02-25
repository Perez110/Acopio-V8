'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';

export type ProductoConStock = {
  id: number;
  nombre: string | null;
  descripcion: string | null;
  precio_compra_kg: number | null;
  precio_venta_kg: number | null;
  activo: boolean | null;
  stock: number;
};

export default function ProductSearch({ productos }: { productos: ProductoConStock[] }) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = productos.filter(
    p => !busqueda || (p.nombre ?? '').toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Productos</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>
      </div>
      <p className="mb-3 text-xs text-gray-400">
        Seleccioná un producto para ver el historial de movimientos por período (ej. solo enero 2025).
      </p>

      <div className="space-y-2">
        {filtrados.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No se encontraron productos</p>
        ) : (
          filtrados.map(p => (
            <div
              key={p.id}
              className="cursor-pointer rounded-xl border border-gray-100 px-5 py-4 transition-colors hover:bg-gray-50"
            >
              <p className="font-medium text-gray-900">{p.nombre}</p>
              <p className="mt-0.5 text-xs">
                Stock Disponible (Kilos Netos):{' '}
                <span className={`font-semibold ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {p.stock.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                </span>
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
