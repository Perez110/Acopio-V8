'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote, Building2, Wallet, Plus, Pencil, CheckCircle,
  AlertCircle, Power, PowerOff, TrendingUp, TrendingDown, Scale,
  ArrowLeftRight, Loader2, List,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import type { CuentaFinanciera } from '@/types/database';
import { registrarMovimientoInterno, getHistorialCuenta, type MovimientoHistorialItem } from '@/app/cajas-bancos/actions';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface CuentaConSaldo extends CuentaFinanciera {
  ingresos: number;
  egresos: number;
  saldoActual: number;
}

interface Props {
  cuentas: CuentaConSaldo[];
  totalSaldo: number;
  totalIngresos: number;
  totalEgresos: number;
}

type TipoCuenta = 'Efectivo' | 'Banco' | 'Otro';
type TipoOperacion = 'TRANSFERENCIA' | 'GASTO' | 'INGRESO_EXTRA' | 'RETIRO_SOCIO';

interface FormValues {
  nombre: string;
  tipo: TipoCuenta;
  saldo_inicial: string;
}

interface MovFormValues {
  tipo_operacion: TipoOperacion;
  cuenta_origen_id: string;
  cuenta_destino_id: string;
  monto: string;
  descripcion: string;
}

const TIPO_OP_LABELS: Record<TipoOperacion, string> = {
  TRANSFERENCIA: 'Transferencia entre cuentas',
  GASTO:         'Gasto operativo (Luz, Internet, etc.)',
  INGRESO_EXTRA: 'Ingreso extra / Aporte de capital',
  RETIRO_SOCIO:  'Retiro de socio (Ganancias)',
};

function emptyForm(): FormValues {
  return { nombre: '', tipo: 'Efectivo', saldo_inicial: '0' };
}

function emptyMovForm(): MovFormValues {
  return { tipo_operacion: 'TRANSFERENCIA', cuenta_origen_id: '', cuenta_destino_id: '', monto: '', descripcion: '' };
}

function toForm(c: CuentaFinanciera): FormValues {
  return {
    nombre: c.nombre ?? '',
    tipo: (c.tipo as TipoCuenta) ?? 'Efectivo',
    saldo_inicial: c.saldo_inicial != null ? String(c.saldo_inicial) : '0',
  };
}

