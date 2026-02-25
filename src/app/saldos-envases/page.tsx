import { Scale } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import SaldosClient from '@/components/saldos-envases/SaldosClient';
import type { SaldoEntidad, SaldoPorEnvase } from '@/components/saldos-envases/SaldosClient';

// Revalida cada 30s — los saldos cambian con más frecuencia que el stock
export const revalidate = 30;

// Tipo que devuelve la vista v_saldos_envases_total
interface VSaldoRow {
  proveedor_id?: number | null;
  cliente_id?: number | null;
  envase_id?: number;
  envase_nombre?: string;
  saldo_neto?: number;
}

function readSaldoNeto(row: VSaldoRow): number | null {
  const raw = row.saldo_neto ?? (row as Record<string, unknown>).saldoNeto;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return n;
}

function buildSaldosFromRows(
  rows: VSaldoRow[],
  envaseMap: Map<number, string>,
  provMap: Map<number, string>,
  cliMap: Map<number, string>,
): SaldoEntidad[] {
  type EntityKey = string;
  const mapByEntity = new Map<EntityKey, { envaseId: number; envaseNombre: string; saldo: number }[]>();

  for (const row of rows) {
    const provId = row.proveedor_id ?? (row as Record<string, unknown>).proveedor_id;
    const cliId = row.cliente_id ?? (row as Record<string, unknown>).cliente_id;
    const key: EntityKey | null =
      provId != null ? `proveedor_${provId}` :
      cliId != null ? `cliente_${cliId}` : null;
    if (!key) continue;

    const rawSaldo = readSaldoNeto(row);
    if (rawSaldo === null) {
      console.error('[v_saldos_envases_total] saldo_neto indefinido, nulo o no numérico. Fila:', JSON.stringify(row));
      continue;
    }

    const envaseId = Number(row.envase_id ?? (row as Record<string, unknown>).envase_id ?? 0);
    const envaseNombre = row.envase_nombre ?? (row as Record<string, unknown>).envase_nombre ?? envaseMap.get(envaseId) ?? `Envase #${envaseId}`;

    if (!mapByEntity.has(key)) mapByEntity.set(key, []);
    mapByEntity.get(key)!.push({
      envaseId,
      envaseNombre: String(envaseNombre),
      saldo: rawSaldo,
    });
  }

  const saldos: SaldoEntidad[] = [];

  for (const [key, items] of mapByEntity.entries()) {
    const [tipo, idStr] = key.split('_');
    const entityId = Number(idStr);
    const entityType = tipo as 'proveedor' | 'cliente';
    const entityNombre = entityType === 'proveedor' ? provMap.get(entityId) ?? `Proveedor #${entityId}` : cliMap.get(entityId) ?? `Cliente #${entityId}`;

    const saldoPorEnvase: SaldoPorEnvase[] = items.map(({ envaseId, envaseNombre, saldo }) => ({
      envaseId,
      envaseNombre,
      saldo,
    }));
    const totalSaldo = items.reduce((s, i) => s + i.saldo, 0);

    saldos.push({ entityType, entityId, entityNombre, saldoPorEnvase, totalSaldo });
  }

  saldos.sort((a, b) => Math.abs(b.totalSaldo) - Math.abs(a.totalSaldo));
  return saldos;
}

export default async function SaldosEnvasesPage() {
  const [
    { data: proveedores },
    { data: clientes },
    { data: envases },
    { data: filasVista },
  ] = await Promise.all([
    supabaseServer.from('Proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Envases').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer
      .from('v_saldos_envases_total' as string)
      .select('proveedor_id, cliente_id, envase_id, envase_nombre, saldo_neto'),
  ]);

  const envaseMap = new Map((envases ?? []).map(e => [e.id, e.nombre ?? `Envase #${e.id}`]));
  const provMap = new Map((proveedores ?? []).map(p => [p.id, p.nombre ?? `Proveedor #${p.id}`]));
  const cliMap = new Map((clientes ?? []).map(c => [c.id, c.nombre ?? `Cliente #${c.id}`]));

  const todasFilas = (filasVista ?? []) as VSaldoRow[];
  const saldosTodos = buildSaldosFromRows(todasFilas, envaseMap, provMap, cliMap);

  // Pendientes = suma de envases ≠ 0
  const saldosPendientes = saldosTodos.filter(s => s.totalSaldo !== 0);
  // Pagados = únicamente suma exactamente 0
  const saldosPagados = saldosTodos.filter(s => s.totalSaldo === 0);

  const keysEnVista = new Set(saldosTodos.map(s => `${s.entityType}_${s.entityId}`));
  for (const p of proveedores ?? []) {
    if (!keysEnVista.has(`proveedor_${p.id}`)) {
      saldosPagados.push({
        entityType: 'proveedor',
        entityId: p.id,
        entityNombre: p.nombre ?? `Proveedor #${p.id}`,
        saldoPorEnvase: [],
        totalSaldo: 0,
      });
    }
  }
  for (const c of clientes ?? []) {
    if (!keysEnVista.has(`cliente_${c.id}`)) {
      saldosPagados.push({
        entityType: 'cliente',
        entityId: c.id,
        entityNombre: c.nombre ?? `Cliente #${c.id}`,
        saldoPorEnvase: [],
        totalSaldo: 0,
      });
    }
  }
  saldosPendientes.sort((a, b) => Math.abs(b.totalSaldo) - Math.abs(a.totalSaldo));
  saldosPagados.sort((a, b) => a.entityNombre.localeCompare(b.entityNombre));

  const provPendientes = saldosPendientes.filter(s => s.entityType === 'proveedor');
  const cliPendientes = saldosPendientes.filter(s => s.entityType === 'cliente');

  const statsProveedores = {
    total: provPendientes.length,
    conDeuda: provPendientes.filter(s => s.totalSaldo < 0).length,
    totalEnvasesPendientes: provPendientes.reduce((sum, s) => sum + Math.abs(s.totalSaldo), 0),
  };
  const statsClientes = {
    total: cliPendientes.length,
    conDeuda: cliPendientes.filter(s => s.totalSaldo < 0).length,
    totalEnvasesPendientes: cliPendientes.reduce((sum, s) => sum + Math.abs(s.totalSaldo), 0),
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100">
            <Scale className="h-5 w-5 text-red-600" />
          </span>
          Saldos de Envases
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Saldos de envases por entidad · Cálculo en base de datos (vista v_saldos_envases_total)
        </p>
      </div>

      <SaldosClient
        saldosPendientes={saldosPendientes}
        saldosPagados={saldosPagados}
        statsProveedores={statsProveedores}
        statsClientes={statsClientes}
      />
    </div>
  );
}
