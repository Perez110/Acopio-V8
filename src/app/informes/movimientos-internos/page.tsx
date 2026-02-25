import Link from 'next/link';
import { FileBarChart, ArrowLeft } from 'lucide-react';
import MovimientosInternosReport from '@/components/informes/MovimientosInternosReport';

export const revalidate = 0;

export default function MovimientosInternosPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/informes"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Informes
        </Link>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100">
            <FileBarChart className="h-5 w-5 text-purple-600" />
          </span>
          Informes — Movimientos Internos
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Transferencias entre cajas y bancos · Generá el reporte por rango de fechas (máx. 6 meses)
        </p>
      </div>
      <MovimientosInternosReport />
    </div>
  );
}
