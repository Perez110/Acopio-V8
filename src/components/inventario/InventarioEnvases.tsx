'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  History,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { ajustarStockEnvase, deleteAjusteEnvase, type TipoAjuste } from '@/app/inventario/actions';

// ── Tipos exportados ──────────────────────────────────────────────────────────
export interface EnvaseConStock {
  id: number;
  nombre: string | null;
  tara_kg: number | null;
  vacios: number;
  ocupados: number;
}

export interface AjusteHistorial {
  id: number;
  fecha_movimiento: string | null;
  envase_id: number | null;
  envase_nombre: string;
  tipo_movimiento: string;
  cantidad: number | null;
  notas: string | null;
}

interface Props {
  envasesConStock: EnvaseConStock[];
  historialAjustes: AjusteHistorial[];
  totalVacios: number;
  totalOcupados: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

/** Extrae el motivo del string "Motivo: X | notas" o "Motivo: X" */
function parseMotivoNotas(raw: string | null): { motivo: string; notas: string } {
  if (!raw) return { motivo: '—', notas: '' };
  if (raw.startsWith('Motivo: ')) {
    const rest = raw.slice(8);
    const pipeIdx = rest.indexOf(' | ');
    if (pipeIdx >= 0) return { motivo: rest.slice(0, pipeIdx), notas: rest.slice(pipeIdx + 3) };
    return { motivo: rest, notas: '' };
  }
  return { motivo: raw, notas: '' };
}

// ── Estado del modal de ajuste ────────────────────────────────────────────────
interface AdjustModal {
  envaseId: number;
  envaseNombre: string;
  tipoAjuste: TipoAjuste;
  stockActual: number;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function InventarioEnvases({
  envasesConStock,
  historialAjustes: historialInicial,
  totalVacios,
  totalOcupados,
}: Props) {
  const router = useRouter();

  // Modal de ajuste
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null);
  const [nuevoStock, setNuevoStock] = useState('');
  const [motivo, setMotivo] = useState('');
  const [notasAjuste, setNotasAjuste] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal historial
  const [historialOpen, setHistorialOpen] = useState(false);
  const [historial, setHistorial] = useState<AjusteHistorial[]>(historialInicial);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Abrir modal de ajuste ─────────────────────────────────────────────────
  function openAdjust(e: EnvaseConStock, tipoAjuste: TipoAjuste) {
    const stockActual = tipoAjuste === 'AJUSTE_VACIO' ? e.vacios : e.ocupados;
    setAdjustModal({
      envaseId: e.id,
      envaseNombre: e.nombre ?? '—',
      tipoAjuste,
      stockActual,
    });
    setNuevoStock(String(stockActual));
    setMotivo('');
    setNotasAjuste('');
  }

  function closeAdjust() {
    setAdjustModal(null);
    setNuevoStock('');
    setMotivo('');
    setNotasAjuste('');
  }

  // ── Guardar ajuste ────────────────────────────────────────────────────────
  async function handleGuardarAjuste() {
    if (!adjustModal) return;
    if (!motivo.trim()) {
      showToast('error', 'El motivo del ajuste es requerido.');
      return;
    }
    const nuevoNum = parseFloat(nuevoStock);
    if (isNaN(nuevoNum) || nuevoNum < 0) {
      showToast('error', 'El nuevo stock debe ser un número mayor o igual a cero.');
      return;
    }

    setSaving(true);
    const { error } = await ajustarStockEnvase({
      envaseId: adjustModal.envaseId,
      tipoAjuste: adjustModal.tipoAjuste,
      stockActual: adjustModal.stockActual,
      nuevoStock: nuevoNum,
      motivo: motivo.trim(),
      notas: notasAjuste.trim() || undefined,
    });

    if (error) {
      showToast('error', `Error al guardar: ${error}`);
      setSaving(false);
      return;
    }

    const diff = nuevoNum - adjustModal.stockActual;
    const tipoLabel = adjustModal.tipoAjuste === 'AJUSTE_VACIO' ? 'Vacíos' : 'Ocupados';
    showToast(
      'success',
      `Ajuste guardado: ${tipoLabel} de ${adjustModal.envaseNombre} → ${diff >= 0 ? '+' : ''}${diff} unidades`
    );

    // Agregar al historial local
    const newEntry: AjusteHistorial = {
      id: Date.now(), // temporal hasta router.refresh
      fecha_movimiento: new Date().toISOString().split('T')[0],
      envase_id: adjustModal.envaseId,
      envase_nombre: adjustModal.envaseNombre,
      tipo_movimiento: adjustModal.tipoAjuste,
      cantidad: diff,
      notas: notasAjuste.trim()
        ? `Motivo: ${motivo.trim()} | ${notasAjuste.trim()}`
        : `Motivo: ${motivo.trim()}`,
    };
    setHistorial(prev => [newEntry, ...prev]);

    closeAdjust();
    setSaving(false);
    router.refresh(); // recalcula el stock en el Server Component
  }

