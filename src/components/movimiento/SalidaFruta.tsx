'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, CheckCircle, AlertCircle, Info, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Combobox, { type ComboOption } from '@/components/ui/Combobox';
import Modal from '@/components/ui/Modal';
import { ClienteQuickForm, FleteroQuickForm, ProductoQuickForm } from '@/components/maestros/QuickForms';
import { registrarSalidaFrutaConEnvases } from '@/app/movimiento/actions';
import type { Cliente, Fletero, Producto, Envase } from '@/types/database';

// ── Tipos ─────────────────────────────────────────────────────────────────────
// Solo datos logísticos — el precio y monto se registran en la Conciliación
interface SalidaItem {
  _id: string;
  cliente_id: number;
  cliente_nombre: string;
  producto_id: number;
  producto_nombre: string;
  fletero_id: number | null;
  fletero_nombre: string;
  peso_salida_acopio_kg: number;
  remito_nro: string;
}

type Toast = { type: 'success' | 'error'; msg: string };
type CreateModal =
  | { type: 'cliente'; term: string }
  | { type: 'fletero'; term: string }
  | { type: 'producto'; term: string }
  | null;

function sortByNombre<T extends { nombre: string | null }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function SalidaFruta() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fleteros, setFleteros] = useState<Fletero[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [envases, setEnvases] = useState<Envase[]>([]);
  const [loading, setLoading] = useState(true);

  // Cabecera de la salida
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [clienteId, setClienteId] = useState('');
  const [fleteroId, setFleteroId] = useState('');

  // Envases que van con el despacho (trazabilidad: baja deuda con el cliente)
  const [envaseId, setEnvaseId] = useState('');
  const [cantidadEnvases, setCantidadEnvases] = useState<number | ''>(0);

  // Formulario de despacho
  const [productoId, setProductoId] = useState('');
  const [pesoSalida, setPesoSalida] = useState<number | ''>('');
  const [remitoNro, setRemitoNro] = useState('');

  // Lista acumulada
  const [listaSalidas, setListaSalidas] = useState<SalidaItem[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const lastSubmit = useRef(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [createModal, setCreateModal] = useState<CreateModal>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('Clientes').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('Fleteros').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('Productos').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('Envases').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: cli }, { data: flet }, { data: prod }, { data: env }]) => {
      setClientes((cli ?? []) as Cliente[]);
      setFleteros((flet ?? []) as Fletero[]);
      setProductos((prod ?? []) as Producto[]);
      setEnvases((env ?? []) as Envase[]);
      setLoading(false);
    });
  }, []);

  // ── Acciones ───────────────────────────────────────────────────────────────
  function handleAgregar() {
    const productoSelec = productos.find(p => p.id === Number(productoId));
    if (!clienteId || !productoSelec || !pesoSalida) return;

    const cli = clientes.find(c => c.id === Number(clienteId))!;
    const flet = fleteros.find(f => f.id === Number(fleteroId));

    setListaSalidas(prev => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        cliente_id: cli.id,
        cliente_nombre: cli.nombre ?? '',
        producto_id: productoSelec.id,
        producto_nombre: productoSelec.nombre ?? '',
        fletero_id: flet?.id ?? null,
        fletero_nombre: flet?.nombre ?? '—',
        peso_salida_acopio_kg: Number(pesoSalida),
        remito_nro: remitoNro,
      },
    ]);

    // Limpiar fila
    setProductoId('');
    setPesoSalida('');
    setRemitoNro('');
  }

  async function handleRegistrar() {
    const now = Date.now();
    if (!clienteId || listaSalidas.length === 0 || submitting || now - lastSubmit.current < 2000) return;
    setSubmitting(true);
    lastSubmit.current = now;
    setToast(null);

    try {
      const cantEnv = cantidadEnvases === '' ? 0 : Number(cantidadEnvases);
      const envId = envaseId ? Number(envaseId) : null;
      if (envId && (cantEnv <= 0 || Number.isNaN(cantEnv))) {
        setToast({ type: 'error', msg: 'Si indicás tipo de envase, la cantidad debe ser mayor a 0.' });
        setSubmitting(false);
        return;
      }

      const result = await registrarSalidaFrutaConEnvases({
        fecha_salida: fecha,
        cliente_id: Number(listaSalidas[0].cliente_id),
        fletero_id: listaSalidas[0].fletero_id,
        lineas: listaSalidas.map(s => ({
          producto_id: s.producto_id,
          peso_salida_acopio_kg: s.peso_salida_acopio_kg,
          remito_nro: s.remito_nro || '',
        })),
        envase_id: envId && cantEnv > 0 ? envId : null,
        cantidad_envases: envId && cantEnv > 0 ? cantEnv : null,
        remito_para_nota: listaSalidas[0].remito_nro || null,
      });

      if (!result.success) {
        setToast({ type: 'error', msg: result.error ?? 'Error al registrar la salida' });
        setSubmitting(false);
        return;
      }

      const totalPeso = listaSalidas.reduce((s, i) => s + i.peso_salida_acopio_kg, 0);
      let msg = `✓ ${listaSalidas.length} remito(s) registrado(s) como PENDIENTE — ${totalPeso.toFixed(2)} kg en tránsito`;
      if (envId && cantEnv > 0) {
        const envNombre = envases.find(e => e.id === envId)?.nombre ?? 'envases';
        msg += ` · ${cantEnv} ${envNombre} registrados (saldo cliente actualizado)`;
      }
      setToast({ type: 'success', msg });
      setListaSalidas([]);
      setClienteId('');
      setFleteroId('');
      setEnvaseId('');
      setCantidadEnvases(0);
    } catch (err: unknown) {
      console.error('[SalidaFruta] catch →', err);
      setToast({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Error al registrar la salida',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const totalPeso = listaSalidas.reduce((s, i) => s + i.peso_salida_acopio_kg, 0);

  // ── Opciones Combobox ─────────────────────────────────────────────────────
  const optClientes: ComboOption[] = clientes.map(c => ({ value: String(c.id), label: c.nombre ?? '' }));
  const optFleteros: ComboOption[] = fleteros.map(f => ({ value: String(f.id), label: f.nombre ?? '' }));
  const optProductos: ComboOption[] = productos.map(p => ({ value: String(p.id), label: p.nombre ?? '' }));
  const optEnvases: ComboOption[] = envases.map(e => ({ value: String(e.id), label: e.nombre ?? `Envase #${e.id}` }));

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
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* ── Aviso de flujo logístico ───────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>
          Esta pestaña registra <strong>datos logísticos</strong>: destino, producto y peso
          despachado. El precio de venta, el peso de llegada real y el monto a cobrar se
          completan en la pestaña <strong>Conciliación</strong> cuando la mercadería llega a
          fábrica.
        </span>
      </div>

      {/* ── Cabecera de la salida ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>🚛</span> Datos del Despacho
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Fecha de Salida
            </label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Cliente <span className="text-red-400">*</span>
            </label>
            <Combobox
              options={optClientes}
              value={clienteId}
              onChange={setClienteId}
              placeholder="Buscar cliente…"
              createLabel="cliente"
              onCreateNew={term => setCreateModal({ type: 'cliente', term })}
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
        {/* Envases que van con el despacho: impactan en saldos con el cliente */}
        <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Package className="h-4 w-4 text-gray-400" />
            Envases del despacho (actualiza saldo con el cliente)
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Tipo de Envase</label>
            <Combobox
              options={optEnvases}
              value={envaseId}
              onChange={setEnvaseId}
              placeholder="Ninguno / Buscar envase…"
            />
          </div>
          <div className="w-28">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Cantidad</label>
            <input
              type="number"
              min={0}
              step={1}
              value={cantidadEnvases}
              onChange={e =>
                setCantidadEnvases(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))
              }
              placeholder="0"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      {/* ── Detalle del despacho ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>📦</span> Línea de Despacho
        </h3>
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Producto</label>
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
              Peso Salida Acopio (kg) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={pesoSalida}
              onChange={e =>
                setPesoSalida(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="0,00"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Remito Nro.
            </label>
            <input
              type="text"
              value={remitoNro}
              onChange={e => setRemitoNro(e.target.value)}
              placeholder="Ej: R-0001"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleAgregar}
            disabled={!clienteId || !productoId || !pesoSalida}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Agregar a Lista
          </button>
        </div>

        {/* ── Lista acumulada ──────────────────────────────────────────────── */}
        {listaSalidas.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Fletero</th>
                  <th className="px-4 py-3 text-right">Peso (kg)</th>
                  <th className="px-4 py-3 text-center">Remito</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listaSalidas.map(s => (
                  <tr key={s._id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.cliente_nombre}</td>
                    <td className="px-4 py-3 text-gray-700">{s.producto_nombre}</td>
                    <td className="px-4 py-3 text-gray-500">{s.fletero_nombre}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {s.peso_salida_acopio_kg.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {s.remito_nro || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
                        Pendiente
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setListaSalidas(prev => prev.filter(i => i._id !== s._id))
                        }
                        className="text-red-400 transition-colors hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-3" colSpan={3}>
                    TOTAL — {listaSalidas.length} remito(s)
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{totalPeso.toFixed(2)} kg</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Acción final ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Las salidas quedan en estado <strong>PENDIENTE</strong> hasta ser conciliadas.
        </p>
        <button
          onClick={handleRegistrar}
          disabled={!clienteId || listaSalidas.length === 0 || submitting}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Registrar Despacho
        </button>
      </div>

      {/* ── Modales de creación al vuelo ──────────────────────────────────── */}
      <Modal
        open={createModal?.type === 'cliente'}
        onClose={() => setCreateModal(null)}
        title="Nuevo Cliente"
        subtitle="Se creará y se seleccionará automáticamente"
        size="sm"
      >
        <ClienteQuickForm
          initialName={createModal?.type === 'cliente' ? createModal.term : ''}
          onSuccess={cli => {
            setClientes(prev => sortByNombre([...prev, cli]));
            setClienteId(String(cli.id));
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
    </div>
  );
}
