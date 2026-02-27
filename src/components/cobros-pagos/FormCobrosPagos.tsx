'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Banknote,
  Building2,
  FileText,
  Trash2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  deleteMovimientoFinanciero,
  getHistorialMovimientos,
  getChequesEnCartera,
  getSaldoEntidad,
  registerCobroConCheque,
  registerPagoConCheque,
  registerPagoEgreso,
  revalidateRutasFinanzas,
  type HistorialPaginadoResult,
  type ChequeEnCarteraOption,
} from '@/app/cobros-pagos/actions';

// ── Tipos exportados para uso en page.tsx ────────────────────────────────────
export interface HistorialItem {
  id: number;
  fecha: string | null;
  tipo: string | null;
  monto: number | null;
  descripcion: string | null;
  metodo_pago: string | null;
  cuenta_financiera_id: number | null;
}

/** Catálogo mínimo para listas (la página solo carga id, nombre y opcionalmente tipo). */
interface EntidadMinima {
  id: number;
  nombre: string | null;
}

interface CuentaMinima {
  id: number;
  nombre: string | null;
  tipo: string | null;
}

interface Props {
  clientes: EntidadMinima[];
  proveedores: EntidadMinima[];
  fleteros: EntidadMinima[];
  cuentas: CuentaMinima[];
  historialInicial: HistorialItem[];
  totalInicial: number;
  chequesEnCartera: ChequeEnCarteraOption[];
}

type Operacion = 'cobro' | 'pago';
type TipoEntidad = 'proveedor' | 'fletero';
type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'otro';

const today = new Date().toISOString().split('T')[0];

/** Primer día del mes actual (YYYY-MM-01). */
function getFirstDayOfMonth(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

const METODO_LABELS: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
};

const METODO_ICONS: Record<MetodoPago, React.ElementType> = {
  efectivo: Banknote,
  transferencia: Building2,
  cheque: FileText,
  otro: Banknote,
};

