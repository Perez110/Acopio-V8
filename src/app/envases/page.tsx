import { Package } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import EnvasesClient from '@/components/envases/EnvasesClient';
import type { SaldoEntidad, SaldoPorEnvase } from '@/components/saldos-envases/SaldosClient';

// Forzar refresco: no cachear esta página para evitar datos viejos de saldos.
export const revalidate = 0;

// Tipo que devuelve la vista v_saldos_envases_total (Supabase puede devolver snake_case o camelCase)
interface VSaldoRow {
  proveedor_id?: number | null;
  cliente_id?: number | null;
  envase_id?: number;
  envase_nombre?: string;
  saldo_neto?: number;
  saldoNeto?: number;
  esta_saldado?: boolean;
}

/** Obtiene saldo_neto de la fila (vista puede devolver saldo_neto o saldoNeto). No devuelve 0 si falta. */
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

  // Debug: imprimir qué devuelve la vista (claves de la primera fila y valores de saldo)
  if (rows.length > 0 && typeof process !== 'undefined') {
    const first = rows[0] as Record<string, unknown>;
    console.log('[v_saldos_envases_total] Claves recibidas:', Object.keys(first));
    console.log('[v_saldos_envases_total] Primera fila saldo_neto / saldoNeto:', first.saldo_neto, first.saldoNeto);
  }

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
    const saldo = rawSaldo;

    const envaseId = row.envase_id ?? (row as Record<string, unknown>).envase_id ?? 0;
    const envaseNombre = row.envase_nombre ?? (row as Record<string, unknown>).envase_nombre ?? envaseMap.get(envaseId) ?? `Envase #${envaseId}`;

    if (!mapByEntity.has(key)) mapByEntity.set(key, []);
    mapByEntity.get(key)!.push({
      envaseId,
      envaseNombre: String(envaseNombre),
      saldo,
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
    // Agregación por persona: suma de saldo_neto de TODAS las filas (todos los bines) de esta entidad
    const totalSaldo = items.reduce((s, i) => s + i.saldo, 0);

    if (totalSaldo === 0 && items.length > 0) {
      console.warn('[v_saldos_envases_total] Entidad con suma 0 pero tiene filas. Revisar saldo_neto recibido:', entityNombre, key, items.map(i => ({ envase: i.envaseNombre, saldo: i.saldo })));
    }

    saldos.push({ entityType, entityId, entityNombre, saldoPorEnvase, totalSaldo });
  }

  saldos.sort((a, b) => Math.abs(b.totalSaldo) - Math.abs(a.totalSaldo));
  return saldos;
}

export default async function EnvasesPage() {
  const [
    { data: proveedores },
    { data: clientes },
    { data: fleteros },
    { data: envases },
    { data: filasVista },
  ] = await Promise.all([
    supabaseServer.from('Proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Fleteros').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer.from('Envases').select('id, nombre').eq('activo', true).order('nombre'),
    supabaseServer
      .from('v_saldos_envases_total' as string)
      .select('proveedor_id, cliente_id, envase_id, envase_nombre, saldo_neto'),
  ]);

  const envaseMap = new Map((envases ?? []).map(e => [e.id, e.nombre ?? `Envase #${e.id}`]));
  const provMap = new Map((proveedores ?? []).map(p => [p.id, p.nombre ?? `Proveedor #${p.id}`]));
  const cliMap = new Map((clientes ?? []).map(c => [c.id, c.nombre ?? `Cliente #${c.id}`]));

  const todasFilas = (filasVista ?? []) as VSaldoRow[];
  if (typeof process !== 'undefined') {
    console.log('[v_saldos_envases_total] Filas recibidas de la vista:', todasFilas.length);
  }
  const saldosTodos = buildSaldosFromRows(todasFilas, envaseMap, provMap, cliMap);

  // Pendientes = suma de todos los envases ≠ 0 (Juan Perez con deuda, Pepito con 50 a favor, etc.)
  const saldosPendientes = saldosTodos.filter(s => s.totalSaldo !== 0);
  // Pagados = ÚNICAMENTE entidades cuya suma de envases es exactamente 0
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

  // Deuda = saldo negativo (nos deben); a favor = saldo positivo (les debemos). Conteo por valor absoluto.
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
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <Package className="h-5 w-5 text-orange-600" />
          </span>
          Envases / Bines
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Movimientos de envases vacíos y saldos por entidad · Cálculo en base de datos (vista v_saldos_envases_total)
        </p>
      </div>

      <EnvasesClient
        proveedores={proveedores ?? []}
        clientes={clientes ?? []}
        fleteros={fleteros ?? []}
        envases={envases ?? []}
        saldosPendientes={saldosPendientes}
        saldosPagados={saldosPagados}
        statsProveedores={statsProveedores}
        statsClientes={statsClientes}
      />
    </div>
  );
}
