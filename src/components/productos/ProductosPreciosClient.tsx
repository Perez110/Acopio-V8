'use client';

import { useState } from 'react';
import {
  Plus, Pencil, CheckCircle, AlertCircle, Power, PowerOff, TrendingDown, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateProducto } from '@/app/productos-precios/actions';
import Modal from '@/components/ui/Modal';
import type { Producto } from '@/types/database';

interface Props {
  productos: Producto[];
}

type FormValues = {
  nombre: string;
  descripcion: string;
  precio_compra_kg: string;
  precio_venta_kg: string;
  activo: string;
};

function empty(): FormValues {
  return { nombre: '', descripcion: '', precio_compra_kg: '', precio_venta_kg: '', activo: 'true' };
}

function toForm(p: Producto): FormValues {
  return {
    nombre: p.nombre ?? '',
    descripcion: p.descripcion ?? '',
    precio_compra_kg: p.precio_compra_kg != null ? String(p.precio_compra_kg) : '',
    precio_venta_kg: p.precio_venta_kg != null ? String(p.precio_venta_kg) : '',
    activo: String(p.activo ?? true),
  };
}

function toPayload(f: FormValues) {
  return {
    nombre: f.nombre.trim(),
    descripcion: f.descripcion.trim() || null,
    precio_compra_kg: f.precio_compra_kg ? parseFloat(f.precio_compra_kg) : null,
    precio_venta_kg: f.precio_venta_kg ? parseFloat(f.precio_venta_kg) : null,
    activo: f.activo === 'true',
  };
}

function F({ label, name, form, onChange, type = 'text', placeholder, hint }: {
  label: string; name: keyof FormValues; form: FormValues;
  onChange: (n: keyof FormValues, v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</label>
      <input
        type={type}
        value={form[name]}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? '0' : undefined}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function ProductosPreciosClient({ productos: init }: Props) {
  const [productos, setProductos] = useState(init);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(empty());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function setField(name: keyof FormValues, value: string) {
    setForm(f => ({ ...f, [name]: value }));
  }

  function openCreate() {
    setEditId(null);
    setForm(empty());
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(p: Producto) {
    setEditId(p.id);
    setForm(toForm(p));
    setFormError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setFormError('El nombre del producto es obligatorio.'); return; }
    setSaving(true);
    setFormError('');
    const payload = toPayload(form);

    if (editId === null) {
      const { data, error } = await supabase.from('Productos').insert(payload).select().single();
      if (error) { setFormError(error.message); setSaving(false); return; }
      setProductos(prev =>
        [...prev, data as Producto].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
      );
      showToast('success', `Producto "${(data as Producto).nombre}" creado.`);
    } else {
      const { data, error } = await updateProducto(editId, {
        nombre: payload.nombre,
        descripcion: payload.descripcion,
        precio_compra_kg: payload.precio_compra_kg,
        precio_venta_kg: payload.precio_venta_kg,
        activo: payload.activo,
      });
      if (error || !data) {
        setFormError(error ?? 'Error al actualizar el producto.');
        setSaving(false);
        return;
      }
      setProductos(prev => prev.map(p => p.id === editId ? (data as Producto) : p));
      showToast('success', 'Precio actualizado. Se recalcularon todos los movimientos de la temporada');
    }
    setSaving(false);
    closeModal();
  }

  async function toggleActivo(p: Producto) {
    const { data, error } = await supabase
      .from('Productos').update({ activo: !p.activo }).eq('id', p.id).select().single();
    if (error) { showToast('error', error.message); return; }
    setProductos(prev => prev.map(x => x.id === p.id ? (data as Producto) : x));
  }

  const margen = (p: Producto) => {
    if (p.precio_compra_kg == null || p.precio_venta_kg == null || p.precio_compra_kg === 0) return null;
    return ((p.precio_venta_kg - p.precio_compra_kg) / p.precio_compra_kg) * 100;
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-700">
            Catálogo de Productos
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{productos.length}</span>
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Producto</th>
              <th className="px-5 py-3">Descripción</th>
              <th className="px-5 py-3 text-right">
                <span className="flex items-center justify-end gap-1"><TrendingDown className="h-3 w-3 text-orange-500" />Compra $/kg</span>
              </th>
              <th className="px-5 py-3 text-right">
                <span className="flex items-center justify-end gap-1"><TrendingUp className="h-3 w-3 text-green-500" />Venta $/kg</span>
              </th>
              <th className="px-5 py-3 text-right">Margen</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {productos.length === 0 && (
              <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">Sin productos registrados.</td></tr>
            )}
            {productos.map(p => {
              const m = margen(p);
              return (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-semibold text-gray-900">{p.nombre ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{p.descripcion ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-orange-700">
                    {p.precio_compra_kg != null ? `$${p.precio_compra_kg.toFixed(2)}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-green-700">
                    {p.precio_venta_kg != null ? `$${p.precio_venta_kg.toFixed(2)}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {m != null ? (
                      <span className={`text-xs font-semibold ${m >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m >= 0 ? '+' : ''}{m.toFixed(1)}%
                      </span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(p)} title="Editar precios" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => toggleActivo(p)} title={p.activo ? 'Desactivar' : 'Activar'}
                        className={`rounded-lg p-1.5 transition-colors ${p.activo ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}>
                        {p.activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        * Los precios se usan como base en Movimiento de Fruta. Cada ingreso/salida guarda su precio histórico al momento del registro.
      </p>

      {/* Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editId ? 'Editar Producto' : 'Nuevo Producto'} size="md">
        <div className="space-y-4 px-6 py-5">
          {formError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />{formError}
            </div>
          )}
          <F label="Nombre *" name="nombre" form={form} onChange={setField} placeholder="Ej: Naranja Valencia" />
          <F label="Descripción" name="descripcion" form={form} onChange={setField} placeholder="Opcional" />
          <div className="grid grid-cols-2 gap-4">
            <F
              label="Precio Compra ($/kg)"
              name="precio_compra_kg"
              form={form}
              onChange={setField}
              type="number"
              placeholder="0.00"
              hint="Precio al que se compra al proveedor"
            />
            <F
              label="Precio Venta ($/kg)"
              name="precio_venta_kg"
              form={form}
              onChange={setField}
              type="number"
              placeholder="0.00"
              hint="Precio al que se vende al cliente"
            />
          </div>

          {/* Preview margen */}
          {form.precio_compra_kg && form.precio_venta_kg && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-500">Margen estimado:</div>
              {(() => {
                const c = parseFloat(form.precio_compra_kg);
                const v = parseFloat(form.precio_venta_kg);
                const m = c > 0 ? ((v - c) / c) * 100 : 0;
                return (
                  <span className={`text-sm font-bold ${m >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m >= 0 ? '+' : ''}{m.toFixed(1)}%
                  </span>
                );
              })()}
            </div>
          )}

          {editId && (
            <label className="flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={form.activo === 'true'}
                onChange={e => setField('activo', e.target.checked ? 'true' : 'false')}
                className="h-4 w-4 rounded accent-green-600" />
              <span className="text-sm text-gray-700">Activo</span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={closeModal} disabled={saving} className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.nombre.trim()}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle className="h-4 w-4" />}
            {editId ? 'Guardar Cambios' : 'Crear Producto'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
