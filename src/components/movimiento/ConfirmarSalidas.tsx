'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, RefreshCw, Scale, X, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type SalidaRaw = {
  id: number;
  fecha_salida: string | null;
  remito_nro: string | null;
  peso_salida_acopio_kg: number | null;
  Clientes: { nombre: string | null } | null;
  Productos: { nombre: string | null; precio_venta_kg: number | null } | null;
};

interface SalidaPendiente {
  id: number;
  fecha_salida: string | null;
  remito_nro: string | null;
  peso_salida_acopio_kg: number;
  cliente_nombre: string;
  producto_nombre: string;
  precio_venta_kg: number | null;
}

interface ModalState {
  salida: SalidaPendiente;
  pesoLlegada: number | '';
  /** Descuento físico en kg — se descuenta del peso antes de multiplicar por precio */
  descuentoKg: number | '';
}

type Toast = { type: 'success' | 'error'; msg: string };

// ── Utilidades ────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtPeso(n: number | null | undefined) {
  return `${(n ?? 0).toFixed(2)} kg`;
}

function fmtMoneda(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ConfirmarSalidas() {
  const [salidas, setSalidas] = useState<SalidaPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // ── Carga de pendientes ────────────────────────────────────────────────────
  const loadSalidas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('Salidas_Fruta')
      .select(`
        id, fecha_salida, remito_nro, peso_salida_acopio_kg,
        Clientes(nombre),
        Productos(nombre, precio_venta_kg)
      `)
      .eq('estado_conciliacion', 'pendiente')
      .order('fecha_salida', { ascending: false });

    if (!error && data) {
      setSalidas(
        (data as unknown as SalidaRaw[]).map(s => ({
          id: s.id,
          fecha_salida: s.fecha_salida,
          remito_nro: s.remito_nro,
          peso_salida_acopio_kg: s.peso_salida_acopio_kg ?? 0,
          cliente_nombre: s.Clientes?.nombre ?? '—',
          producto_nombre: s.Productos?.nombre ?? '—',
          precio_venta_kg: s.Productos?.precio_venta_kg ?? null,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSalidas(); }, [loadSalidas]);

  function abrirModal(salida: SalidaPendiente) {
    setModal({ salida, pesoLlegada: '', descuentoKg: '' });
  }

  function cerrarModal() {
    if (!conciliando) setModal(null);
  }

  // ── Cálculos en tiempo real ────────────────────────────────────────────────
  // Nueva fórmula: Monto = (Peso Llegada − Descuento KG) × Precio
  const pesoNetoEfectivo =
    modal && modal.pesoLlegada !== ''
      ? Math.max(0, Number(modal.pesoLlegada) - Number(modal.descuentoKg || 0))
      : null;

  const montoFinal =
    pesoNetoEfectivo !== null && modal?.salida.precio_venta_kg != null
      ? Math.max(0, pesoNetoEfectivo * modal.salida.precio_venta_kg)
      : null;

  const diferenciaPeso =
    modal && modal.pesoLlegada !== ''
      ? Number(modal.pesoLlegada) - modal.salida.peso_salida_acopio_kg
      : null;

  // ── Confirmar conciliación ─────────────────────────────────────────────────
  async function handleConciliar() {
    if (!modal || modal.pesoLlegada === '') return;
    setConciliando(true);

    const pesoLlegada = Number(modal.pesoLlegada);
    const descKg = Number(modal.descuentoKg || 0);
    const pesoNeto = Math.max(0, pesoLlegada - descKg);
    const monto = parseFloat(
      Math.max(0, pesoNeto * (modal.salida.precio_venta_kg ?? 0)).toFixed(2)
    );

    const { error } = await supabase
      .from('Salidas_Fruta')
      .update({
        peso_llegada_cliente_kg: pesoLlegada,
        descuento_calidad_kg: descKg,           // columna renombrada a KG
        monto_final_cobrar: monto,
        precio_venta_kg_historico: modal.salida.precio_venta_kg,
        estado_conciliacion: 'conciliado',
      })
      .eq('id', modal.salida.id);

    if (error) {
      setToast({ type: 'error', msg: error.message });
    } else {
      setToast({
        type: 'success',
        msg: `✓ Salida #${modal.salida.id} conciliada — ${pesoNeto.toFixed(2)} kg netos — ${fmtMoneda(monto)}`,
      });
      setModal(null);
      await loadSalidas();
    }
    setConciliando(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toast */}
        {toast && (
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {toast.type === 'success'
              ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
              : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            <span className="flex-1">{toast.msg}</span>
            <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Scale className="h-4 w-4 text-purple-500" />
              Salidas Pendientes de Conciliación
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              Ingresá el peso real de llegada y el descuento por calidad (en kg) para calcular el monto final
            </p>
          </div>
          <button
            onClick={loadSalidas}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {/* Estado vacío */}
        {salidas.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-16 text-center shadow-sm">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-200" />
            <p className="font-medium text-gray-500">Sin salidas pendientes</p>
            <p className="mt-1 text-sm text-gray-400">Todas las salidas están conciliadas</p>
          </div>
        )}

        {/* Cards de salidas pendientes */}
        {salidas.map(salida => (
          <div key={salida.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
                    Pendiente
                  </span>
                  <span className="text-xs text-gray-400">#{salida.id}</span>
                </div>
                <p className="font-semibold text-gray-900">
                  {salida.cliente_nombre}
                  <span className="ml-2 font-normal text-gray-500">— {salida.producto_nombre}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span>📅 {fmtDate(salida.fecha_salida)}</span>
                  <span>📄 Remito: {salida.remito_nro ?? '—'}</span>
                  <span>⚖️ Peso acopio: <strong className="text-gray-600">{fmtPeso(salida.peso_salida_acopio_kg)}</strong></span>
                  <span>
                    💲 Precio base:{' '}
                    <strong className="text-gray-600">
                      {salida.precio_venta_kg != null ? `$${salida.precio_venta_kg.toFixed(2)}/kg` : 'no definido'}
                    </strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => abrirModal(salida)}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700"
              >
                <Scale className="h-4 w-4" />
                Conciliar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal de Conciliación ─────────────────────────────────────────── */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={cerrarModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-base font-bold text-gray-900">Conciliar Salida</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  {modal.salida.cliente_nombre} — {modal.salida.producto_nombre}
                </p>
              </div>
              <button
                onClick={cerrarModal}
                disabled={conciliando}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Datos de referencia */}
              <div className="mb-5 grid grid-cols-3 gap-3 rounded-xl bg-gray-50 p-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Fecha</p>
                  <p className="font-medium text-gray-700">{fmtDate(modal.salida.fecha_salida)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Remito</p>
                  <p className="font-medium text-gray-700">{modal.salida.remito_nro ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Peso en acopio</p>
                  <p className="font-medium text-gray-700">{fmtPeso(modal.salida.peso_salida_acopio_kg)}</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Precio venta (solo lectura) */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Precio de Venta (desde Productos)
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                    <span className="font-mono font-semibold text-gray-800">
                      {modal.salida.precio_venta_kg != null
                        ? `$${modal.salida.precio_venta_kg.toFixed(2)} / kg`
                        : 'Sin precio definido en Productos'}
                    </span>
                    <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                      automático
                    </span>
                  </div>
                </div>

                {/* Peso Real Llegada */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Peso Real Llegada Fábrica (kg) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={modal.pesoLlegada}
                    onChange={e =>
                      setModal(prev => prev
                        ? { ...prev, pesoLlegada: e.target.value === '' ? '' : Number(e.target.value) }
                        : null)
                    }
                    placeholder="0,00"
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                  />
                  {/* Diferencia vs peso acopio */}
                  {diferenciaPeso !== null && (
                    <p className={`mt-1.5 text-xs font-semibold ${
                      diferenciaPeso < -0.005 ? 'text-red-500'
                      : diferenciaPeso > 0.005 ? 'text-blue-500'
                      : 'text-green-600'
                    }`}>
                      {diferenciaPeso < -0.005
                        ? `▼ Merma de ${Math.abs(diferenciaPeso).toFixed(2)} kg vs acopio`
                        : diferenciaPeso > 0.005
                          ? `▲ ${diferenciaPeso.toFixed(2)} kg más que en acopio`
                          : '✓ Mismo peso que acopio'}
                    </p>
                  )}
                </div>

                {/* ── Descuento por calidad en KG ───────────────────────── */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Descuento por Calidad (KG)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={modal.descuentoKg}
                    onChange={e =>
                      setModal(prev => prev
                        ? { ...prev, descuentoKg: e.target.value === '' ? '' : Number(e.target.value) }
                        : null)
                    }
                    placeholder="0,00 kg"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Kilos rechazados por calidad. Se descuentan del peso antes de calcular el monto.
                  </p>
                </div>

                {/* ── Desglose del cálculo ───────────────────────────────── */}
                {pesoNetoEfectivo !== null && modal.salida.precio_venta_kg != null && (
                  <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-purple-600">
                      Cálculo del monto final
                    </p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Peso llegada fábrica</span>
                        <span className="font-mono">{Number(modal.pesoLlegada).toFixed(2)} kg</span>
                      </div>
                      {Number(modal.descuentoKg || 0) > 0 && (
                        <div className="flex justify-between text-orange-600">
                          <span>− Descuento calidad</span>
                          <span className="font-mono">− {Number(modal.descuentoKg).toFixed(2)} kg</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-purple-200 pt-1.5 font-semibold text-gray-700">
                        <span>= Peso neto efectivo</span>
                        <span className="font-mono">{pesoNetoEfectivo.toFixed(2)} kg</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>× Precio de venta</span>
                        <span className="font-mono">${modal.salida.precio_venta_kg.toFixed(2)}/kg</span>
                      </div>
                      <div className="mt-2 flex justify-between border-t border-purple-200 pt-2 font-bold text-purple-800">
                        <span>Monto Final a Cobrar</span>
                        <span className="text-lg">{montoFinal !== null ? fmtMoneda(montoFinal) : '—'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Aviso sin precio */}
                {modal.salida.precio_venta_kg == null && (
                  <div className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm text-orange-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      El producto <strong>{modal.salida.producto_nombre}</strong> no tiene precio de venta
                      configurado. Definilo en <strong>Configuración → Productos y Precios</strong>.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={cerrarModal}
                disabled={conciliando}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleConciliar}
                disabled={modal.pesoLlegada === '' || modal.salida.precio_venta_kg == null || conciliando}
                className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {conciliando
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  : <CheckCircle className="h-4 w-4" />}
                Confirmar Conciliación
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
