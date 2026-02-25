'use client';

import { useState } from 'react';
import {
  Users, Truck, UserCheck, Package,
  Plus, Pencil, CheckCircle, AlertCircle, PowerOff, Power,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import type { Proveedor, Cliente, Fletero, Envase } from '@/types/database';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type EntityType = 'proveedor' | 'cliente' | 'fletero' | 'envase';
type FormValues = Record<string, string>;

interface Props {
  proveedores: Proveedor[];
  clientes: Cliente[];
  fleteros: Fletero[];
  envases: Envase[];
}

// ── Defaults de formulario por entidad ───────────────────────────────────────
function emptyForm(entity: EntityType): FormValues {
  const base = { activo: 'true' };
  switch (entity) {
    case 'proveedor': return { ...base, nombre: '', cuit_dni: '', telefono: '', direccion: '', notas: '' };
    case 'cliente': return { ...base, nombre: '', cuit: '', telefono: '', email: '', direccion_fabrica: '', contacto_principal: '', notas: '' };
    case 'fletero': return { ...base, nombre: '', cuit_dni: '', telefono: '', precio_por_kg: '', precio_viaje_vacios: '', notas: '' };
    case 'envase': return { ...base, nombre: '', descripcion: '', tara_kg: '', valor_monetario: '' };
  }
}

function entityToForm(entity: EntityType, data: Record<string, unknown>): FormValues {
  const defaults = emptyForm(entity);
  const result: FormValues = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const v = data[key];
    result[key] = v == null ? '' : String(v);
  }
  return result;
}

function formToPayload(entity: EntityType, form: FormValues): Record<string, unknown> {
  const numFields = ['precio_por_kg', 'precio_viaje_vacios', 'tara_kg', 'valor_monetario'];
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form)) {
    if (k === 'activo') { payload[k] = v === 'true'; }
    else if (numFields.includes(k)) { payload[k] = v === '' ? null : parseFloat(v); }
    else { payload[k] = v.trim() === '' ? null : v.trim(); }
  }
  return payload;
}

const TABLE: Record<EntityType, string> = {
  proveedor: 'Proveedores',
  cliente: 'Clientes',
  fletero: 'Fleteros',
  envase: 'Envases',
};

const ENTITY_LABEL: Record<EntityType, string> = {
  proveedor: 'Proveedor',
  cliente: 'Cliente',
  fletero: 'Fletero',
  envase: 'Tipo de Envase',
};

// ── Componentes internos ──────────────────────────────────────────────────────
function F({
  label, name, form, onChange, type = 'text', placeholder, required,
}: {
  label: string; name: string; form: FormValues;
  onChange: (n: string, v: string) => void;
  type?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={form[name] ?? ''}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
      />
    </div>
  );
}

