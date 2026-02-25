'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { getSaldoEnvasesProveedor } from '@/app/movimiento/actions';
import { getConfiguracion } from '@/app/configuracion/actions';

// Mapeo: tipo_evento (vista historial_unificado) → tabla real en Supabase
const TABLA_POR_TIPO: Record<string, string> = {
  INGRESO_FRUTA:       'Entradas_Fruta',
  SALIDA_FRUTA:        'Salidas_Fruta',
  CONCILIACION:        'Salidas_Fruta',       // CONCILIACION es una Salida_Fruta conciliada
  COBRO:               'Movimientos_Financieros',
  PAGO:                'Movimientos_Financieros',
  MOVIMIENTO_INTERNO:  'Movimientos_Internos', // una sola fila por transferencia/gasto/ingreso interno
  AJUSTE_STOCK:        'Movimientos_Envases',
};

/**
 * Elimina el registro origen de la tabla correspondiente al tipo de evento.
 * COBRO: elimina también el registro gemelo en Cobros_Clientes (cliente_id + monto + fecha)
 *        para mantener integridad. Solo se revalida si todo sale bien.
 * Cualquier error de Supabase (FK, permisos, etc.) se devuelve al cliente.
 */
export async function eliminarRegistroHistorial(
  idOrigen: number,
  tipoEvento: string,
): Promise<{ error: string | null }> {
  const tabla = TABLA_POR_TIPO[tipoEvento];

  if (!tabla) {
    return { error: `Tipo de evento no reconocido: "${tipoEvento}"` };
  }

  try {
    // ── COBRO: si tiene cheque_id, validar que el cheque siga EN_CARTERA; luego eliminar Cobros_Clientes, Movimientos_Financieros y (si aplica) Cheques_Terceros
    if (tipoEvento === 'COBRO') {
      const { data: mov, error: fetchErr } = await supabaseServer
        .from('Movimientos_Financieros')
        .select('id, tipo, monto, fecha, cliente_id, cheque_id')
        .eq('id', idOrigen)
        .single();

      if (fetchErr || !mov) {
        console.error('[eliminarRegistroHistorial] COBRO fetch:', fetchErr);
        return { error: fetchErr?.message ?? 'No se encontró el movimiento.' };
      }

      const chequeId = mov.cheque_id != null ? Number(mov.cheque_id) : null;
      if (chequeId != null) {
        const { data: cheque, error: errCh } = await supabaseServer
          .from('Cheques_Terceros')
          .select('id, estado')
          .eq('id', chequeId)
          .single();
        if (errCh || !cheque) {
          return { error: errCh?.message ?? 'No se encontró el cheque asociado.' };
        }
        const estado = (cheque.estado as string) ?? '';
        if (estado !== 'EN_CARTERA') {
          return {
            error: 'No se puede eliminar: el cheque ya fue endosado o depositado. Eliminá el cheque desde Cartera de Cheques solo si está En cartera.',
          };
        }
      }

      if (mov.tipo === 'INGRESO' && mov.cliente_id != null) {
        const { data: cobros, error: fetchCobroErr } = await supabaseServer
          .from('Cobros_Clientes')
          .select('id')
          .eq('cliente_id', mov.cliente_id)
          .eq('monto', mov.monto ?? 0)
          .eq('fecha_cobro', mov.fecha ?? '')
          .order('created_at', { ascending: false })
          .limit(1);

        if (fetchCobroErr) {
          console.error('[eliminarRegistroHistorial] COBRO fetch Cobros_Clientes:', fetchCobroErr);
          return { error: fetchCobroErr.message };
        }

        if (cobros && cobros.length > 0) {
          const { error: delCobroErr } = await supabaseServer
            .from('Cobros_Clientes')
            .delete()
            .eq('id', cobros[0].id);

          if (delCobroErr) {
            console.error('[eliminarRegistroHistorial] COBRO delete Cobros_Clientes:', delCobroErr);
            return { error: delCobroErr.message };
          }
        }
      }

      const { error: delMovErr } = await supabaseServer
        .from('Movimientos_Financieros')
        .delete()
        .eq('id', idOrigen);

      if (delMovErr) {
        console.error('[eliminarRegistroHistorial] COBRO delete Movimientos_Financieros:', delMovErr);
        return { error: delMovErr.message };
      }

      if (chequeId != null) {
        const { error: delChErr } = await supabaseServer
          .from('Cheques_Terceros')
          .delete()
          .eq('id', chequeId);
        if (delChErr) {
          console.error('[eliminarRegistroHistorial] COBRO delete Cheques_Terceros:', delChErr);
          return { error: delChErr.message };
        }
      }

      revalidatePath('/historial');
      revalidatePath('/');
      revalidatePath('/cobros-pagos');
      revalidatePath('/cuentas-corrientes');
      revalidatePath('/cajas-bancos');
      revalidatePath('/cheques');
      return { error: null };
    }

    // ── PAGO: solo Movimientos_Financieros
    if (tipoEvento === 'PAGO') {
      const { error: delErr } = await supabaseServer
        .from('Movimientos_Financieros')
        .delete()
        .eq('id', idOrigen);

      if (delErr) {
        console.error('[eliminarRegistroHistorial] PAGO delete:', delErr);
        return { error: delErr.message };
      }

      revalidatePath('/historial');
      revalidatePath('/');
      revalidatePath('/cobros-pagos');
      revalidatePath('/cuentas-corrientes');
      revalidatePath('/cajas-bancos');
      return { error: null };
    }

    // ── MOVIMIENTO_INTERNO: una sola fila en Movimientos_Internos (no hay EGRESO+INGRESO separados)
    if (tipoEvento === 'MOVIMIENTO_INTERNO') {
      const { error: delErr } = await supabaseServer
        .from('Movimientos_Internos')
        .delete()
        .eq('id', idOrigen);

      if (delErr) {
        console.error('[eliminarRegistroHistorial] MOVIMIENTO_INTERNO delete:', delErr);
        return { error: delErr.message };
      }

      revalidatePath('/historial');
      revalidatePath('/');
      revalidatePath('/cajas-bancos');
      return { error: null };
    }

    // ── Resto: Entradas_Fruta, Salidas_Fruta, Movimientos_Envases
    const { error } = await supabaseServer
      .from(tabla)
      .delete()
      .eq('id', idOrigen);

    if (error) {
      console.error('[eliminarRegistroHistorial] delete:', tabla, error);
      return { error: error.message };
    }

    revalidatePath('/historial');
    revalidatePath('/');
    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar.';
    console.error('[eliminarRegistroHistorial] unexpected:', err);
    return { error: msg };
  }
}

