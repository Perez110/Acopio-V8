import { Landmark, Plus } from 'lucide-react';

export default function FinanzasPage() {
  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Landmark className="h-4 w-4" />
            <span>Contabilidad</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Finanzas</h1>
          <p className="text-gray-500 mt-1">Movimientos financieros y cuentas</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors">
          <Plus className="h-4 w-4" />
          Nuevo Movimiento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-6">
        {['Ingresos', 'Egresos', 'Saldo Neto'].map((label) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">—</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Landmark className="h-12 w-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">Sin movimientos financieros</p>
          <p className="text-sm text-gray-400 mt-1">Hacé clic en "Nuevo Movimiento" para comenzar</p>
        </div>
      </div>
    </div>
  );
}
