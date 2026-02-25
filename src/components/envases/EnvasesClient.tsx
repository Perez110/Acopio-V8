'use client';

import { useState } from 'react';
import { ArrowLeftRight, Scale } from 'lucide-react';
import FormMovEnvases from '@/components/mov-envases/FormMovEnvases';
import SaldosClient, { type SaldoEntidad } from '@/components/saldos-envases/SaldosClient';
import type { Proveedor, Cliente, Fletero, Envase } from '@/types/database';

type Stats = {
  total: number;
  conDeuda: number;
  totalEnvasesPendientes: number;
};

interface Props {
  // Datos para el formulario de movimientos
  proveedores: Proveedor[];
  clientes: Cliente[];
  fleteros: Fletero[];
  envases: Envase[];
  // Datos precalculados para los saldos (vista v_saldos_envases_total)
  saldosPendientes: SaldoEntidad[];
  saldosPagados: SaldoEntidad[];
  statsProveedores: Stats;
  statsClientes: Stats;
}

type TabId = 'movimientos' | 'saldos';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'movimientos', label: 'Movimientos de Envases', icon: ArrowLeftRight },
  { id: 'saldos', label: 'Saldos por Entidad', icon: Scale },
];

export default function EnvasesClient({
  proveedores,
  clientes,
  fleteros,
  envases,
  saldosPendientes,
  saldosPagados,
  statsProveedores,
  statsClientes,
}: Props) {
  const [tab, setTab] = useState<TabId>('movimientos');

  return (
    <div>
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

      {tab === 'movimientos' && (
        <FormMovEnvases
          proveedores={proveedores}
          clientes={clientes}
          fleteros={fleteros}
          envases={envases}
        />
      )}

      {tab === 'saldos' && (
        <SaldosClient
          saldosPendientes={saldosPendientes}
          saldosPagados={saldosPagados}
          statsProveedores={statsProveedores}
          statsClientes={statsClientes}
        />
      )}
    </div>
  );
}