  // ── Eliminar ajuste ───────────────────────────────────────────────────────
  async function handleDeleteAjuste(id: number) {
    const confirmed = window.confirm(
      '¿Eliminar este ajuste? El stock volverá al valor anterior.'
    );
    if (!confirmed) return;

    setDeletingId(id);
    const { error } = await deleteAjusteEnvase(id);

    if (error) {
      showToast('error', `Error al eliminar: ${error}`);
    } else {
      setHistorial(prev => prev.filter(h => h.id !== id));
      showToast('success', 'Ajuste eliminado. El stock se recalculó.');
      router.refresh();
    }
    setDeletingId(null);
  }

  // ── Derivados del modal de ajuste ─────────────────────────────────────────
  const nuevoStockNum = parseFloat(nuevoStock) || 0;
  const diff = adjustModal ? nuevoStockNum - adjustModal.stockActual : 0;
  const diffLabel =
    diff === 0 ? 'Sin cambio' : diff > 0 ? `+${diff} unidades` : `${diff} unidades`;
  const diffColor =
    diff === 0 ? 'text-gray-500' : diff > 0 ? 'text-green-600' : 'text-red-600';

  const tipoLabel = adjustModal?.tipoAjuste === 'AJUSTE_VACIO' ? 'Vacíos' : 'Ocupados';
  const tipoColor = adjustModal?.tipoAjuste === 'AJUSTE_VACIO' ? 'green' : 'orange';