/** Tipo que coincide con RemitoIngresoData para generarRemitoIngresoPdf */
export interface DatosReimpresionIngreso {
  nroOperacion: number;
  fechaHora: string;
  proveedorNombre: string;
  proveedorCuit: string;
  items: {
    producto_nombre: string;
    envase_nombre: string;
    cantidad_envases: number;
    peso_bruto_kg: number;
    tara_total_kg: number;
    peso_neto_kg: number;
  }[];
  envasesIngresadosHoy: number;
  envasesRetiradosHoy: number;
  saldoPendiente: number;
  empresaNombre: string;
}

/**
 * Obtiene los datos para reimprimir el Remito de Ingreso desde el historial.
 * Busca la operación (todas las filas de Entradas_Fruta con misma fecha y proveedor),
 * hace JOIN con Productos, Envases y Proveedores, y obtiene el saldo de envases del proveedor vía RPC get_saldo_envases_proveedor.
 */
export async function getDatosReimpresionIngreso(
  entradaId: number,
): Promise<{ data: DatosReimpresionIngreso | null; error: string | null }> {
  try {
    const { data: primera, error: errPrimera } = await supabaseServer
      .from('Entradas_Fruta')
      .select('id, fecha_entrada, proveedor_id, created_at')
      .eq('id', entradaId)
      .single();

    if (errPrimera || !primera) {
      console.error('[getDatosReimpresionIngreso] fetch entrada:', errPrimera);
      return { data: null, error: errPrimera?.message ?? 'No se encontró la entrada.' };
    }

    const fechaEntrada = primera.fecha_entrada ?? '';
    const proveedorId = primera.proveedor_id;

    if (!fechaEntrada || proveedorId == null) {
      return { data: null, error: 'Entrada sin fecha o proveedor.' };
    }

    const { data: filas, error: errFilas } = await supabaseServer
      .from('Entradas_Fruta')
      .select('id, producto_id, envase_id, cantidad_envases, peso_bruto_kg, peso_neto_kg')
      .eq('fecha_entrada', fechaEntrada)
      .eq('proveedor_id', proveedorId)
      .order('id', { ascending: true });

    if (errFilas || !filas?.length) {
      return { data: null, error: errFilas?.message ?? 'No se encontraron filas de la operación.' };
    }

    const idsProducto = [...new Set((filas as { producto_id: number | null }[]).map(f => f.producto_id).filter(Boolean))] as number[];
    const idsEnvase = [...new Set((filas as { envase_id: number | null }[]).map(f => f.envase_id).filter(Boolean))] as number[];

    const [provRes, prodRes, envRes] = await Promise.all([
      supabaseServer.from('Proveedores').select('id, nombre, cuit_dni').eq('id', proveedorId).single(),
      idsProducto.length
        ? supabaseServer.from('Productos').select('id, nombre').in('id', idsProducto)
        : Promise.resolve({ data: [] }),
      idsEnvase.length
        ? supabaseServer.from('Envases').select('id, nombre').in('id', idsEnvase)
        : Promise.resolve({ data: [] }),
    ]);

    const proveedor = provRes.data as { nombre: string | null; cuit_dni: string | null } | null;
    const productosMap = new Map(((prodRes.data ?? []) as { id: number; nombre: string | null }[]).map(p => [p.id, p.nombre ?? '—']));
    const envasesMap = new Map(((envRes.data ?? []) as { id: number; nombre: string | null }[]).map(e => [e.id, e.nombre ?? '—']));

    const items = (filas as { id: number; producto_id: number | null; envase_id: number | null; cantidad_envases: number | null; peso_bruto_kg: number | null; peso_neto_kg: number | null }[]).map(f => {
      const bruto = Number(f.peso_bruto_kg ?? 0);
      const neto = Number(f.peso_neto_kg ?? 0);
      const tara = bruto - neto;
      return {
        producto_nombre: productosMap.get(f.producto_id ?? 0) ?? '—',
        envase_nombre: envasesMap.get(f.envase_id ?? 0) ?? '—',
        cantidad_envases: Number(f.cantidad_envases ?? 0),
        peso_bruto_kg: bruto,
        tara_total_kg: tara,
        peso_neto_kg: neto,
      };
    });

    const nroOperacion = Math.min(...(filas as { id: number }[]).map(f => f.id));
    const firstCreated = (primera as { created_at?: string }).created_at;
    const fechaHora = firstCreated
      ? new Date(firstCreated).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false }).replace(',', '')
      : `${fechaEntrada} 00:00`;

    const envasesIngresadosHoy = items.reduce((s, i) => s + i.cantidad_envases, 0);
    const saldoPendiente = await getSaldoEnvasesProveedor(proveedorId);
    const config = await getConfiguracion();

    return {
      data: {
        nroOperacion,
        fechaHora,
        proveedorNombre: proveedor?.nombre ?? '—',
        proveedorCuit: proveedor?.cuit_dni ?? '',
        items,
        envasesIngresadosHoy,
        envasesRetiradosHoy: 0,
        saldoPendiente,
        empresaNombre: config?.nombre_empresa ?? 'Acopio',
      },
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al obtener datos para reimpresión.';
    console.error('[getDatosReimpresionIngreso]', err);
    return { data: null, error: msg };
  }
}