function ActiveBadge({ activo }: { activo: boolean | null }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MaestrosClient({ proveedores: initP, clientes: initC, fleteros: initF, envases: initE }: Props) {
  type TabId = 'proveedor' | 'cliente' | 'fletero' | 'envase';
  const [tab, setTab] = useState<TabId>('proveedor');

  // Listas locales (hidratadas desde el servidor, manejadas cliente-side después)
  const [proveedores, setProveedores] = useState(initP);
  const [clientes, setClientes] = useState(initC);
  const [fleteros, setFleteros] = useState(initF);
  const [envases, setEnvases] = useState(initE);

  // Modal de edición / creación
  const [modalEntity, setModalEntity] = useState<EntityType | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormValues>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function setField(name: string, value: string) {
    setFormData(f => ({ ...f, [name]: value }));
  }

  // ── Abrir modal ────────────────────────────────────────────────────────────
  function openCreate(entity: EntityType) {
    setModalEntity(entity);
    setEditId(null);
    setFormData(emptyForm(entity));
    setFormError('');
  }

  function openEdit(entity: EntityType, item: Record<string, unknown>) {
    setModalEntity(entity);
    setEditId(item.id as number);
    setFormData(entityToForm(entity, item));
    setFormError('');
  }

  function closeModal() {
    setModalEntity(null);
    setEditId(null);
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!modalEntity) return;
    if (!formData.nombre?.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setFormError('');
    const payload = formToPayload(modalEntity, formData);
    const table = TABLE[modalEntity];

    if (editId === null) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) { setFormError(error.message); setSaving(false); return; }
      addToList(modalEntity, data as Record<string, unknown>);
      showToast('success', `${ENTITY_LABEL[modalEntity]} creado correctamente.`);
    } else {
      const { data, error } = await supabase.from(table).update(payload).eq('id', editId).select().single();
      if (error) { setFormError(error.message); setSaving(false); return; }
      updateInList(modalEntity, data as Record<string, unknown>);
      showToast('success', `${ENTITY_LABEL[modalEntity]} actualizado.`);
    }
    setSaving(false);
    closeModal();
  }

  // ── Toggle activo (soft delete) ────────────────────────────────────────────
  async function toggleActivo(entity: EntityType, id: number, current: boolean | null) {
    const { data, error } = await supabase
      .from(TABLE[entity])
      .update({ activo: !current })
      .eq('id', id)
      .select()
      .single();
    if (error) { showToast('error', error.message); return; }
    updateInList(entity, data as Record<string, unknown>);
  }

  // ── Helpers de estado de listas ────────────────────────────────────────────
  function sortByNombre<T extends { nombre: string | null }>(arr: T[]): T[] {
    return [...arr].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  }

  function addToList(entity: EntityType, item: Record<string, unknown>) {
    if (entity === 'proveedor') setProveedores(p => sortByNombre([...p, item as unknown as Proveedor]));
    if (entity === 'cliente') setClientes(c => sortByNombre([...c, item as unknown as Cliente]));
    if (entity === 'fletero') setFleteros(f => sortByNombre([...f, item as unknown as Fletero]));
    if (entity === 'envase') setEnvases(e => sortByNombre([...e, item as unknown as Envase]));
  }

  function updateInList(entity: EntityType, item: Record<string, unknown>) {
    const id = item.id as number;
    if (entity === 'proveedor') setProveedores(p => p.map(x => x.id === id ? item as unknown as Proveedor : x));
    if (entity === 'cliente') setClientes(c => c.map(x => x.id === id ? item as unknown as Cliente : x));
    if (entity === 'fletero') setFleteros(f => f.map(x => x.id === id ? item as unknown as Fletero : x));
    if (entity === 'envase') setEnvases(e => e.map(x => x.id === id ? item as unknown as Envase : x));
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS: { id: TabId; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'proveedor', label: 'Proveedores', icon: Truck, count: proveedores.length },
    { id: 'cliente', label: 'Clientes', icon: Users, count: clientes.length },
    { id: 'fletero', label: 'Fleteros', icon: UserCheck, count: fleteros.length },
    { id: 'envase', label: 'Tipos de Envase', icon: Package, count: envases.length },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
            : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
              tab === id
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${
              tab === id ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-500'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Botón nuevo + tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-gray-700">
            {TABS.find(t => t.id === tab)?.label}
          </p>
          <button
            onClick={() => openCreate(tab)}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo {ENTITY_LABEL[tab]}
          </button>
        </div>

        {/* ── Tabla Proveedores ──────────────────────────────────────────── */}
        {tab === 'proveedor' && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-50 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Nombre</th><th className="px-5 py-3">CUIT/DNI</th>
              <th className="px-5 py-3">Teléfono</th><th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {proveedores.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400">Sin proveedores registrados.</td></tr>}
              {proveedores.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{p.nombre ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-gray-600">{p.cuit_dni ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{p.telefono ?? '—'}</td>
                  <td className="px-5 py-3"><ActiveBadge activo={p.activo} /></td>
                  <td className="px-5 py-3"><RowActions onEdit={() => openEdit('proveedor', p as unknown as Record<string,unknown>)} onToggle={() => toggleActivo('proveedor', p.id, p.activo)} activo={p.activo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Tabla Clientes ─────────────────────────────────────────────── */}
        {tab === 'cliente' && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-50 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Nombre</th><th className="px-5 py-3">CUIT</th>
              <th className="px-5 py-3">Email</th><th className="px-5 py-3">Teléfono</th>
              <th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {clientes.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Sin clientes registrados.</td></tr>}
              {clientes.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 ${!c.activo ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{c.nombre ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-gray-600">{c.cuit ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{c.email ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{c.telefono ?? '—'}</td>
                  <td className="px-5 py-3"><ActiveBadge activo={c.activo} /></td>
                  <td className="px-5 py-3"><RowActions onEdit={() => openEdit('cliente', c as unknown as Record<string,unknown>)} onToggle={() => toggleActivo('cliente', c.id, c.activo)} activo={c.activo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Tabla Fleteros ─────────────────────────────────────────────── */}
        {tab === 'fletero' && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-50 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Nombre</th><th className="px-5 py-3">CUIT/DNI</th>
              <th className="px-5 py-3 text-right">Precio/kg</th>
              <th className="px-5 py-3 text-right">Tarifa Vacíos</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {fleteros.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Sin fleteros registrados.</td></tr>}
              {fleteros.map(f => (
                <tr key={f.id} className={`hover:bg-gray-50 ${!f.activo ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{f.nombre ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-gray-600">{f.cuit_dni ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-mono">{f.precio_por_kg != null ? `$${f.precio_por_kg.toFixed(2)}/kg` : '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-sky-700">
                    {f.precio_viaje_vacios != null && f.precio_viaje_vacios > 0
                      ? `$${f.precio_viaje_vacios.toFixed(2)}/viaje`
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3"><ActiveBadge activo={f.activo} /></td>
                  <td className="px-5 py-3"><RowActions onEdit={() => openEdit('fletero', f as unknown as Record<string,unknown>)} onToggle={() => toggleActivo('fletero', f.id, f.activo)} activo={f.activo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Tabla Envases ──────────────────────────────────────────────── */}
        {tab === 'envase' && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-50 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-5 py-3">Nombre</th><th className="px-5 py-3">Descripción</th>
              <th className="px-5 py-3 text-right">Tara (kg)</th><th className="px-5 py-3 text-right">Valor ($)</th>
              <th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {envases.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Sin tipos de envase registrados.</td></tr>}
              {envases.map(e => (
                <tr key={e.id} className={`hover:bg-gray-50 ${!e.activo ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{e.nombre ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{e.descripcion ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-orange-700">{e.tara_kg != null ? `${e.tara_kg} kg` : '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-gray-600">{e.valor_monetario != null ? `$${e.valor_monetario.toFixed(2)}` : '—'}</td>
                  <td className="px-5 py-3"><ActiveBadge activo={e.activo} /></td>
                  <td className="px-5 py-3"><RowActions onEdit={() => openEdit('envase', e as unknown as Record<string,unknown>)} onToggle={() => toggleActivo('envase', e.id, e.activo)} activo={e.activo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal de edición / creación ────────────────────────────────────── */}
      <Modal
        open={modalEntity !== null}
        onClose={closeModal}
        title={`${editId ? 'Editar' : 'Nuevo'} ${modalEntity ? ENTITY_LABEL[modalEntity] : ''}`}
        size="md"
      >
        <div className="space-y-4 px-6 py-5">
          {formError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Campos Proveedor */}
          {modalEntity === 'proveedor' && (
            <>
              <F label="Nombre" name="nombre" form={formData} onChange={setField} placeholder="Ej: Juan Pérez" required />
              <div className="grid grid-cols-2 gap-4">
                <F label="CUIT / DNI" name="cuit_dni" form={formData} onChange={setField} placeholder="20-12345678-9" />
                <F label="Teléfono" name="telefono" form={formData} onChange={setField} type="tel" />
              </div>
              <F label="Dirección" name="direccion" form={formData} onChange={setField} />
              <F label="Notas" name="notas" form={formData} onChange={setField} />
            </>
          )}

          {/* Campos Cliente */}
          {modalEntity === 'cliente' && (
            <>
              <F label="Nombre" name="nombre" form={formData} onChange={setField} placeholder="Ej: Citrícola del Sur S.A." required />
              <div className="grid grid-cols-2 gap-4">
                <F label="CUIT" name="cuit" form={formData} onChange={setField} placeholder="30-12345678-9" />
                <F label="Teléfono" name="telefono" form={formData} onChange={setField} type="tel" />
              </div>
              <F label="Email" name="email" form={formData} onChange={setField} type="email" />
              <div className="grid grid-cols-2 gap-4">
                <F label="Dir. Fábrica" name="direccion_fabrica" form={formData} onChange={setField} />
                <F label="Contacto Principal" name="contacto_principal" form={formData} onChange={setField} />
              </div>
              <F label="Notas" name="notas" form={formData} onChange={setField} />
            </>
          )}

          {/* Campos Fletero */}
          {modalEntity === 'fletero' && (
            <>
              <F label="Nombre" name="nombre" form={formData} onChange={setField} placeholder="Ej: Transporte García" required />
              <div className="grid grid-cols-2 gap-4">
                <F label="CUIT / DNI" name="cuit_dni" form={formData} onChange={setField} />
                <F label="Teléfono" name="telefono" form={formData} onChange={setField} type="tel" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <F label="Precio por kg ($/kg)" name="precio_por_kg" form={formData} onChange={setField} type="number" placeholder="0.00" />
                <div>
                  <F label="Tarifa viaje vacíos ($/viaje)" name="precio_viaje_vacios" form={formData} onChange={setField} type="number" placeholder="0.00" />
                  <p className="mt-1 text-xs text-gray-400">Tarifa plana por traer envases vacíos (logística inversa)</p>
                </div>
              </div>
              <F label="Notas" name="notas" form={formData} onChange={setField} />
            </>
          )}

          {/* Campos Envase */}
          {modalEntity === 'envase' && (
            <>
              <F label="Nombre" name="nombre" form={formData} onChange={setField} placeholder="Ej: Bin de madera 400 kg" required />
              <F label="Descripción" name="descripcion" form={formData} onChange={setField} />
              <div className="grid grid-cols-2 gap-4">
                <F label="Tara (kg)" name="tara_kg" form={formData} onChange={setField} type="number" placeholder="Ej: 25" />
                <F label="Valor monetario ($)" name="valor_monetario" form={formData} onChange={setField} type="number" placeholder="Opcional" />
              </div>
            </>
          )}

          {/* Toggle activo en edición */}
          {editId && (
            <label className="flex cursor-pointer items-center gap-2.5 pt-1">
              <input
                type="checkbox"
                checked={formData.activo === 'true'}
                onChange={e => setField('activo', e.target.checked ? 'true' : 'false')}
                className="h-4 w-4 rounded accent-green-600"
              />
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
            disabled={saving || !formData.nombre?.trim()}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <CheckCircle className="h-4 w-4" />}
            {editId ? 'Guardar Cambios' : `Crear ${modalEntity ? ENTITY_LABEL[modalEntity] : ''}`}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ── RowActions ─────────────────────────────────────────────────────────────────
function RowActions({ onEdit, onToggle, activo }: { onEdit: () => void; onToggle: () => void; activo: boolean | null }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button onClick={onEdit} title="Editar" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onToggle}
        title={activo ? 'Desactivar' : 'Activar'}
        className={`rounded-lg p-1.5 transition-colors ${activo ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}
      >
        {activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
      </button>
    </div>
  );
}
