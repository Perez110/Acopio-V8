'use client';

/**
 * Formularios de creación rápida (mínimos campos obligatorios).
 * Se usan desde los Combobox de IngresoFruta, SalidaFruta, etc.
 * El CRUD completo con todos los campos está en MaestrosClient.
 */

import { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Proveedor, Cliente, Fletero, Producto, Envase } from '@/types/database';

// ── Utilidades internas ───────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
    />
  );
}

function ModalFooter({
  saving,
  disabled,
  onCancel,
  onSave,
  label,
}: {
  saving: boolean;
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
        {label}
      </button>
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      {msg}
    </div>
  );
}

// ── ProveedorQuickForm ────────────────────────────────────────────────────────
export function ProveedorQuickForm({
  initialName,
  onSuccess,
  onCancel,
}: {
  initialName: string;
  onSuccess: (p: Proveedor) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initialName);
  const [cuitDni, setCuitDni] = useState('');
  const [telefono, setTelefono] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase
      .from('Proveedores')
      .insert({ nombre: nombre.trim(), cuit_dni: cuitDni.trim() || null, telefono: telefono.trim() || null, activo: true })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    onSuccess(data as Proveedor);
  }

  return (
    <div className="space-y-4 px-6 py-5">
      {error && <ErrorMsg msg={error} />}
      <div>
        <Label>Nombre *</Label>
        <Input value={nombre} onChange={setNombre} placeholder="Ej: Juan Pérez" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>CUIT / DNI</Label><Input value={cuitDni} onChange={setCuitDni} placeholder="20-12345678-9" /></div>
        <div><Label>Teléfono</Label><Input value={telefono} onChange={setTelefono} type="tel" placeholder="+54 9 11 1234-5678" /></div>
      </div>
      <ModalFooter saving={saving} disabled={!nombre.trim()} onCancel={onCancel} onSave={handleSave} label="Crear Proveedor" />
    </div>
  );
}

// ── ClienteQuickForm ──────────────────────────────────────────────────────────
export function ClienteQuickForm({
  initialName,
  onSuccess,
  onCancel,
}: {
  initialName: string;
  onSuccess: (c: Cliente) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initialName);
  const [cuit, setCuit] = useState('');
  const [telefono, setTelefono] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase
      .from('Clientes')
      .insert({ nombre: nombre.trim(), cuit: cuit.trim() || null, telefono: telefono.trim() || null, activo: true })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    onSuccess(data as Cliente);
  }

  return (
    <div className="space-y-4 px-6 py-5">
      {error && <ErrorMsg msg={error} />}
      <div>
        <Label>Nombre *</Label>
        <Input value={nombre} onChange={setNombre} placeholder="Ej: Citrícola del Sur S.A." required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>CUIT</Label><Input value={cuit} onChange={setCuit} placeholder="30-12345678-9" /></div>
        <div><Label>Teléfono</Label><Input value={telefono} onChange={setTelefono} type="tel" /></div>
      </div>
      <ModalFooter saving={saving} disabled={!nombre.trim()} onCancel={onCancel} onSave={handleSave} label="Crear Cliente" />
    </div>
  );
}

// ── FleteroQuickForm ──────────────────────────────────────────────────────────
export function FleteroQuickForm({
  initialName,
  onSuccess,
  onCancel,
}: {
  initialName: string;
  onSuccess: (f: Fletero) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initialName);
  const [precio, setPrecio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase
      .from('Fleteros')
      .insert({ nombre: nombre.trim(), precio_por_kg: precio ? parseFloat(precio) : null, activo: true })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    onSuccess(data as Fletero);
  }

  return (
    <div className="space-y-4 px-6 py-5">
      {error && <ErrorMsg msg={error} />}
      <div>
        <Label>Nombre *</Label>
        <Input value={nombre} onChange={setNombre} placeholder="Ej: Transporte Pérez" required />
      </div>
      <div>
        <Label>Precio por kg ($/kg)</Label>
        <Input value={precio} onChange={setPrecio} type="number" placeholder="0.00" />
      </div>
      <ModalFooter saving={saving} disabled={!nombre.trim()} onCancel={onCancel} onSave={handleSave} label="Crear Fletero" />
    </div>
  );
}

// ── ProductoQuickForm ─────────────────────────────────────────────────────────
export function ProductoQuickForm({
  initialName,
  onSuccess,
  onCancel,
}: {
  initialName: string;
  onSuccess: (p: Producto) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initialName);
  const [precioCompra, setPrecioCompra] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase
      .from('Productos')
      .insert({
        nombre: nombre.trim(),
        precio_compra_kg: precioCompra ? parseFloat(precioCompra) : null,
        precio_venta_kg: precioVenta ? parseFloat(precioVenta) : null,
        activo: true,
      })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    onSuccess(data as Producto);
  }

  return (
    <div className="space-y-4 px-6 py-5">
      {error && <ErrorMsg msg={error} />}
      <div>
        <Label>Nombre *</Label>
        <Input value={nombre} onChange={setNombre} placeholder="Ej: Naranja Valencia" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Precio compra ($/kg)</Label><Input value={precioCompra} onChange={setPrecioCompra} type="number" placeholder="0.00" /></div>
        <div><Label>Precio venta ($/kg)</Label><Input value={precioVenta} onChange={setPrecioVenta} type="number" placeholder="0.00" /></div>
      </div>
      <ModalFooter saving={saving} disabled={!nombre.trim()} onCancel={onCancel} onSave={handleSave} label="Crear Producto" />
    </div>
  );
}

// ── EnvaseQuickForm ───────────────────────────────────────────────────────────
export function EnvaseQuickForm({
  initialName,
  onSuccess,
  onCancel,
}: {
  initialName: string;
  onSuccess: (e: Envase) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initialName);
  const [taraKg, setTaraKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!taraKg || parseFloat(taraKg) <= 0) { setError('La tara debe ser mayor a 0 kg.'); return; }
    setSaving(true);
    setError('');
    const { data, error: err } = await supabase
      .from('Envases')
      .insert({ nombre: nombre.trim(), tara_kg: parseFloat(taraKg), activo: true })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    onSuccess(data as Envase);
  }

  return (
    <div className="space-y-4 px-6 py-5">
      {error && <ErrorMsg msg={error} />}
      <div>
        <Label>Nombre *</Label>
        <Input value={nombre} onChange={setNombre} placeholder="Ej: Bin de madera, Bin plástico" required />
      </div>
      <div>
        <Label>Tara (kg) *</Label>
        <Input value={taraKg} onChange={setTaraKg} type="number" placeholder="Ej: 25" />
        <p className="mt-1 text-xs text-gray-400">Peso del envase vacío. Se descuenta del peso bruto.</p>
      </div>
      <ModalFooter saving={saving} disabled={!nombre.trim() || !taraKg} onCancel={onCancel} onSave={handleSave} label="Crear Envase" />
    </div>
  );
}