  return (
    <div className="mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      {/* Toast global */}
      {toast && (
        <div
          className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
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
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Control de Envases</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Stock calculado en tiempo real</span>
          <button
            onClick={() => setHistorialOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            <History className="h-3.5 w-3.5" />
            Ver Historial de Ajustes
            {historial.length > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                {historial.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Resumen vacíos / ocupados */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border border-green-100 bg-green-50 p-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-100">
            <Package className="h-5 w-5 text-green-600" />
          </span>
          <div>
            <p className="text-xs text-gray-500">Total Envases Vacíos</p>
            <p className="text-2xl font-bold text-green-700">{totalVacios}</p>
            <p className="text-xs text-green-600">Disponibles para entregar</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-orange-100 bg-orange-50 p-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100">
            <Package className="h-5 w-5 text-orange-600" />
          </span>
          <div>
            <p className="text-xs text-gray-500">Total Envases Ocupados</p>
            <p className="text-2xl font-bold text-orange-700">{totalOcupados}</p>
            <p className="text-xs text-orange-600">Con fruta almacenada</p>
          </div>
        </div>
      </div>

      {/* Tabla de envases */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-5 py-3 text-left">Tipo de Envase</th>
              <th className="px-5 py-3 text-center">Tara</th>
              <th className="px-5 py-3 text-right text-green-700">Vacíos</th>
              <th className="px-5 py-3 text-right text-orange-600">Ocupados</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-center">Ajuste Manual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {envasesConStock.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-gray-400">
                  No hay envases registrados
                </td>
              </tr>
            ) : (
              envasesConStock.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/70">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base text-gray-400">⬡</span>
                      <span className="font-medium text-gray-800">{e.nombre}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-xs text-gray-400">
                    {e.tara_kg != null ? `${e.tara_kg} kg` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-green-600">
                    {e.vacios}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-orange-500">
                    {e.ocupados}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">
                    {e.vacios + e.ocupados}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openAdjust(e, 'AJUSTE_VACIO')}
                        className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                      >
                        <Pencil className="h-3 w-3" />
                        Vacíos
                      </button>
                      <button
                        onClick={() => openAdjust(e, 'AJUSTE_OCUPADO')}
                        className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100"
                      >
                        <Pencil className="h-3 w-3" />
                        Ocupados
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Ajuste Manual                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeAdjust}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="font-semibold text-gray-900">Ajuste Manual de Stock</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {adjustModal.envaseNombre} ·{' '}
                  <span
                    className={`font-medium ${
                      tipoColor === 'green' ? 'text-green-600' : 'text-orange-600'
                    }`}
                  >
                    {tipoLabel}
                  </span>
                </p>
              </div>
              <button
                onClick={closeAdjust}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {/* Stock actual (readonly) */}
              <div className="flex items-center gap-4 rounded-xl bg-gray-50 px-4 py-3">
                <div className="flex-1">
                  <p className="text-xs text-gray-400">Stock actual ({tipoLabel})</p>
                  <p
                    className={`text-2xl font-bold ${
                      tipoColor === 'green' ? 'text-green-600' : 'text-orange-600'
                    }`}
                  >
                    {adjustModal.stockActual}
                  </p>
                </div>
                <div className="text-gray-300">→</div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400">Diferencia</p>
                  <p className={`text-xl font-bold ${diffColor}`}>{diffLabel}</p>
                </div>
              </div>

              {/* Nuevo Stock */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Nuevo Stock <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={nuevoStock}
                  onChange={e => setNuevoStock(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Ingresá el stock real"
                  autoFocus
                />
              </div>

              {/* Motivo */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Motivo del ajuste <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Conteo físico, Bin roto, Corrección de error…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Notas opcionales */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Notas adicionales{' '}
                  <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={notasAjuste}
                  onChange={e => setNotasAjuste(e.target.value)}
                  rows={2}
                  placeholder="Observaciones del conteo, responsable, etc."
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={closeAdjust}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarAjuste}
                disabled={saving || !motivo.trim() || nuevoStock === ''}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                {saving ? 'Guardando…' : 'Guardar Ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: Historial de Ajustes                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {historialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHistorialOpen(false)}
          />
          <div className="relative flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="font-semibold text-gray-900">Historial de Ajustes Manuales</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {historial.length} ajuste{historial.length !== 1 ? 's' : ''} registrado
                  {historial.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setHistorialOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabla */}
            <div className="max-h-[60vh] overflow-y-auto">
              {historial.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <History className="mb-3 h-10 w-10 text-gray-200" />
                  <p className="text-sm font-semibold text-gray-600">Sin ajustes registrados</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Los ajustes manuales aparecerán aquí.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-5 py-3 text-left">Fecha</th>
                      <th className="px-5 py-3 text-left">Envase</th>
                      <th className="px-5 py-3 text-center">Tipo</th>
                      <th className="px-5 py-3 text-left">Motivo</th>
                      <th className="px-5 py-3 text-right">Diferencia</th>
                      <th className="px-5 py-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historial.map(h => {
                      const { motivo: m, notas: n } = parseMotivoNotas(h.notas);
                      const esVacio = h.tipo_movimiento === 'AJUSTE_VACIO';
                      const cant = h.cantidad ?? 0;
                      const isDeleting = deletingId === h.id;

                      return (
                        <tr
                          key={h.id}
                          className={`transition-opacity hover:bg-gray-50 ${isDeleting ? 'opacity-40' : ''}`}
                        >
                          <td className="px-5 py-3 text-xs text-gray-500">
                            {fmtDate(h.fecha_movimiento)}
                          </td>
                          <td className="px-5 py-3 font-medium text-gray-800">
                            {h.envase_nombre}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                esVacio
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {esVacio ? 'Vacíos' : 'Ocupados'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <p className="text-xs font-medium text-gray-700">{m}</p>
                            {n && <p className="text-xs text-gray-400">{n}</p>}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span
                              className={`font-mono text-sm font-semibold ${
                                cant > 0
                                  ? 'text-green-600'
                                  : cant < 0
                                  ? 'text-red-600'
                                  : 'text-gray-400'
                              }`}
                            >
                              {cant > 0 ? '+' : ''}
                              {cant}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <button
                              onClick={() => handleDeleteAjuste(h.id)}
                              disabled={isDeleting || deletingId !== null}
                              title="Revertir ajuste"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 mx-auto"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setHistorialOpen(false)}
                className="w-full rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
