import { FileText } from 'lucide-react';
import ChequesClient from '@/components/cheques/ChequesClient';
import { getChequesPaginado, getChequesKPIs } from '@/app/cheques/actions';

export const dynamic = 'force-dynamic';

export default async function ChequesPage() {
  const [resultTabla, kpis] = await Promise.all([
    getChequesPaginado(undefined, 1, 25),
    getChequesKPIs(),
  ]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <FileText className="h-5 w-5 text-slate-600" />
          </span>
          Cartera de Cheques de Terceros
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Cheques recibidos y su estado · Endoso, depósito y cobro
        </p>
      </div>

      <ChequesClient
        itemsIniciales={resultTabla.items}
        totalInicial={resultTabla.total}
        kpisIniciales={kpis}
      />
    </div>
  );
}
