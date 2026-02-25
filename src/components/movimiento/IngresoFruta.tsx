'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, CheckCircle, AlertCircle, RotateCcw, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getSaldoEnvasesProveedor } from '@/app/movimiento/actions';
import { insertarMovimientosEnvases } from '@/app/inventario/actions';
import { generarRemitoIngresoPdf } from './remitoIngresoPdf';
import { useConfigEmpresa } from '@/components/ClientShell';
import { convertUrlToBase64 } from '@/lib/imageUtils';
import { formatCurrency, formatNumber } from '@/lib/utils';
import Combobox, { type ComboOption } from '@/components/ui/Combobox';
import Modal from '@/components/ui/Modal';
import {
  ProveedorQuickForm,
  FleteroQuickForm,
  ProductoQuickForm,
  EnvaseQuickForm,
} from '@/components/maestros/QuickForms';
import type { Proveedor, Fletero, Producto, Envase } from '@/types/database';

// ── Tipos locales ─────────────────────────────────────────────────────────────
interface PesajeItem {
  _id: string;
  producto_id: number;
  producto_nombre: string;
  envase_id: number;
  envase_nombre: string;
  envase_tara_kg: number;
  cantidad_envases: number;
  peso_bruto_kg: number;
  tara_total_kg: number;
  peso_neto_kg: number;
  precio_compra_kg: number;
  monto_total: number;
}

type Toast = { type: 'success' | 'error'; msg: string };

interface RetiradoItem {
  _id: string;
  envase_id: number;
  envase_nombre: string;
  cantidad: number;
}

