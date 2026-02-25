import Link from 'next/link';
import { FileBarChart, ArrowRightLeft } from 'lucide-react';
import { fetchInformeProveedores, fetchInformeClientes } from './actions';
import InformesClient from '@/components/informes/InformesClient';

// Sin cache: los informes siempre deben mostrar datos frescos
export const revalidate = 0;

/** Calcula el primer y último día del mes actual en formato ISO. */
function getMesActual(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = new Date(y, m, 0).toISOString().split('T')[0];
  return { start, end };
}

export default async function InformesPage() {
  const { start, end } = getMesActual();

  // Pre-fetch ambas vistas en paralelo para el mes actual
  const [rowsProveedores, rowsClientes] = await Promise.all([
    fetchInformeProveedores(start, end),
    fetchInformeClientes(start, end),
  ]);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100">
            <FileBarChart className="h-5 w-5 text-purple-600" />
          </span>
          Informes — Estado de Cuenta
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Rendimiento por entidad con saldo arrastrado · Toda la matemática ocurre en el servidor
        </p>
        <Link
          href="/informes/movimientos-internos"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Reporte de Movimientos Internos (transferencias entre cajas/bancos)
        </Link>
      </div>

      <InformesClient
        rowsProveedoresInicial={rowsProveedores}
        rowsClientesInicial={rowsClientes}
        startInicial={start}
        endInicial={end}
      />
    </div>
  );
}
