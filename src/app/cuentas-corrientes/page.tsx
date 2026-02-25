import { Users } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import CuentasCorrientesClient from '@/components/cuentas-corrientes/CuentasCorrientesClient';
import type {
  SaldoCliente,
  StatsCC,
  SaldoProveedor,
  StatsProv,
} from '@/components/cuentas-corrientes/CuentasCorrientesClient';

export const revalidate = 30;

// ── Tipos que devuelven los RPCs ──────────────────────────────────────────────
interface RpcSaldoCliente {
  cliente_id: number;
  total_facturado: number;
  total_cobrado: number;
  cant_salidas: number;
  cant_cobros: number;
  ultima_fecha_salida: string | null;
  ultima_fecha_cobro: string | null;
}

interface RpcSaldoProveedor {
  proveedor_id: number;
  total_comprado: number;
  total_pagado: number;
  cant_entradas: number;
  cant_pagos: number;
  ultima_fecha_entrada: string | null;
  ultima_fecha_pago: string | null;
}

export default async function CuentasCorrientesPage() {
  // ── Fetch paralelo ────────────────────────────────────────────────────────
  // Solo 4 queries: 2 tablas pequeñas (nombres/teléfonos) + 2 RPCs que
  // devuelven 1 fila por entidad con los totales ya calculados en Postgres.
  // Antes: se traían SIN LÍMITE Entradas_Fruta, Movimientos_Financieros,
  // Salidas_Fruta y Cobros_Clientes completos a Node.js.
  const [
    { data: clientes },
    { data: proveedores },
    { data: saldosCliRpc },
    { data: saldosProvRpc },
  ] = await Promise.all([
    supabaseServer.from('Clientes').select('id, nombre, telefono').order('nombre'),
    supabaseServer.from('Proveedores').select('id, nombre, telefono').order('nombre'),
    supabaseServer.rpc('get_saldos_clientes'),
    supabaseServer.rpc('get_saldos_proveedores'),
  ]);

  // ── Lookup maps de entidades (O(1) por búsqueda) ─────────────────────────
  const cliMap  = new Map((clientes  ?? []).map(c => [c.id, c]));
  const provMap = new Map((proveedores ?? []).map(p => [p.id, p]));

  // ── Mapear RPC → SaldoCliente[] ───────────────────────────────────────────
  const saldosClientes: SaldoCliente[] = ((saldosCliRpc ?? []) as RpcSaldoCliente[]).map(r => {
    const cli          = cliMap.get(r.cliente_id);
    const totalFacturado = Number(r.total_facturado ?? 0);
    const totalCobrado   = Number(r.total_cobrado   ?? 0);
    const saldo          = parseFloat((totalFacturado - totalCobrado).toFixed(2));

    const fechas = [r.ultima_fecha_salida, r.ultima_fecha_cobro].filter(Boolean) as string[];
    const ultimaActividad = fechas.length > 0 ? [...fechas].sort().at(-1)! : null;

    return {
      clienteId:          r.cliente_id,
      clienteNombre:      cli?.nombre   ?? `Cliente #${r.cliente_id}`,
      telefono:           (cli as { telefono?: string | null } | undefined)?.telefono ?? null,
      totalFacturado,
      totalCobrado,
      saldo,
      cantSalidas:        Number(r.cant_salidas ?? 0),
      cantCobros:         Number(r.cant_cobros  ?? 0),
      ultimaFechaSalida:  r.ultima_fecha_salida  ?? null,
      ultimaFechaCobro:   r.ultima_fecha_cobro   ?? null,
      ultimaActividad,
    };
  });
  saldosClientes.sort((a, b) => b.saldo - a.saldo);

  const activosClientes  = saldosClientes.filter(s => s.saldo > 0);
  const cerradosClientes = saldosClientes.filter(s => s.saldo <= 0 && s.totalFacturado > 0);

  const statsClientes: StatsCC = {
    totalClientes:  (clientes ?? []).length,
    totalConDeuda:  activosClientes.length,
    totalFacturado: parseFloat(saldosClientes.reduce((s, a) => s + a.totalFacturado, 0).toFixed(2)),
    totalCobrado:   parseFloat(saldosClientes.reduce((s, a) => s + a.totalCobrado,   0).toFixed(2)),
    totalPendiente: parseFloat(activosClientes.reduce((s, a) => s + a.saldo,          0).toFixed(2)),
    totalCerrados:  cerradosClientes.length,
  };

  // ── Mapear RPC → SaldoProveedor[] ────────────────────────────────────────
  const saldosProveedores: SaldoProveedor[] = ((saldosProvRpc ?? []) as RpcSaldoProveedor[]).map(r => {
    const prov         = provMap.get(r.proveedor_id);
    const totalComprado = Number(r.total_comprado ?? 0);
    const totalPagado   = Number(r.total_pagado   ?? 0);
    const saldo         = parseFloat((totalComprado - totalPagado).toFixed(2));

    const fechas = [r.ultima_fecha_entrada, r.ultima_fecha_pago].filter(Boolean) as string[];
    const ultimaActividad = fechas.length > 0 ? [...fechas].sort().at(-1)! : null;

    return {
      proveedorId:         r.proveedor_id,
      proveedorNombre:     prov?.nombre  ?? `Proveedor #${r.proveedor_id}`,
      telefono:            (prov as { telefono?: string | null } | undefined)?.telefono ?? null,
      totalComprado,
      totalPagado,
      saldo,
      cantEntradas:        Number(r.cant_entradas ?? 0),
      cantPagos:           Number(r.cant_pagos    ?? 0),
      ultimaFechaEntrada:  r.ultima_fecha_entrada ?? null,
      ultimaFechaPago:     r.ultima_fecha_pago    ?? null,
      ultimaActividad,
    };
  });
  saldosProveedores.sort((a, b) => b.saldo - a.saldo);

  const activosProv  = saldosProveedores.filter(s => s.saldo > 0);
  const cerradosProv = saldosProveedores.filter(s => s.saldo <= 0 && s.totalComprado > 0);

  const statsProveedores: StatsProv = {
    totalProveedores: (proveedores ?? []).length,
    totalConDeuda:    activosProv.length,
    totalComprado:    parseFloat(saldosProveedores.reduce((s, a) => s + a.totalComprado, 0).toFixed(2)),
    totalPagado:      parseFloat(saldosProveedores.reduce((s, a) => s + a.totalPagado,   0).toFixed(2)),
    totalPendiente:   parseFloat(activosProv.reduce((s, a) => s + a.saldo,               0).toFixed(2)),
    totalCerrados:    cerradosProv.length,
  };

  // ── Default entity: la que tenga más deuda activa ─────────────────────────
  const defaultEntity: 'clientes' | 'proveedores' =
    statsProveedores.totalPendiente > statsClientes.totalPendiente
      ? 'proveedores'
      : 'clientes';

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
            <Users className="h-5 w-5 text-blue-600" />
          </span>
          Cuentas Corrientes
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Clientes: Σ(Salidas · Precio) − Σ(Cobros) · Proveedores: Σ(Entradas) − Σ(Pagos)
        </p>
      </div>

      <CuentasCorrientesClient
        saldosClientes={saldosClientes}
        statsClientes={statsClientes}
        saldosProveedores={saldosProveedores}
        statsProveedores={statsProveedores}
        defaultEntity={defaultEntity}
      />
    </div>
  );
}
