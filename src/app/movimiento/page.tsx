'use client';

import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CheckSquare } from 'lucide-react';
import IngresoFruta from '@/components/movimiento/IngresoFruta';
import SalidaFruta from '@/components/movimiento/SalidaFruta';
import ConfirmarSalidas from '@/components/movimiento/ConfirmarSalidas';

const TABS = [
  { id: 'ingreso', label: 'Ingreso', icon: ArrowDownToLine },
  { id: 'salida', label: 'Salida', icon: ArrowUpFromLine },
  { id: 'conciliacion', label: 'Conciliación', icon: CheckSquare },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function MovimientoPage() {
  const [tab, setTab] = useState<TabId>('ingreso');

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="text-2xl leading-none">🍏</span>
          Movimiento de Fruta
        </h1>
        <p className="mt-1 text-sm text-gray-500">Gestión completa de ingresos y salidas de fruta</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
              tab === id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido del tab activo */}
      {tab === 'ingreso' && <IngresoFruta />}
      {tab === 'salida' && <SalidaFruta />}
      {tab === 'conciliacion' && <ConfirmarSalidas />}
    </div>
  );
}