type CreateModal =
  | { type: 'proveedor'; term: string }
  | { type: 'fletero'; term: string }
  | { type: 'producto'; term: string }
  | { type: 'envase'; term: string }
  | null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function sortByNombre<T extends { nombre: string | null }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function IngresoFruta() {
  const configEmpresa = useConfigEmpresa();
  // Listas de Supabase
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [fleteros, setFleteros] = useState<Fletero[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [loading, setLoading] = useState(true);

  // Encabezado
  const [fecha, setFecha] = useState(nowLocal);
  const [proveedorId, setProveedorId] = useState('');
  const [fleteroId, setFleteroId] = useState('');

  // Formulario pesaje
  // true = Tara Automática (default) | false = Tara Manual (medios bines, etc.)
  const [taraAuto, setTaraAuto] = useState(true);
  const [productoId, setProductoId] = useState('');
  const [envaseId, setEnvaseId] = useState('');
  const [cantidad, setCantidad] = useState<number | ''>(1);
  const [pesoBruto, setPesoBruto] = useState<number | ''>('');
  const [taraManual, setTaraManual] = useState<number | ''>('');

  // Listas acumuladas
  const [listaPesajes, setListaPesajes] = useState<PesajeItem[]>([]);
  // Envases vacíos que el proveedor se lleva (opcional)
  const [listaRetirados, setListaRetirados] = useState<RetiradoItem[]>([]);
  const [retiradoEnvaseId, setRetiradoEnvaseId] = useState('');
  const [retiradoCantidad, setRetiradoCantidad] = useState(1);

  // Submit / UI
  const [submitting, setSubmitting] = useState(false);
  const lastSubmit = useRef(0);
  const [toast, setToast] = useState<Toast | null>(null);

  // Modal comprobante tras ingreso exitoso (datos para el PDF)
  const [comprobanteModal, setComprobanteModal] = useState<{
    nroOperacion: number;
    fechaHora: string;
    proveedorNombre: string;
    proveedorCuit: string;
    items: PesajeItem[];
    saldoPendiente: number;
    envasesRetiradosHoy: number;
  } | null>(null);

  // Modal de creación al vuelo
  const [createModal, setCreateModal] = useState<CreateModal>(null);

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('Proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('Fleteros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('Productos').select('id, nombre, precio_compra_kg').eq('activo', true).order('nombre'),
      supabase.from('Envases').select('id, nombre, tara_kg').eq('activo', true).order('nombre'),
    ]).then(([{ data: prov }, { data: flet }, { data: prod }, { data: env }]) => {
      setProveedores((prov ?? []) as Proveedor[]);
      setFleteros((flet ?? []) as Fletero[]);
      setProductos((prod ?? []) as Producto[]);
      setEnvases((env ?? []) as Envase[]);
      setLoading(false);
    });
  }, []);

  // ── Derivados ─────────────────────────────────────────────────────────────
  const envaseSelec = envases.find(e => e.id === Number(envaseId));
  const productoSelec = productos.find(p => p.id === Number(productoId));

  // Tara total según el modo activo
  const cantidadEfectiva = cantidad === '' ? 0 : cantidad;
  const taraTotal = taraAuto
    ? (envaseSelec?.tara_kg ?? 0) * cantidadEfectiva
    : Number(taraManual || 0);

  const pesoNeto = Math.max(0, Number(pesoBruto || 0) - taraTotal);

  // El precio SIEMPRE viene del maestro de Productos, nunca se sobreescribe
  const precioActivo = productoSelec?.precio_compra_kg ?? 0;
  const montoEstimado = pesoNeto * precioActivo;

  // Al cambiar de modo: resetear campos del modo anterior y ajustar cantidad mínima
  useEffect(() => {
    if (taraAuto) {
      setTaraManual('');
      setCantidad(prev => (prev === '' ? '' : Math.max(1, prev)));
    }
  }, [taraAuto]);

  // ── Opciones para Combobox ────────────────────────────────────────────────
  const optProveedores: ComboOption[] = proveedores.map(p => ({ value: String(p.id), label: p.nombre ?? '' }));
  const optFleteros: ComboOption[] = fleteros.map(f => ({ value: String(f.id), label: f.nombre ?? '' }));
  const optProductos: ComboOption[] = productos.map(p => ({ value: String(p.id), label: p.nombre ?? '' }));
  const optEnvases: ComboOption[] = envases.map(e => ({
    value: String(e.id),
    label: `${e.nombre ?? ''} — ${e.tara_kg ?? 0} kg tara`,
  }));

  // ── Acciones ──────────────────────────────────────────────────────────────
  function handleAgregarPesaje() {
    // En modo automático: envase obligatorio. En modo manual: solo producto y peso
    if (!productoSelec || !pesoBruto) return;
    if (taraAuto && !envaseSelec) return;

    const tara = taraAuto
      ? (envaseSelec!.tara_kg ?? 0) * cantidadEfectiva
      : Number(taraManual || 0);
    const neto = Math.max(0, Number(pesoBruto) - tara);
    // Precio siempre del maestro de Productos
    const precio = productoSelec.precio_compra_kg ?? 0;

    setListaPesajes(prev => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        producto_id: productoSelec.id,
        producto_nombre: productoSelec.nombre ?? '',
        envase_id: envaseSelec?.id ?? 0,
        envase_nombre: envaseSelec?.nombre ?? '—',
        envase_tara_kg: taraAuto ? (envaseSelec!.tara_kg ?? 0) : 0,
        cantidad_envases: cantidadEfectiva,
        peso_bruto_kg: Number(pesoBruto),
        tara_total_kg: tara,
        peso_neto_kg: neto,
        precio_compra_kg: precio,
        monto_total: neto * precio,
      },
    ]);
    // Reset del formulario de pesaje
    setProductoId('');
    setEnvaseId('');
    setCantidad(taraAuto ? 1 : 0);
    setPesoBruto('');
    setTaraManual('');
  }

  function handleLimpiar() {
    setListaPesajes([]);
    setListaRetirados([]);
    setRetiradoEnvaseId('');
    setRetiradoCantidad(1);
    setProveedorId('');
    setFleteroId('');
    setFecha(nowLocal());
    setProductoId('');
    setEnvaseId('');
    setCantidad(taraAuto ? 1 : 0);
    setPesoBruto('');
    setTaraManual('');
  }

  async function handleRegistrar() {
    const now = Date.now();
    if (!proveedorId || listaPesajes.length === 0 || submitting || now - lastSubmit.current < 2000) return;
    setSubmitting(true);
    lastSubmit.current = now;
    setToast(null);
    try {
      const fechaStr = fecha.split('T')[0];
      const proveedorNum = Number(proveedorId);

      // Deduce envases automáticamente a partir de los pesajes
      const envasesPorId = listaPesajes.reduce<Record<number, number>>((acc, p) => {
        if (!p.envase_id || p.cantidad_envases <= 0) return acc;
        acc[p.envase_id] = (acc[p.envase_id] ?? 0) + p.cantidad_envases;
        return acc;
      }, {});

      const registrosEntrada = Object.entries(envasesPorId).map(([envaseId, cant]) => ({
        fecha_movimiento: fechaStr,
        tipo_movimiento: 'ENTRADA' as const,
        envase_id: Number(envaseId),
        cantidad: cant,
        proveedor_id: proveedorNum,
        cliente_id: null,
        fletero_id: null,
        remito_asociado: null,
        notas: 'Ingreso de fruta – envases (desde pesajes)',
      }));

      const registrosSalida = listaRetirados.map(r => ({
        fecha_movimiento: fechaStr,
        tipo_movimiento: 'SALIDA' as const,
        envase_id: r.envase_id,
        cantidad: r.cantidad,
        proveedor_id: proveedorNum,
        cliente_id: null,
        fletero_id: null,
        remito_asociado: null,
        notas: 'Envases vacíos retirados en ingreso de fruta',
      }));

      const todosMovimientos = [...registrosEntrada, ...registrosSalida];
      if (todosMovimientos.length > 0) {
        const resultMov = await insertarMovimientosEnvases(todosMovimientos);
        if (!resultMov.success) {
          setToast({ type: 'error', msg: resultMov.error ?? 'Error al registrar movimientos de envases.' });
          setSubmitting(false);
          return;
        }
      }

      const { data: inserted, error: err1 } = await supabase
        .from('Entradas_Fruta')
        .insert(
          listaPesajes.map(p => ({
            fecha_entrada: fechaStr,
            proveedor_id: proveedorNum,
            producto_id: p.producto_id,
            envase_id: p.envase_id,
            cantidad_envases: p.cantidad_envases,
            peso_bruto_kg: p.peso_bruto_kg,
            peso_neto_kg: p.peso_neto_kg,
            precio_compra_kg_historico: p.precio_compra_kg,
            monto_total: p.monto_total,
            notas: null,
          })),
        )
        .select('id');
      if (err1) throw err1;

      const envasesRetiradosHoy = listaRetirados.reduce((s, r) => s + r.cantidad, 0);
      const nroOp = inserted?.[0]?.id ?? 0;
      const saldoPendiente = await getSaldoEnvasesProveedor(Number(proveedorId));
      const prov = proveedores.find(p => p.id === Number(proveedorId));

      setComprobanteModal({
        nroOperacion: nroOp,
        fechaHora: fecha.replace('T', ' '),
        proveedorNombre: prov?.nombre ?? '',
        proveedorCuit: prov?.cuit_dni ?? '',
        items: [...listaPesajes],
        saldoPendiente,
        envasesRetiradosHoy,
      });
      const total = listaPesajes.reduce((s, p) => s + p.peso_neto_kg, 0);
      setToast({ type: 'success', msg: `✓ Ingreso registrado: ${listaPesajes.length} pesaje(s) — ${formatNumber(total)} kg neto` });
      handleLimpiar();
    } catch (err: unknown) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Error al registrar el ingreso' });
    } finally {
      setSubmitting(false);
    }
  }

  const totalNeto = listaPesajes.reduce((s, p) => s + p.peso_neto_kg, 0);
  const totalMonto = listaPesajes.reduce((s, p) => s + p.monto_total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
          toast.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Datos del Ingreso ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>📋</span> Datos del Ingreso
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Fecha y Hora</label>
            <input
              type="datetime-local"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Proveedor <span className="text-red-500">*</span>
            </label>
            <Combobox
              options={optProveedores}
              value={proveedorId}
              onChange={setProveedorId}
              placeholder="Buscar proveedor…"
              createLabel="proveedor"
              onCreateNew={term => setCreateModal({ type: 'proveedor', term })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Fletero</label>
            <Combobox
              options={optFleteros}
              value={fleteroId}
              onChange={setFleteroId}
              placeholder="Buscar fletero…"
              createLabel="fletero"
              onCreateNew={term => setCreateModal({ type: 'fletero', term })}
            />
          </div>
        </div>
      </div>

      {/* ── Nuevo Pesaje ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <span>⚖️</span> Nuevo Pesaje
          </h3>
          {/* Toggle: Tara Automática / Tara Manual */}
          <label className="flex cursor-pointer items-center gap-2.5 select-none">
            <button
              role="switch"
              aria-checked={taraAuto}
              onClick={() => setTaraAuto(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${taraAuto ? 'bg-green-500' : 'bg-orange-400'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${taraAuto ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
            </button>
            <span className={`text-sm font-medium ${taraAuto ? 'text-green-700' : 'text-orange-700'}`}>
              {taraAuto ? 'Tara Automática' : 'Tara Manual'}
            </span>
          </label>
        </div>

        {/* Aviso contextual del modo */}
        {!taraAuto && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3.5 py-2.5 text-xs text-orange-700">
            <span className="mt-0.5 flex-shrink-0">⚠️</span>
            <span>
              Modo manual: ingresá la tara real del bin. La cantidad puede ser <strong>0</strong> si el productor usa un bin ajeno sin aportar envase al stock.
              El precio se toma automáticamente del maestro de Productos.
            </span>
          </div>
        )}

        {/* Fila 1: Producto · Envase · Cantidad */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Producto <span className="text-red-400">*</span>
            </label>
            <Combobox
              options={optProductos}
              value={productoId}
              onChange={setProductoId}
              placeholder="Buscar producto…"
              createLabel="producto"
              onCreateNew={term => setCreateModal({ type: 'producto', term })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Tipo de Envase{taraAuto && <span className="ml-0.5 text-red-400">*</span>}
            </label>
            <Combobox
              options={optEnvases}
              value={envaseId}
              onChange={setEnvaseId}
              placeholder="Buscar envase…"
              createLabel="envase"
              onCreateNew={term => setCreateModal({ type: 'envase', term })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Cantidad{!taraAuto && <span className="ml-1 text-gray-400">(puede ser 0)</span>}
            </label>
            <input
              type="number"
              value={cantidad}
              onFocus={e => e.target.select()}
              onChange={e => {
                const raw = e.target.value;
                if (raw === '') {
                  setCantidad('');
                  return;
                }
                const parsed = Number(raw);
                if (Number.isNaN(parsed)) return;
                if (taraAuto) {
                  setCantidad(Math.max(1, parsed));
                } else {
                  setCantidad(parsed);
                }
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>
        </div>

        {/* Fila 2: Peso Bruto + (Tara Manual si aplica) */}
        <div className={`mb-4 grid grid-cols-1 gap-4 ${!taraAuto ? 'sm:grid-cols-2' : 'max-w-xs'}`}>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Peso Bruto (kg) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={pesoBruto}
              onChange={e => setPesoBruto(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>
          {/* Solo en modo manual: Tara Manual (kg) */}
          {!taraAuto && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">
                Tara Manual (kg) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={taraManual}
                onChange={e => setTaraManual(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej: 350 para medio bin"
                className="w-full rounded-lg border border-orange-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          )}
        </div>

        {/* Resultados calculados en tiempo real */}
        <div className="mb-4 flex flex-wrap items-center gap-6 rounded-lg bg-gray-50 px-5 py-3">
          <div>
            <p className="text-xs text-gray-400">
              {taraAuto ? 'Tara Automática' : 'Tara Manual'}
            </p>
            <p className="text-sm font-semibold text-gray-700">{formatNumber(taraTotal)} kg</p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <p className="text-xs text-gray-400">Peso Neto</p>
            <p className="text-xl font-bold text-green-600">{formatNumber(pesoNeto)} kg</p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <p className="text-xs text-gray-400">
              Precio ({productoSelec ? `${formatCurrency(precioActivo)}/kg` : 'seleccioná producto'})
            </p>
            <p className="text-sm font-semibold text-gray-700">
              {formatCurrency(montoEstimado)}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleAgregarPesaje}
            disabled={
              !productoId ||
              !pesoBruto ||
              (taraAuto && !envaseId) ||
              (!taraAuto && taraManual === '')
            }
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar a Lista
          </button>
        </div>

        {/* Lista pesajes */}
        {listaPesajes.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Envase</th>
                  <th className="px-4 py-3 text-right">Cant.</th>
                  <th className="px-4 py-3 text-right">P. Bruto</th>
                  <th className="px-4 py-3 text-right">Tara</th>
                  <th className="px-4 py-3 text-right text-green-700">P. Neto</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listaPesajes.map(item => (
                  <tr key={item._id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-medium">{item.producto_nombre}</td>
                    <td className="px-4 py-3 text-gray-500">{item.envase_nombre}</td>
                    <td className="px-4 py-3 text-right">{item.cantidad_envases}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(item.peso_bruto_kg)} kg</td>
                    <td className="px-4 py-3 text-right text-gray-400">{formatNumber(item.tara_total_kg)} kg</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">{formatNumber(item.peso_neto_kg)} kg</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(item.monto_total)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setListaPesajes(prev => prev.filter(p => p._id !== item._id))} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-green-50 font-semibold text-green-800">
                  <td className="px-4 py-3" colSpan={5}>TOTAL</td>
                  <td className="px-4 py-3 text-right">{formatNumber(totalNeto)} kg</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(totalMonto)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Envases Vacíos Retirados (Opcional) ────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>📦</span> Envases Vacíos Retirados (Opcional)
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          Si el proveedor se lleva envases vacíos en el mismo viaje, agregalos para que el saldo del remito quede actualizado.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Tipo de envase</label>
            <Combobox
              options={optEnvases}
              value={retiradoEnvaseId}
              onChange={setRetiradoEnvaseId}
              placeholder="Buscar envase…"
              createLabel="envase"
              onCreateNew={term => setCreateModal({ type: 'envase', term })}
            />
          </div>
          <div className="w-24">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Cantidad</label>
            <input
              type="number"
              min={1}
              value={retiradoCantidad}
              onChange={e => setRetiradoCantidad(Math.max(1, Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!retiradoEnvaseId) return;
              const env = envases.find(e => e.id === Number(retiradoEnvaseId));
              if (!env) return;
              setListaRetirados(prev => [
                ...prev,
                { _id: crypto.randomUUID(), envase_id: env.id, envase_nombre: env.nombre ?? '—', cantidad: retiradoCantidad },
              ]);
              setRetiradoCantidad(1);
            }}
            disabled={!retiradoEnvaseId}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
        {listaRetirados.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Envase</th>
                  <th className="px-4 py-3 text-right">Cant.</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listaRetirados.map(item => (
                  <tr key={item._id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-medium">{item.envase_nombre}</td>
                    <td className="px-4 py-3 text-right">{item.cantidad}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setListaRetirados(prev => prev.filter(r => r._id !== item._id))}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-3">Total retirados</td>
                  <td className="px-4 py-3 text-right">{listaRetirados.reduce((s, r) => s + r.cantidad, 0)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Acciones finales ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={handleLimpiar} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <RotateCcw className="h-4 w-4" />
          Limpiar formulario
        </button>
        <button
          onClick={handleRegistrar}
          disabled={!proveedorId || listaPesajes.length === 0 || submitting}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {submitting ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle className="h-4 w-4" />}
          Registrar Ingreso
        </button>
      </div>

      {/* Modal comprobante tras ingreso exitoso */}
      <Modal
        open={!!comprobanteModal}
        onClose={() => setComprobanteModal(null)}
        title="Comprobante de Ingreso"
        subtitle="Remito de ingreso de fruta registrado correctamente"
        size="sm"
      >
        {comprobanteModal && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 px-6 py-4 text-sm text-gray-700">
              <p>
                Operación Nº <strong>{comprobanteModal.nroOperacion}</strong> — {comprobanteModal.proveedorNombre}
              </p>
              <p className="text-gray-500">
                {comprobanteModal.items.length} pesaje(s) ·{' '}
                {comprobanteModal.items.reduce((s, p) => s + p.cantidad_envases, 0)} envases ingresados
                {comprobanteModal.envasesRetiradosHoy > 0 && (
                  <> · {comprobanteModal.envasesRetiradosHoy} envases vacíos retirados</>
                )}
                {' · Saldo total pendiente (tras esta operación): '}{comprobanteModal.saldoPendiente}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 px-6 pb-2">
              <button
                onClick={async () => {
                  let empresaLogoBase64: string | null = null;
                  if (configEmpresa?.logo_url) {
                    empresaLogoBase64 = await convertUrlToBase64(configEmpresa.logo_url);
                  }
                  generarRemitoIngresoPdf({
                    nroOperacion: comprobanteModal.nroOperacion,
                    fechaHora: comprobanteModal.fechaHora,
                    proveedorNombre: comprobanteModal.proveedorNombre,
                    proveedorCuit: comprobanteModal.proveedorCuit,
                    items: comprobanteModal.items.map(p => ({
                      producto_nombre: p.producto_nombre,
                      envase_nombre: p.envase_nombre,
                      cantidad_envases: p.cantidad_envases,
                      peso_bruto_kg: p.peso_bruto_kg,
                      tara_total_kg: p.tara_total_kg,
                      peso_neto_kg: p.peso_neto_kg,
                    })),
                    envasesIngresadosHoy:
                      comprobanteModal.items.reduce((s, p) => s + p.cantidad_envases, 0),
                    envasesRetiradosHoy: comprobanteModal.envasesRetiradosHoy,
                    saldoPendiente: comprobanteModal.saldoPendiente,
                    empresaNombre: configEmpresa?.nombre_empresa || 'Acopio',
                    empresaLogoBase64: empresaLogoBase64 ?? undefined,
                  });
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-100"
              >
                <Printer className="h-4 w-4" />
                Imprimir Comprobante
              </button>
              <button
                onClick={() => setComprobanteModal(null)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modales de creación al vuelo ──────────────────────────────────── */}
      <Modal
        open={createModal?.type === 'proveedor'}
        onClose={() => setCreateModal(null)}
        title="Nuevo Proveedor"
        subtitle="Se creará y se seleccionará automáticamente"
        size="sm"
      >
        <ProveedorQuickForm
          initialName={createModal?.type === 'proveedor' ? createModal.term : ''}
          onSuccess={prov => {
            setProveedores(prev => sortByNombre([...prev, prov]));
            setProveedorId(String(prov.id));
            setCreateModal(null);
          }}
          onCancel={() => setCreateModal(null)}
        />
      </Modal>

      <Modal
        open={createModal?.type === 'fletero'}
        onClose={() => setCreateModal(null)}
        title="Nuevo Fletero"
        subtitle="Se creará y se seleccionará automáticamente"
        size="sm"
      >
        <FleteroQuickForm
          initialName={createModal?.type === 'fletero' ? createModal.term : ''}
          onSuccess={flet => {
            setFleteros(prev => sortByNombre([...prev, flet]));
            setFleteroId(String(flet.id));
            setCreateModal(null);
          }}
          onCancel={() => setCreateModal(null)}
        />
      </Modal>

      <Modal
        open={createModal?.type === 'producto'}
        onClose={() => setCreateModal(null)}
        title="Nuevo Producto"
        subtitle="Se creará y se seleccionará automáticamente"
        size="sm"
      >
        <ProductoQuickForm
          initialName={createModal?.type === 'producto' ? createModal.term : ''}
          onSuccess={prod => {
            setProductos(prev => sortByNombre([...prev, prod]));
            setProductoId(String(prod.id));
            setCreateModal(null);
          }}
          onCancel={() => setCreateModal(null)}
        />
      </Modal>

      <Modal
        open={createModal?.type === 'envase'}
        onClose={() => setCreateModal(null)}
        title="Nuevo Tipo de Envase"
        subtitle="Se creará y se seleccionará automáticamente"
        size="sm"
      >
        <EnvaseQuickForm
          initialName={createModal?.type === 'envase' ? createModal.term : ''}
          onSuccess={env => {
            setEnvases(prev => sortByNombre([...prev, env]));
            // Seleccionar en la sección activa (pesaje o llenos)
            if (!envaseId) setEnvaseId(String(env.id));
            setCreateModal(null);
          }}
          onCancel={() => setCreateModal(null)}
        />
      </Modal>
    </div>
  );
}
