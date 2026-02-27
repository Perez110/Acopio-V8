/**
 * Cálculo de saldo actual de una cuenta financiera (solo servidor).
 * Fórmula: saldo_inicial + ingresos - egresos (MF + MI).
 * Usado por actions de Cobros/Pagos y Cajas/Bancos para validar fondos insuficientes.
 */
import { supabaseServer } from '@/lib/supabase-server';

export interface SaldoCuentaResult {
  saldo: number;
  error?: string;
}

/**
 * Devuelve el saldo actual de la cuenta (saldo_inicial + Σ ingresos − Σ egresos)
 * considerando Movimientos_Financieros y Movimientos_Internos.
 */
export async function getSaldoActualCuenta(cuentaId: number): Promise<SaldoCuentaResult> {
  try {
    const { data: cuenta, error: errCuenta } = await supabaseServer
      .from('Cuentas_Financieras')
      .select('id, saldo_inicial')
      .eq('id', cuentaId)
      .single();

    if (errCuenta || !cuenta) {
      return { saldo: 0, error: 'Cuenta no encontrada.' };
    }

    const saldoInicial = Number(cuenta.saldo_inicial ?? 0);

    const { data: rpcSaldos, error: errRpc } = await supabaseServer.rpc('get_saldos_cuentas');
    if (!errRpc && rpcSaldos?.length) {
      const fila = (rpcSaldos as { cuenta_financiera_id: number; total_ingresos?: number; total_egresos?: number }[]).find(
        r => r.cuenta_financiera_id === cuentaId
      );
      if (fila) {
        const ingresos = Number(fila.total_ingresos ?? 0);
        const egresos = Number(fila.total_egresos ?? 0);
        return { saldo: saldoInicial + ingresos - egresos };
      }
    }

    const [resMf, resMiOrigen, resMiDestino] = await Promise.all([
      supabaseServer.from('Movimientos_Financieros').select('tipo, monto').eq('cuenta_financiera_id', cuentaId),
      supabaseServer.from('Movimientos_Internos').select('monto').eq('cuenta_origen_id', cuentaId),
      supabaseServer.from('Movimientos_Internos').select('monto').eq('cuenta_destino_id', cuentaId),
    ]);

    let ingresosMf = 0, egresosMf = 0;
    for (const r of (resMf.data ?? []) as { tipo: string; monto: number }[]) {
      const m = Number(r.monto ?? 0);
      if ((r.tipo ?? '').toUpperCase() === 'INGRESO') ingresosMf += m; else egresosMf += m;
    }
    const egresosMi = (resMiOrigen.data ?? []).reduce((s, r: { monto?: number }) => s + Number(r.monto ?? 0), 0);
    const ingresosMi = (resMiDestino.data ?? []).reduce((s, r: { monto?: number }) => s + Number(r.monto ?? 0), 0);
    const saldo = saldoInicial + ingresosMf - egresosMf + ingresosMi - egresosMi;
    return { saldo };
  } catch (e) {
    console.error('[getSaldoActualCuenta]', e);
    return { saldo: 0, error: 'Error al calcular el saldo.' };
  }
}
