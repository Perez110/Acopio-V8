import { Landmark } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import CajasBancosClient, { type CuentaConSaldo } from '@/components/cajas-bancos/CajasBancosClient';
import type { CuentaFinanciera } from '@/types/database';

// Revalidar cada 30s: los movimientos de cobros/pagos cambian el saldo
export const revalidate = 30;

// Tipo que devuelve el RPC get_saldos_cuentas()
interface SaldoCuentaRpc {
  cuenta_financiera_id: number;
  total_ingresos: number;
  total_egresos: number;
}

export default async function CajasBancosPage() {
  // ── Fetch paralelo: cuentas (pequeña tabla) + saldos calculados por Postgres ─
  // Antes: se traía TODA la tabla Movimientos_Financieros a Node.js sin límite.
  // Ahora: el RPC retorna 1 fila por cuenta con los totales ya agregados.
  const [{ data: cuentasRaw }, { data: saldosRpc }] = await Promise.all([
    supabaseServer
      .from('Cuentas_Financieras')
      .select('*')
      .order('nombre'),
    supabaseServer.rpc('get_saldos_cuentas'),
  ]);

  const cuentas = (cuentasRaw ?? []) as CuentaFinanciera[];

  // Mapa cuenta_id → { ingresos, egresos } para lookup O(1)
  const saldosMap = new Map<number, { ingresos: number; egresos: number }>();
  for (const s of (saldosRpc ?? []) as SaldoCuentaRpc[]) {
    saldosMap.set(s.cuenta_financiera_id, {
      ingresos: Number(s.total_ingresos ?? 0),
      egresos:  Number(s.total_egresos  ?? 0),
    });
  }

  // ── Calcular saldo real por cuenta ────────────────────────────────────────
  // Fórmula: Saldo Inicial + Σ(INGRESO) − Σ(EGRESO)
  const cuentasConSaldo: CuentaConSaldo[] = cuentas.map(cuenta => {
    const s = saldosMap.get(cuenta.id);
    const ingresos  = s?.ingresos ?? 0;
    const egresos   = s?.egresos  ?? 0;
    const saldoActual = (cuenta.saldo_inicial ?? 0) + ingresos - egresos;
    return { ...cuenta, ingresos, egresos, saldoActual };
  });

  // ── Totales globales (solo cuentas activas) ───────────────────────────────
  const activas        = cuentasConSaldo.filter(c => c.activo !== false);
  const totalSaldo     = activas.reduce((s, c) => s + c.saldoActual, 0);
  const totalIngresos  = activas.reduce((s, c) => s + c.ingresos,    0);
  const totalEgresos   = activas.reduce((s, c) => s + c.egresos,     0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100">
            <Landmark className="h-5 w-5 text-purple-600" />
          </span>
          Cajas y Bancos
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Saldo real = Saldo inicial + Ingresos − Egresos registrados en Cobros y Pagos
        </p>
      </div>

      <CajasBancosClient
        cuentas={cuentasConSaldo}
        totalSaldo={totalSaldo}
        totalIngresos={totalIngresos}
        totalEgresos={totalEgresos}
      />
    </div>
  );
}