// ── Helpers de presentación ────────────────────────────────────────────────────
function fmtMoneda(n: number) {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TipoIcon({ tipo, size = 'md' }: { tipo: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' }[size];
  if (tipo === 'Banco') return <Building2 className={sz} />;
  if (tipo === 'Efectivo') return <Banknote className={sz} />;
  return <Wallet className={sz} />;
}

function tipoBg(tipo: string | null) {
  if (tipo === 'Banco') return 'bg-blue-100 text-blue-700';
  if (tipo === 'Efectivo') return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-600';
}

function tipoIconBg(tipo: string | null) {
  if (tipo === 'Banco') return 'bg-blue-50 text-blue-600';
  if (tipo === 'Efectivo') return 'bg-green-50 text-green-600';
  return 'bg-gray-50 text-gray-600';
}

function StatCard({
  label, value, icon: Icon, color,
}: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CajasBancosClient({
  cuentas: initCuentas,
  totalSaldo,
  totalIngresos,
  totalEgresos,
}: Props) {
  const router = useRouter();

  // ── Estado: gestión de cuentas ─────────────────────────────────────────────
  const [cuentas, setCuentas] = useState(initCuentas);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Estado: movimiento interno ─────────────────────────────────────────────
  const [movModalOpen, setMovModalOpen] = useState(false);
  const [movForm, setMovForm] = useState<MovFormValues>(emptyMovForm());
  const [movSaving, setMovSaving] = useState(false);
  const [movError, setMovError] = useState('');

  // ── Estado: historial / conciliación ─────────────────────────────────────
  const [historialModalOpen, setHistorialModalOpen] = useState(false);
  const [historialCuentaId, setHistorialCuentaId] = useState<number | null>(null);
  const [historialCuentaNombre, setHistorialCuentaNombre] = useState('');
  const [historialDesde, setHistorialDesde] = useState('');
  const [historialHasta, setHistorialHasta] = useState('');
  const [historialItems, setHistorialItems] = useState<MovimientoHistorialItem[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState('');

  // Sincronizar estado local con datos del servidor cuando cambian (p. ej. tras router.refresh())
  useEffect(() => {
    setCuentas(initCuentas);
  }, [initCuentas]);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }

  function setField<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function setMovField<K extends keyof MovFormValues>(key: K, val: MovFormValues[K]) {
    setMovForm(f => ({ ...f, [key]: val }));
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(c: CuentaConSaldo) {
    setEditId(c.id);
    setForm(toForm(c));
    setFormError('');
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditId(null); }

  function openMovModal() {
    setMovForm(emptyMovForm());
    setMovError('');
    setMovModalOpen(true);
  }

  function getDefaultRangoMes(): { desde: string; hasta: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${d}` };
  }

  function openHistorialModal(cuenta: CuentaConSaldo) {
    const { desde, hasta } = getDefaultRangoMes();
    setHistorialCuentaId(cuenta.id);
    setHistorialCuentaNombre(cuenta.nombre ?? '');
    setHistorialDesde(desde);
    setHistorialHasta(hasta);
    setHistorialItems([]);
    setHistorialError('');
    setHistorialModalOpen(true);
  }

  async function handleHistorialBuscar() {
    if (historialCuentaId == null) return;
    setHistorialLoading(true);
    setHistorialError('');
    const { data, error } = await getHistorialCuenta(historialCuentaId, historialDesde, historialHasta);
    setHistorialLoading(false);
    if (error) {
      setHistorialError(error);
      if (error.includes('31 días')) showToast('error', error);
      return;
    }
    setHistorialItems(data ?? []);
  }

  // ── Submit movimiento interno ──────────────────────────────────────────────
  async function handleMovSubmit() {
    const monto = parseFloat(movForm.monto);
    if (!monto || monto <= 0) { setMovError('El monto debe ser mayor a cero.'); return; }
    if (!movForm.descripcion.trim()) { setMovError('La descripción es obligatoria.'); return; }

    const needsOrigen  = ['TRANSFERENCIA', 'GASTO', 'RETIRO_SOCIO'].includes(movForm.tipo_operacion);
    const needsDestino = ['TRANSFERENCIA', 'INGRESO_EXTRA'].includes(movForm.tipo_operacion);

    if (needsOrigen  && !movForm.cuenta_origen_id)  { setMovError('Seleccioná la cuenta de origen.');  return; }
    if (needsDestino && !movForm.cuenta_destino_id) { setMovError('Seleccioná la cuenta de destino.'); return; }
    if (
      movForm.tipo_operacion === 'TRANSFERENCIA' &&
      movForm.cuenta_origen_id === movForm.cuenta_destino_id
    ) {
      setMovError('La cuenta origen y destino no pueden ser la misma.'); return;
    }

    setMovSaving(true);
    setMovError('');

    const { error } = await registrarMovimientoInterno({
      tipo_operacion:    movForm.tipo_operacion,
      cuenta_origen_id:  movForm.cuenta_origen_id  ? Number(movForm.cuenta_origen_id)  : null,
      cuenta_destino_id: movForm.cuenta_destino_id ? Number(movForm.cuenta_destino_id) : null,
      monto,
      descripcion: movForm.descripcion.trim(),
    });

    setMovSaving(false);
    if (error) {
      setMovError(error);
      showToast('error', error);
      return;
    }

    showToast('success', 'Movimiento interno registrado correctamente.');
    setMovModalOpen(false);
    router.refresh();
  }

  // ── Guardar cuenta ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return; }
    setSaving(true);
    setFormError('');

    const payload = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      saldo_inicial: parseFloat(form.saldo_inicial) || 0,
      activo: true,
    };

    if (editId === null) {
      const { data, error } = await supabase
        .from('Cuentas_Financieras')
        .insert(payload)
        .select()
        .single();

      if (error) { setFormError(error.message); setSaving(false); return; }
      // Nueva cuenta sin movimientos → saldo actual = saldo inicial
      const nueva: CuentaConSaldo = {
        ...(data as CuentaFinanciera),
        ingresos: 0,
        egresos: 0,
        saldoActual: payload.saldo_inicial,
      };
      setCuentas(prev => [...prev, nueva].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '')));
      showToast('success', `Cuenta "${nueva.nombre}" creada correctamente.`);
    } else {
      const { data, error } = await supabase
        .from('Cuentas_Financieras')
        .update(payload)
        .eq('id', editId)
        .select()
        .single();

      if (error) { setFormError(error.message); setSaving(false); return; }
      const updated = data as CuentaFinanciera;
      setCuentas(prev => prev.map(c => {
        if (c.id !== editId) return c;
        return {
          ...c,
          ...updated,
          // Recalcular saldo con el nuevo saldo_inicial
          saldoActual: (updated.saldo_inicial ?? 0) + c.ingresos - c.egresos,
        };
      }));
      showToast('success', `Cuenta "${updated.nombre}" actualizada.`);
    }
    setSaving(false);
    closeModal();
  }

  // ── Toggle activo ──────────────────────────────────────────────────────────
  async function toggleActivo(c: CuentaConSaldo) {
    const { data, error } = await supabase
      .from('Cuentas_Financieras')
      .update({ activo: !c.activo })
      .eq('id', c.id)
      .select()
      .single();
    if (error) { showToast('error', error.message); return; }
    setCuentas(prev => prev.map(x =>
      x.id === c.id ? { ...x, ...(data as CuentaFinanciera) } : x
    ));
  }

  const cuentasActivas = cuentas.filter(c => c.activo !== false);
  const cuentasInactivas = cuentas.filter(c => c.activo === false);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Resumen global ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Saldo Total"
          value={fmtMoneda(cuentas.filter(c => c.activo !== false).reduce((s, c) => s + c.saldoActual, 0))}
          icon={Scale}
          color="bg-slate-100 text-slate-600"
        />
        <StatCard label="Ingresos Totales" value={fmtMoneda(totalIngresos)} icon={TrendingUp} color="bg-emerald-100 text-emerald-700" />
        <StatCard label="Egresos Totales" value={fmtMoneda(totalEgresos)} icon={TrendingDown} color="bg-red-100 text-red-700" />
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Cuentas Activas
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {cuentasActivas.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={openMovModal}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <ArrowLeftRight className="h-4 w-4 text-slate-500" />
            Mov. Interno
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            Nueva Cuenta
          </button>
        </div>
      </div>

      {/* ── Cards de cuentas ─────────────────────────────────────────────── */}
      {cuentasActivas.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50">
            <Wallet className="h-7 w-7 text-purple-300" />
          </div>
          <p className="font-medium text-gray-500">Sin cuentas registradas</p>
          <p className="mt-1 text-sm text-gray-400">Creá tu primera cuenta con el botón &quot;Nueva Cuenta&quot;</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cuentasActivas.map(c => (
          <AccountCard
            key={c.id}
            cuenta={c}
            onEdit={() => openEdit(c)}
            onToggle={() => toggleActivo(c)}
            onVerHistorial={() => openHistorialModal(c)}
          />
        ))}
      </div>

      {/* ── Cuentas inactivas ─────────────────────────────────────────────── */}
      {cuentasInactivas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600">
              <span className="text-xs">▶</span>
              Cuentas inactivas ({cuentasInactivas.length})
            </div>
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
            {cuentasInactivas.map(c => (
              <AccountCard key={c.id} cuenta={c} onEdit={() => openEdit(c)} onToggle={() => toggleActivo(c)} />
            ))}
          </div>
        </details>
      )}

      {/* ── Modal: Movimiento Interno ─────────────────────────────────────── */}
      <Modal
        open={movModalOpen}
        onClose={() => { if (!movSaving) setMovModalOpen(false); }}
        title="Nuevo Movimiento Interno"
        subtitle="Transferencias, gastos, aportes y retiros entre cuentas propias"
        size="md"
      >
        <div className="space-y-4 px-6 py-5">
          {/* Error inline */}
          {movError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {movError}
            </div>
          )}

          {/* Tipo de operación */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tipo de Operación <span className="text-red-400">*</span>
            </label>
            <select
              value={movForm.tipo_operacion}
              onChange={e => {
                setMovField('tipo_operacion', e.target.value as TipoOperacion);
                setMovField('cuenta_origen_id', '');
                setMovField('cuenta_destino_id', '');
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              {(Object.entries(TIPO_OP_LABELS) as [TipoOperacion, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Cuenta Origen — visible en TRANSFERENCIA, GASTO, RETIRO_SOCIO */}
          {['TRANSFERENCIA', 'GASTO', 'RETIRO_SOCIO'].includes(movForm.tipo_operacion) && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cuenta Origen <span className="text-red-400">*</span>
                <span className="ml-1 font-normal normal-case text-slate-400">(de dónde sale el dinero)</span>
              </label>
              <select
                value={movForm.cuenta_origen_id}
                onChange={e => setMovField('cuenta_origen_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
              >
                <option value="">— Seleccioná una cuenta —</option>
                {cuentas.filter(c => c.activo !== false).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({fmtMoneda(c.saldoActual)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cuenta Destino — visible en TRANSFERENCIA, INGRESO_EXTRA */}
          {['TRANSFERENCIA', 'INGRESO_EXTRA'].includes(movForm.tipo_operacion) && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Cuenta Destino <span className="text-red-400">*</span>
                <span className="ml-1 font-normal normal-case text-slate-400">(a dónde entra el dinero)</span>
              </label>
              <select
                value={movForm.cuenta_destino_id}
                onChange={e => setMovField('cuenta_destino_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
              >
                <option value="">— Seleccioná una cuenta —</option>
                {cuentas
                  .filter(c => c.activo !== false && String(c.id) !== movForm.cuenta_origen_id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({fmtMoneda(c.saldoActual)})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Monto */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Monto ($) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={movForm.monto}
              onChange={e => setMovField('monto', e.target.value)}
              placeholder="0,00"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Descripción <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={movForm.descripcion}
              onChange={e => setMovField('descripcion', e.target.value)}
              placeholder={
                movForm.tipo_operacion === 'GASTO'        ? 'Ej: Factura de luz de enero' :
                movForm.tipo_operacion === 'RETIRO_SOCIO' ? 'Ej: Retiro ganancias - Enero 2026' :
                movForm.tipo_operacion === 'INGRESO_EXTRA'? 'Ej: Aporte de capital socio' :
                'Ej: Transferencia Caja → Banco Galicia'
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={() => setMovModalOpen(false)}
            disabled={movSaving}
            className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleMovSubmit}
            disabled={movSaving}
            className="flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {movSaving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ArrowLeftRight className="h-4 w-4" />}
            {movSaving ? 'Registrando…' : 'Registrar Movimiento'}
          </button>
        </div>
      </Modal>

      {/* ── Modal Conciliación: Historial de cuenta ─────────────────────────── */}
      <Modal
        open={historialModalOpen}
        onClose={() => { if (!historialLoading) setHistorialModalOpen(false); }}
        title="Conciliación bancaria"
        subtitle={historialCuentaId != null ? `Historial: ${historialCuentaNombre}` : undefined}
        size="xl"
      >
        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Desde</label>
              <input
                type="date"
                value={historialDesde}
                onChange={e => setHistorialDesde(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">Hasta</label>
              <input
                type="date"
                value={historialHasta}
                onChange={e => setHistorialHasta(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
              />
            </div>
          </div>
          {historialError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {historialError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleHistorialBuscar}
              disabled={historialLoading}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {historialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <List className="h-4 w-4" />}
              {historialLoading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {historialItems.length > 0 && (
            <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Concepto</th>
                    <th className="px-4 py-3 text-center">Tipo</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historialItems.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">{it.fecha}</td>
                      <td className="min-w-[12rem] break-words px-4 py-2.5 text-slate-900">{it.concepto}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={
                          it.tipo === 'INGRESO' ? 'text-green-600 font-medium' :
                          it.tipo === 'EGRESO' ? 'text-red-600 font-medium' :
                          'text-amber-600 font-medium'
                        }>
                          {it.tipo === 'EN_CLEARING' ? 'EN CLEARING' : it.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {it.tipo === 'EN_CLEARING' ? '+' : it.tipo === 'INGRESO' ? '+' : '−'}${Math.abs(it.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!historialLoading && historialItems.length === 0 && historialCuentaId != null && historialError === '' && (
            <p className="text-center text-sm text-slate-500">Elegí un rango y hacé clic en Buscar para ver el historial.</p>
          )}
        </div>
      </Modal>

      {/* ── Modal Nueva / Editar Cuenta ───────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editId ? 'Editar Cuenta' : 'Nueva Cuenta Financiera'}
        subtitle={editId ? undefined : 'Caja, banco o cualquier cuenta donde se registren movimientos'}
        size="sm"
      >
        <div className="space-y-4 px-6 py-5">
          {formError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {formError}
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Nombre <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setField('nombre', e.target.value)}
              placeholder="Ej: Caja Chica, Banco Galicia..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Tipo de Cuenta
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Efectivo', 'Banco', 'Otro'] as TipoCuenta[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField('tipo', t)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-all ${
                    form.tipo === t
                      ? 'border-green-300 bg-green-50 text-green-700 ring-2 ring-green-100'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <TipoIcon tipo={t} size="sm" />
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Saldo Inicial */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Saldo Inicial ($)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.saldo_inicial}
              onChange={e => setField('saldo_inicial', e.target.value)}
              placeholder="0,00"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              El saldo real se calcula sumando los movimientos registrados.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={closeModal}
            disabled={saving}
            className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.nombre.trim()}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <CheckCircle className="h-4 w-4" />}
            {editId ? 'Guardar Cambios' : 'Crear Cuenta'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ── AccountCard ────────────────────────────────────────────────────────────────
function AccountCard({
  cuenta, onEdit, onToggle, onVerHistorial,
}: { cuenta: CuentaConSaldo; onEdit: () => void; onToggle: () => void; onVerHistorial?: () => void }) {
  const isPositive = cuenta.saldoActual >= 0;

  return (
    <div className="group flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Header de la tarjeta */}
      <div className="flex items-start justify-between p-5 pb-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tipoIconBg(cuenta.tipo)}`}>
            <TipoIcon tipo={cuenta.tipo} size="md" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{cuenta.nombre ?? '—'}</p>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tipoBg(cuenta.tipo)}`}>
              {cuenta.tipo ?? 'Sin tipo'}
            </span>
          </div>
        </div>
        {/* Acciones (visibles al hover) */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onVerHistorial && (
            <button onClick={onVerHistorial} title="Ver Historial" className="rounded-lg p-1.5 text-gray-400 hover:bg-purple-50 hover:text-purple-600">
              <List className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onEdit} title="Editar" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onToggle} title={cuenta.activo ? 'Desactivar' : 'Activar'}
            className={`rounded-lg p-1.5 ${cuenta.activo ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}>
            {cuenta.activo ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Saldo actual - protagonista */}
      <div className="px-5 pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Saldo Actual</p>
        <p className={`text-3xl font-bold tracking-tight ${isPositive ? 'text-gray-900' : 'text-red-600'}`}>
          {isPositive ? '' : '-'}{`$${Math.abs(cuenta.saldoActual).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </p>
      </div>

      {/* Desglose */}
      <div className="mt-auto border-t border-gray-50 px-5 py-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-gray-400">Inicial</p>
            <p className="font-mono font-medium text-gray-600">
              ${(cuenta.saldo_inicial ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-green-500">Ingresos</p>
            <p className="font-mono font-medium text-green-600">
              +${cuenta.ingresos.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-red-400">Egresos</p>
            <p className="font-mono font-medium text-red-500">
              −${cuenta.egresos.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        {onVerHistorial && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <button
              type="button"
              onClick={onVerHistorial}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <List className="h-3.5 w-3.5" />
              Ver Historial
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