function formatCurrency(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FormCobrosPagos({
  clientes,
  proveedores,
  fleteros,
  cuentas,
  historialInicial,
  totalInicial,
  chequesEnCartera,
}: Props) {
  // ── Operación activa
  const [operacion, setOperacion] = useState<Operacion>('cobro');
  const [tipoEntidad, setTipoEntidad] = useState<TipoEntidad>('proveedor');

  // ── Campos del formulario
  const [fecha, setFecha] = useState(today);
  const [clienteId, setClienteId] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [fleteroId, setFleteroId] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [referencia, setReferencia] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [cuentaId, setCuentaId] = useState(
    cuentas.length > 0 ? String(cuentas[0].id) : ''
  );
  // Campos obligatorios cuando Cobro + Cheque
  const [numeroCheque, setNumeroCheque] = useState('');
  const [bancoCheque, setBancoCheque] = useState('');
  const [emisorCheque, setEmisorCheque] = useState('');
  const [fechaEmisionCheque, setFechaEmisionCheque] = useState(today);
  const [fechaPagoCheque, setFechaPagoCheque] = useState(today);
  // Cuando Pago + Cheque: ID del cheque seleccionado (EN_CARTERA)
  const [chequeIdSelected, setChequeIdSelected] = useState('');

  // ── Estado UI
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const lastSubmitRef = useRef(0);
  const [historial, setHistorial] = useState<HistorialItem[]>(historialInicial);
  const [totalItems, setTotalItems] = useState<number>(totalInicial);
  const [chequesEnCarteraList, setChequesEnCarteraList] = useState<ChequeEnCarteraOption[]>(chequesEnCartera);
  const [paginaActual, setPaginaActual] = useState<number>(1);
  const ITEMS_PER_PAGE = 50;
  const [loadingPagina, setLoadingPagina] = useState(false);
  const [desdeHistorial, setDesdeHistorial] = useState(getFirstDayOfMonth);
  const [hastaHistorial, setHastaHistorial] = useState(today);
  const router = useRouter();
  // ID del movimiento que se está eliminando (null = ninguno)
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Movimiento pendiente de confirmación en el modal (null = modal cerrado)
  const [movimientoAEliminar, setMovimientoAEliminar] = useState<HistorialItem | null>(null);
  // Saldo de la entidad seleccionada (para mostrar debajo del monto)
  const [saldoEntidad, setSaldoEntidad] = useState<number | null>(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  const MAX_DIAS_RANGO = 31;

  // ── Fetch saldo al seleccionar cliente / proveedor / fletero ─────────────────
  useEffect(() => {
    if (operacion === 'cobro' && clienteId) {
      setLoadingSaldo(true);
      setSaldoEntidad(null);
      getSaldoEntidad(Number(clienteId), 'cliente').then(({ saldo, error }) => {
        setLoadingSaldo(false);
        if (!error) setSaldoEntidad(saldo);
      });
      return;
    }
    if (operacion === 'pago' && tipoEntidad === 'proveedor' && proveedorId) {
      setLoadingSaldo(true);
      setSaldoEntidad(null);
      getSaldoEntidad(Number(proveedorId), 'proveedor').then(({ saldo, error }) => {
        setLoadingSaldo(false);
        if (!error) setSaldoEntidad(saldo);
      });
      return;
    }
    if (operacion === 'pago' && tipoEntidad === 'fletero' && fleteroId) {
      setLoadingSaldo(true);
      setSaldoEntidad(null);
      getSaldoEntidad(Number(fleteroId), 'fletero').then(({ saldo, error }) => {
        setLoadingSaldo(false);
        if (!error) setSaldoEntidad(saldo);
      });
      return;
    }
    setSaldoEntidad(null);
    setLoadingSaldo(false);
  }, [operacion, tipoEntidad, clienteId, proveedorId, fleteroId]);

  /** Rango > 31 días: bloquear Filtrar y advertir. */
  const rangoInvalido = (() => {
    if (!desdeHistorial || !hastaHistorial) return false;
    const d1 = new Date(desdeHistorial);
    const d2 = new Date(hastaHistorial);
    const diffMs = d2.getTime() - d1.getTime();
    const diffDias = Math.ceil(diffMs / (24 * 60 * 60 * 1000)) + 1;
    return diffDias > MAX_DIAS_RANGO;
  })();

  const kpiCobros = historial.reduce((s, h) => s + (h.tipo === 'INGRESO' ? (h.monto ?? 0) : 0), 0);
  const kpiPagos = historial.reduce((s, h) => s + (h.tipo === 'EGRESO' ? (h.monto ?? 0) : 0), 0);
  const kpiBalance = kpiCobros - kpiPagos;

  const accentColor = operacion === 'cobro' ? 'green' : 'orange';
  const ringClass =
    operacion === 'cobro'
      ? 'focus:border-green-400 focus:ring-2 focus:ring-green-100'
      : 'focus:border-orange-400 focus:ring-2 focus:ring-orange-100';

  // ── Helpers
  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4500);
  }

  function resetCamposEntidad() {
    setClienteId('');
    setProveedorId('');
    setFleteroId('');
  }

  function resetForm() {
    resetCamposEntidad();
    setMonto('');
    setMetodoPago('efectivo');
    setReferencia('');
    setDescripcion('');
    setNumeroCheque('');
    setBancoCheque('');
    setEmisorCheque('');
    setFechaEmisionCheque(today);
    setFechaPagoCheque(today);
    setChequeIdSelected('');
  }

  function validarRangoFechas(desde: string, hasta: string): boolean {
    if (!desde || !hasta) return true;
    const d1 = new Date(desde);
    const d2 = new Date(hasta);
    const diffMs = d2.getTime() - d1.getTime();
    const diffDias = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (diffDias > MAX_DIAS_RANGO) {
      showToast('error', 'Para optimizar el sistema, el rango máximo de consulta es de 31 días.');
      return false;
    }
    return true;
  }

  async function cargarPagina(page: number) {
    if (desdeHistorial && hastaHistorial && !validarRangoFechas(desdeHistorial, hastaHistorial)) return;
    setLoadingPagina(true);
    try {
      const result: HistorialPaginadoResult = await getHistorialMovimientos(
        page,
        ITEMS_PER_PAGE,
        desdeHistorial || undefined,
        hastaHistorial || undefined
      );
      setHistorial(result.items as HistorialItem[]);
      setTotalItems(result.total);
      setPaginaActual(page);
    } finally {
      setLoadingPagina(false);
    }
  }

  function aplicarFiltroFechas() {
    if (desdeHistorial && hastaHistorial && !validarRangoFechas(desdeHistorial, hastaHistorial)) return;
    cargarPagina(1);
  }

  // Avisar cuando el rango elegido supera 31 días (para que se entienda por qué Filtrar está deshabilitado)
  useEffect(() => {
    if (rangoInvalido && desdeHistorial && hastaHistorial) {
      showToast('error', 'Para optimizar el sistema, el rango máximo de consulta es de 31 días.');
    }
  }, [rangoInvalido, desdeHistorial, hastaHistorial]); // eslint-disable-line react-hooks/exhaustive-deps -- solo aviso

  async function refetchHistorial() {
    await cargarPagina(1);
  }

  // ── Ejecutar borrado real (llamado solo desde el modal de confirmación)
  async function handleDelete(item: HistorialItem) {
    const esIngreso = item.tipo === 'INGRESO';
    setMovimientoAEliminar(null);   // cerrar modal antes de iniciar la operación
    setDeletingId(item.id);
    try {
      const { error } = await deleteMovimientoFinanciero(item.id);
      if (error) {
        showToast('error', `Error al eliminar: ${error}`);
      } else {
        setHistorial(prev => prev.filter(h => h.id !== item.id));
        showToast('success', `${esIngreso ? 'Cobro' : 'Pago'} eliminado correctamente.`);
        router.refresh();
      }
    } catch (err) {
      console.error('[handleDelete] unexpected error:', err);
      showToast('error', 'Error inesperado al eliminar.');
    } finally {
      setDeletingId(null);
    }
  }

  // ── Validación y envío
  async function handleSubmit() {
    const now = Date.now();
    if (submitting || now - lastSubmitRef.current < 2000) return;

    const montoNum = parseFloat(monto);
    if (!monto || isNaN(montoNum) || montoNum <= 0) {
      showToast('error', 'El monto debe ser mayor a cero.');
      return;
    }
    if (operacion === 'cobro' && !clienteId) {
      showToast('error', 'Seleccioná un cliente.');
      return;
    }
    if (operacion === 'pago') {
      if (tipoEntidad === 'proveedor' && !proveedorId) {
        showToast('error', 'Seleccioná un proveedor.');
        return;
      }
      if (tipoEntidad === 'fletero' && !fleteroId) {
        showToast('error', 'Seleccioná un fletero.');
        return;
      }
    }

    // Validación Cobro + Cheque: datos del cheque obligatorios
    if (operacion === 'cobro' && metodoPago === 'cheque') {
      if (!numeroCheque.trim()) {
        showToast('error', 'Ingresá el número de cheque.');
        return;
      }
      if (!bancoCheque.trim()) {
        showToast('error', 'Ingresá el banco.');
        return;
      }
      if (!emisorCheque.trim()) {
        showToast('error', 'Ingresá el emisor del cheque.');
        return;
      }
      if (!fechaEmisionCheque || !fechaPagoCheque) {
        showToast('error', 'Completá fecha de emisión y fecha de pago del cheque.');
        return;
      }
    }

    // Validación Pago + Cheque: debe elegir un cheque EN_CARTERA
    if (operacion === 'pago' && metodoPago === 'cheque') {
      if (!chequeIdSelected) {
        showToast('error', 'Seleccioná un cheque de la cartera.');
        return;
      }
      const chequeSel = chequesEnCarteraList.find(c => c.id === Number(chequeIdSelected));
      if (!chequeSel || (chequeSel.monto ?? 0) !== montoNum) {
        showToast('error', 'El monto debe coincidir con el cheque seleccionado.');
        return;
      }
    }

    setSubmitting(true);
    lastSubmitRef.current = now;

    try {
      if (operacion === 'cobro') {
        if (metodoPago === 'cheque') {
          const { error } = await registerCobroConCheque({
            fecha,
            clienteId: Number(clienteId),
            cuentaId: cuentaId ? Number(cuentaId) : null,
            monto: montoNum,
            descripcion: descripcion || null,
            referencia: referencia || null,
            numeroCheque: numeroCheque.trim(),
            banco: bancoCheque.trim(),
            emisor: emisorCheque.trim(),
            fechaEmision: fechaEmisionCheque,
            fechaPago: fechaPagoCheque,
          });
          if (error) {
            showToast('error', error);
            return;
          }
          const actualizados = await getChequesEnCartera();
          setChequesEnCarteraList(actualizados);
          showToast('success', `Cobro con cheque de ${formatCurrency(montoNum)} registrado.`);
        } else {
          const nombreCliente = clientes.find(c => c.id === Number(clienteId))?.nombre ?? '';
          const { error: e1 } = await supabase.from('Cobros_Clientes').insert({
            fecha_cobro: fecha,
            cliente_id: Number(clienteId),
            monto: montoNum,
            metodo_pago: metodoPago,
            referencia: referencia || null,
            notas: descripcion || null,
          });
          if (e1) throw e1;
          const { error: e2 } = await supabase.from('Movimientos_Financieros').insert({
            fecha,
            tipo: 'INGRESO',
            monto: montoNum,
            descripcion: descripcion || `Cobro — ${nombreCliente}`,
            metodo_pago: metodoPago,
            referencia: referencia || null,
            cuenta_financiera_id: cuentaId ? Number(cuentaId) : null,
            cliente_id: Number(clienteId),
          });
          if (e2) throw e2;
          await revalidateRutasFinanzas();
          showToast('success', `Cobro de ${formatCurrency(montoNum)} registrado correctamente.`);
        }
      } else {
        // PAGO
        const esProveedor = tipoEntidad === 'proveedor';
        const nombreEntidad = esProveedor
          ? proveedores.find(p => p.id === Number(proveedorId))?.nombre ?? ''
          : fleteros.find(f => f.id === Number(fleteroId))?.nombre ?? '';

        if (metodoPago === 'cheque') {
          const { error } = await registerPagoConCheque({
            fecha,
            tipoEntidad,
            proveedorId: esProveedor ? Number(proveedorId) : null,
            fleteroId: !esProveedor ? Number(fleteroId) : null,
            cuentaId: cuentaId ? Number(cuentaId) : null,
            monto: montoNum,
            descripcion: descripcion || null,
            referencia: referencia || null,
            chequeId: Number(chequeIdSelected),
          });
          if (error) {
            showToast('error', error);
            return;
          }
          const actualizados = await getChequesEnCartera();
          setChequesEnCarteraList(actualizados);
          showToast('success', `Pago con cheque a ${nombreEntidad} registrado.`);
        } else {
          const { error } = await registerPagoEgreso({
            fecha,
            monto: montoNum,
            descripcion: descripcion || `Pago ${tipoEntidad} — ${nombreEntidad}`,
            metodo_pago: metodoPago,
            referencia: referencia || null,
            cuenta_financiera_id: cuentaId ? Number(cuentaId) : null,
            proveedor_id: esProveedor ? Number(proveedorId) : null,
            fletero_id: !esProveedor ? Number(fleteroId) : null,
          });
          if (error) {
            showToast('error', error);
            return;
          }
          showToast('success', `Pago de ${formatCurrency(montoNum)} a ${nombreEntidad} registrado.`);
        }
      }

      resetForm();
      await refetchHistorial();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar el movimiento.';
      showToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      {/* ── Formulario (ocupa 2/5 en xl) ──────────────────────────────────── */}
      <div className="xl:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* Toast */}
          {toast && (
            <div
              className={`mb-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
                toast.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              )}
              {toast.msg}
            </div>
          )}

          {/* Tipo de operación */}
          <div className="mb-5 inline-flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => { setOperacion('cobro'); resetCamposEntidad(); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                operacion === 'cobro'
                  ? 'bg-white text-green-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Cobro
            </button>
            <button
              onClick={() => { setOperacion('pago'); resetCamposEntidad(); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                operacion === 'pago'
                  ? 'bg-white text-orange-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              Pago
            </button>
          </div>

          <div className="space-y-4">
            {/* Fecha */}
            <Field label="Fecha">
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className={`input-base ${ringClass}`}
              />
            </Field>

            {/* Entidad */}
            {operacion === 'cobro' ? (
              <Field label="Cliente">
                <select
                  value={clienteId}
                  onChange={e => setClienteId(e.target.value)}
                  className={`input-base ${ringClass}`}
                >
                  <option value="">— Seleccionar cliente —</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Tipo de beneficiario">
                  <div className="flex gap-4">
                    {(['proveedor', 'fletero'] as TipoEntidad[]).map(t => (
                      <label key={t} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="tipoEntidad"
                          checked={tipoEntidad === t}
                          onChange={() => {
                            setTipoEntidad(t);
                            setProveedorId('');
                            setFleteroId('');
                          }}
                          className="accent-orange-500"
                        />
                        <span className="text-sm capitalize text-gray-700">{t}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                {tipoEntidad === 'proveedor' ? (
                  <Field label="Proveedor">
                    <select
                      value={proveedorId}
                      onChange={e => setProveedorId(e.target.value)}
                      className={`input-base ${ringClass}`}
                    >
                      <option value="">— Seleccionar proveedor —</option>
                      {proveedores.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Fletero">
                    <select
                      value={fleteroId}
                      onChange={e => setFleteroId(e.target.value)}
                      className={`input-base ${ringClass}`}
                    >
                      <option value="">— Seleccionar fletero —</option>
                      {fleteros.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}

            {/* Cuenta Financiera */}
            <Field label="Cuenta Financiera">
              <select
                value={cuentaId}
                onChange={e => setCuentaId(e.target.value)}
                className={`input-base ${ringClass}`}
              >
                <option value="">— Sin cuenta específica —</option>
                {cuentas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.tipo ? ` (${c.tipo})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {/* Monto + Método */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto ($)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0,00"
                  readOnly={operacion === 'pago' && metodoPago === 'cheque'}
                  className={`input-base font-mono ${ringClass} ${operacion === 'pago' && metodoPago === 'cheque' ? 'cursor-not-allowed bg-gray-50' : ''}`}
                />
              </Field>
              <Field label="Método de pago">
                <select
                  value={metodoPago}
                  onChange={e => setMetodoPago(e.target.value as MetodoPago)}
                  className={`input-base ${ringClass}`}
                >
                  {(Object.entries(METODO_LABELS) as [MetodoPago, string][]).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Saldo de la entidad + [Saldar Total] */}
            {((operacion === 'cobro' && clienteId) || (operacion === 'pago' && (proveedorId || fleteroId))) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {loadingSaldo ? (
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calculando saldo....
                  </span>
                ) : saldoEntidad !== null ? (
                  <>
                    <span
                      className={
                        operacion === 'pago' && saldoEntidad > 0
                          ? 'font-medium text-red-600'
                          : 'font-medium text-green-600'
                      }
                    >
                      {operacion === 'cobro'
                        ? saldoEntidad > 0
                          ? `Nos debe: ${formatCurrency(saldoEntidad)}`
                          : 'Saldo al día'
                        : saldoEntidad > 0
                          ? `Deuda pendiente: ${formatCurrency(saldoEntidad)}`
                          : 'Al día'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMonto(String(Math.abs(saldoEntidad)))}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      Saldar Total
                    </button>
                  </>
                ) : null}
              </div>
            )}

            {/* Cobro + Cheque: datos del cheque */}
            {operacion === 'cobro' && metodoPago === 'cheque' && (
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Datos del cheque
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Número de cheque">
                    <input
                      type="text"
                      value={numeroCheque}
                      onChange={e => setNumeroCheque(e.target.value)}
                      placeholder="Ej. 00123456"
                      className={`input-base ${ringClass}`}
                    />
                  </Field>
                  <Field label="Banco">
                    <input
                      type="text"
                      value={bancoCheque}
                      onChange={e => setBancoCheque(e.target.value)}
                      placeholder="Ej. Banco Nación"
                      className={`input-base ${ringClass}`}
                    />
                  </Field>
                </div>
                <Field label="Emisor">
                  <input
                    type="text"
                    value={emisorCheque}
                    onChange={e => setEmisorCheque(e.target.value)}
                    placeholder="Nombre del librador"
                    className={`input-base ${ringClass}`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha de emisión">
                    <input
                      type="date"
                      value={fechaEmisionCheque}
                      onChange={e => setFechaEmisionCheque(e.target.value)}
                      className={`input-base ${ringClass}`}
                    />
                  </Field>
                  <Field label="Fecha de pago">
                    <input
                      type="date"
                      value={fechaPagoCheque}
                      onChange={e => setFechaPagoCheque(e.target.value)}
                      className={`input-base ${ringClass}`}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* Pago + Cheque: seleccionar cheque EN_CARTERA */}
            {operacion === 'pago' && metodoPago === 'cheque' && (
              <Field label="Cheque a endosar">
                <select
                  value={chequeIdSelected}
                  onChange={e => {
                    const val = e.target.value;
                    setChequeIdSelected(val);
                    const opt = val ? chequesEnCarteraList.find(c => c.id === Number(val)) : null;
                    setMonto(opt?.monto != null ? String(opt.monto) : '');
                  }}
                  className={`input-base ${ringClass}`}
                >
                  <option value="">— Seleccionar cheque en cartera —</option>
                  {chequesEnCarteraList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.banco ?? 'Sin banco'} — {formatCurrency(c.monto ?? 0)} — Vto: {formatDate(c.fecha_pago)} {c.numero_cheque ? ` (Nº ${c.numero_cheque})` : ''}
                    </option>
                  ))}
                </select>
                {chequesEnCarteraList.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">No hay cheques en cartera para endosar.</p>
                )}
              </Field>
            )}

            {/* Referencia */}
            <Field label="N° Referencia / Comprobante">
              <input
                type="text"
                value={referencia}
                onChange={e => setReferencia(e.target.value)}
                placeholder="TRF-001, CHQ-456…"
                className={`input-base ${ringClass}`}
              />
            </Field>

            {/* Descripción */}
            <Field label="Descripción / Notas (opcional)">
              <textarea
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                rows={2}
                placeholder="Notas adicionales…"
                className={`input-base resize-none ${ringClass}`}
              />
            </Field>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed ${
                operacion === 'cobro'
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-300'
                  : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300'
              }`}
            >
              {operacion === 'cobro' ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {submitting
                ? 'Registrando…'
                : operacion === 'cobro'
                  ? 'Confirmar Cobro'
                  : 'Confirmar Pago'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Historial (ocupa 3/5 en xl) ───────────────────────────────────── */}
      <div className="xl:col-span-3">
        {/* KPIs dinámicos desde la tabla renderizada */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cobros</p>
              <p className="mt-0.5 text-lg font-bold text-emerald-700">{formatCurrency(kpiCobros)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <TrendingDown className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pagos</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">{formatCurrency(kpiPagos)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${kpiBalance >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              <Scale className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Balance</p>
              <p className={`mt-0.5 text-lg font-bold ${kpiBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {kpiBalance >= 0 ? '+' : ''}{formatCurrency(kpiBalance)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Últimos movimientos</h3>
            <p className="text-xs text-gray-400">Se actualiza al registrar</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                <label className="text-xs font-medium text-slate-600">Desde</label>
                <input
                  type="date"
                  value={desdeHistorial}
                  onChange={e => setDesdeHistorial(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-100"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Hasta</label>
                <input
                  type="date"
                  value={hastaHistorial}
                  onChange={e => setHastaHistorial(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-100"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (rangoInvalido) {
                    showToast('error', 'Para optimizar el sistema, el rango máximo de consulta es de 31 días.');
                    return;
                  }
                  aplicarFiltroFechas();
                }}
                disabled={loadingPagina || rangoInvalido}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Filtrar
              </button>
            </div>
          </div>

          {historial.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              Sin movimientos registrados aún.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {historial.map(h => {
                const cuenta = cuentas.find(c => c.id === h.cuenta_financiera_id);
                const MetIcon =
                  METODO_ICONS[(h.metodo_pago as MetodoPago) ?? 'otro'] ?? Banknote;
                const isIngreso = h.tipo === 'INGRESO';

                const isDeleting = deletingId === h.id;

                return (
                  <div
                    key={h.id}
                    className={`flex items-center gap-3 px-5 py-3 transition-opacity ${
                      isDeleting ? 'opacity-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Ícono tipo */}
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        isIngreso ? 'bg-green-100' : 'bg-orange-100'
                      }`}
                    >
                      {isIngreso ? (
                        <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-orange-600" />
                      )}
                    </div>

                    {/* Descripción */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {h.descripcion ?? (isIngreso ? 'Cobro' : 'Pago')}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                        <span>{formatDate(h.fecha)}</span>
                        {h.metodo_pago && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <MetIcon className="h-3 w-3" />
                              {METODO_LABELS[(h.metodo_pago as MetodoPago)] ?? h.metodo_pago}
                            </span>
                          </>
                        )}
                        {cuenta && (
                          <>
                            <span>·</span>
                            <span>{cuenta.nombre}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Monto */}
                    <div
                      className={`flex-shrink-0 font-mono text-sm font-semibold ${
                        isIngreso ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      {isIngreso ? '+' : '-'}
                      {formatCurrency(h.monto ?? 0)}
                    </div>

                    {/* Botón eliminar — abre el modal, NO borra directamente */}
                    <button
                      onClick={() => setMovimientoAEliminar(h)}
                      disabled={isDeleting || deletingId !== null}
                      title="Eliminar movimiento"
                      className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginación (lado derecho) */} 
          {totalItems > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <p className="text-sm text-slate-500">
                Página <span className="font-medium text-slate-700">{paginaActual}</span> de{' '}
                <span className="font-medium text-slate-700">
                  {Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))}
                </span>
                {totalItems > ITEMS_PER_PAGE && (
                  <span className="ml-2">
                    · {totalItems.toLocaleString('es-AR')} movimientos
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cargarPagina(paginaActual - 1)}
                  disabled={paginaActual <= 1 || loadingPagina}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => cargarPagina(paginaActual + 1)}
                  disabled={paginaActual >= Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE)) || loadingPagina}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Modal de confirmación de borrado ──────────────────────────────── */}
    {movimientoAEliminar && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
        onClick={() => setMovimientoAEliminar(null)}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Ícono de alerta */}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-6 w-6 text-red-600" />
          </div>

          {/* Título */}
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            Eliminar Movimiento
          </h2>

          {/* Descripción */}
          <p className="mb-6 text-sm text-slate-500">
            ¿Estás seguro de eliminar este{' '}
            <span className="font-medium text-slate-700">
              {movimientoAEliminar.tipo === 'INGRESO' ? 'cobro' : 'pago'}
            </span>{' '}
            de{' '}
            <span className="font-semibold text-slate-900">
              {formatCurrency(movimientoAEliminar.monto ?? 0)}
            </span>
            ? Esta acción recalculará la caja y la cuenta corriente.
          </p>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setMovimientoAEliminar(null)}
              className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleDelete(movimientoAEliminar)}
              disabled={deletingId !== null}
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Componente auxiliar Field ─────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}
