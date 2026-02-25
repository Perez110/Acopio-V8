import { ArrowDownToLine, Plus } from 'lucide-react';

export default function EntradasPage() {
  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <ArrowDownToLine className="h-4 w-4" />
            <span>Registro de ingresos</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Entradas de Fruta</h1>
          <p className="text-gray-500 mt-1">Gestión de ingresos de fruta al acopio</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors">
          <Plus className="h-4 w-4" />
          Nueva Entrada
        </button>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ArrowDownToLine className="h-12 w-12 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">Sin entradas registradas</p>
          <p className="text-sm text-gray-400 mt-1">Hacé clic en "Nueva Entrada" para comenzar</p>
        </div>
      </div>
    </div>
  );
}
