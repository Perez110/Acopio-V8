'use client';

import { useState, useRef } from 'react';
import { Plus, Trash2, CheckCircle, AlertCircle, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { insertarMovimientosEnvases } from '@/app/inventario/actions';

// ── Tipos ────────────────────────────────────────────────────────────────────
interface MovimientoLocal {
  _id: string;
  envase_id: number;
  envase_nombre: string;
  cantidad_ingreso: number; // vacíos devueltos → suma stock
  cantidad_salida: number;  // vacíos entregados → resta stock
}

type TipoEntidad = 'proveedor' | 'cliente';
type Toast = { type: 'success' | 'error'; msg: string };

// ── Props desde Server Component ─────────────────────────────────────────────
interface Props {
  proveedores: { id: number; nombre: string | null }[];
  clientes: { id: number; nombre: string | null }[];
  fleteros: { id: number; nombre: string | null }[];
  envases: { id: number; nombre: string | null }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// ── Componente ───────────────────────────────────────────────────────────────
export default function FormMovEnvases({ proveedores, clientes, fleteros, envases }: Props) {
  // Encabezado
  const [fecha, setFecha] = useState(nowLocal);
  const [tipoEntidad, setTipoEntidad] = useState<TipoEntidad>('proveedor');
  const [proveedorId, setProveedorId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [fleteroId, setFleteroId] = useState('');

  // Formulario de movimiento
  const [envaseId, setEnvaseId] = useState('');
  const [cantIngreso, setCantIngreso] = useState<number | ''>(0);
  const [cantSalida, setCantSalida] = useState<number | ''>(0);

  // Lista local
  const [lista, setLista] = useState<MovimientoLocal[]>([]);

  // Estado de envío — debounce con ref para evitar doble submit
  const [submitting, setSubmitting] = useState(false);
  const lastSubmitRef = useRef<number>(0);
  const [toast, setToast] = useState<Toast | null>(null);

  // ── Agregar a lista ────────────────────────────────────────────────────────
  function handleAgregar() {
    const env = envases.find(e => e.id === Number(envaseId));
    if (!env) return;
    const ingreso = Number(cantIngreso || 0);
    const salida = Number(cantSalida || 0);
    if (ingreso === 0 && salida === 0) return;

    setLista(prev => [
      ...prev,
      {
        _id: crypto.randomUUID(),
        envase_id: env.id,
        envase_nombre: env.nombre ?? '',
        cantidad_ingreso: ingreso,
        cantidad_salida: salida,
      },
    ]);
    setEnvaseId('');
    setCantIngreso(0);
    setCantSalida(0);
  }

  // ── Registrar movimiento ───────────────────────────────────────────────────
  async function handleRegistrar() {
    // Debounce: no permitir re-envío en menos de 2 segundos
    const now = Date.now();
    if (submitting || now - lastSubmitRef.current < 2000) return;

    const entityId = tipoEntidad === 'proveedor' ? proveedorId : clienteId;
    if (!entityId || lista.length === 0) return;

    lastSubmitRef.current = now;
    setSubmitting(true);
    setToast(null);

    try {
      // Construir registros: cada ingreso y salida es un registro separado
      const registros = lista.flatMap(item => {
        const base = {
          fecha_movimiento: fecha.split('T')[0],
          envase_id: item.envase_id,
          remito_asociado: null,
          notas: null,
          proveedor_id: tipoEntidad === 'proveedor' ? Number(proveedorId) : null,
          cliente_id: tipoEntidad === 'cliente' ? Number(clienteId) : null,
          fletero_id: fleteroId ? Number(fleteroId) : null,
        };

        const rows = [];
        if (item.cantidad_ingreso > 0) {
          rows.push({ ...base, tipo_movimiento: 'INGRESO', cantidad: item.cantidad_ingreso });
        }
        if (item.cantidad_salida > 0) {
          rows.push({ ...base, tipo_movimiento: 'SALIDA', cantidad: item.cantidad_salida });
        }
        return rows;
      });

      const result = await insertarMovimientosEnvases(
        registros.map(r => ({
          fecha_movimiento: r.fecha_movimiento,
          tipo_movimiento: r.tipo_movimiento,
          envase_id: r.envase_id,
          cantidad: r.cantidad,
          proveedor_id: r.proveedor_id,
          cliente_id: r.cliente_id,
          fletero_id: r.fletero_id,
          remito_asociado: r.remito_asociado,
          notas: r.notas,
        }))
      );

      if (!result.success) {
        setToast({ type: 'error', msg: result.error ?? 'Error al registrar movimientos.' });
        setSubmitting(false);
        return;
      }

      const totalMov = registros.length;
      setToast({ type: 'success', msg: `✓ ${totalMov} movimiento(s) registrado(s) correctamente.` });
      setLista([]);
      setProveedorId('');
      setClienteId('');
      setFleteroId('');
      setFecha(nowLocal());
    } catch (err: unknown) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Error al registrar' });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Totales de lista ──────────────────────────────────────────────────────
  const totalIngreso = lista.reduce((s, m) => s + m.cantidad_ingreso, 0);
  const totalSalida = lista.reduce((s, m) => s + m.cantidad_salida, 0);

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
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Datos del Movimiento ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Datos del Movimiento</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Fecha */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Fecha y Hora</label>
            <input
              type="datetime-local"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Tipo de Entidad */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              Tipo de Entidad <span className="text-red-500">*</span>
            </label>
            <select
              value={tipoEntidad}
              onChange={e => { setTipoEntidad(e.target.value as TipoEntidad); setProveedorId(''); setClienteId(''); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            >
              <option value="proveedor">Proveedor</option>
              <option value="cliente">Cliente</option>
            </select>
          </div>

          {/* Proveedor o Cliente según tipo */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">
              {tipoEntidad === 'proveedor' ? 'Proveedor' : 'Cliente'}{' '}
              <span className="text-red-500">*</span>
            </label>
            {tipoEntidad === 'proveedor' ? (
              <select
                value={proveedorId}
                onChange={e => setProveedorId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
              >
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            ) : (
              <select
                value={clienteId}
                onChange={e => setClienteId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
              >
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
          </div>

          {/* Fletero */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Fletero (Opcional)</label>
            <select
              value={fleteroId}
              onChange={e => setFleteroId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            >
              <option value="">Seleccionar fletero...</option>
              {fleteros.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Nuevo Movimiento de Envase ────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <span>🔄</span> Nuevo Movimiento de Envase
        </h3>

        {/* Tipo de envase */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-500">Tipo de Envase</label>
          <select
            value={envaseId}
            onChange={e => setEnvaseId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
          >
            <option value="">Seleccionar envase...</option>
            {envases.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>

        {/* Ingreso / Salida — títulos y descripciones dinámicos según tipo de entidad */}
        {(() => {
          const esProveedor = tipoEntidad === 'proveedor';
          // PROVEEDOR: Caja 1 = Salida, Caja 2 = Ingreso. CLIENTE: Caja 1 = Ingreso, Caja 2 = Salida.
          const caja1 = esProveedor
            ? {
                tipo: 'salida' as const,
                titulo: 'Se le entrega vacíos',
                descripcion: 'El stock del sistema resta y el saldo del proveedor aumenta (deuda hacia el acopio).',
                valor: cantSalida,
                setValor: setCantSalida,
                color: 'orange',
              }
            : {
                tipo: 'ingreso' as const,
                titulo: 'Ingresan envases',
                descripcion: 'Provenientes del cliente, por lo tanto el stock del acopio aumenta en envases vacíos, y la deuda del acopio hacia el cliente aumenta.',
                valor: cantIngreso,
                setValor: setCantIngreso,
                color: 'green',
              };
          const caja2 = esProveedor
            ? {
                tipo: 'ingreso' as const,
                titulo: 'Devuelve vacíos',
                descripcion: 'El stock del acopio aumenta, y el saldo del proveedor disminuye.',
                valor: cantIngreso,
                setValor: setCantIngreso,
                color: 'green',
              }
            : {
                tipo: 'salida' as const,
                titulo: 'Devuelvo envases vacíos',
                descripcion: 'Se devuelven vacíos al cliente para saldar deuda. Resta al saldo de deuda y resta al inventario de envases vacíos del acopio.',
                valor: cantSalida,
                setValor: setCantSalida,
                color: 'orange',
              };
          const renderCaja = (c: typeof caja1) => (
            <div
              key={c.tipo}
              className={`rounded-xl border p-4 ${
                c.color === 'green'
                  ? 'border-green-100 bg-green-50/50'
                  : 'border-orange-100 bg-orange-50/50'
              }`}
            >
              <label
                className={`mb-2 flex items-center gap-2 text-xs font-semibold ${
                  c.color === 'green' ? 'text-green-700' : 'text-orange-700'
                }`}
              >
                {c.tipo === 'ingreso' ? (
                  <ArrowDownToLine className="h-4 w-4" />
                ) : (
                  <ArrowUpFromLine className="h-4 w-4" />
                )}
                {c.titulo}
              </label>
              <input
                type="number"
                min={0}
                value={c.valor}
                onChange={e => c.setValor(e.target.value === '' ? '' : Number(e.target.value))}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  c.color === 'green'
                    ? 'border-green-200 focus:border-green-400 focus:ring-green-100'
                    : 'border-orange-200 focus:border-orange-400 focus:ring-orange-100'
                }`}
              />
              <p className="mt-1.5 text-xs text-gray-500">{c.descripcion}</p>
            </div>
          );
          return (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderCaja(caja1)}
              {renderCaja(caja2)}
            </div>
          );
        })()}

        {/* Botón agregar */}
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleAgregar}
            disabled={!envaseId || (Number(cantIngreso || 0) === 0 && Number(cantSalida || 0) === 0)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar a Lista
          </button>
        </div>

        {/* Info box — dinámico según tipo de entidad */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
          <p className="font-semibold mb-1">🔄 Movimiento de Envases Vacíos</p>
          {tipoEntidad === 'proveedor' ? (
            <>
              <p><strong>Se le entrega vacíos:</strong> El stock del sistema resta y el saldo del proveedor aumenta (deuda hacia el acopio).</p>
              <p><strong>Devuelve vacíos:</strong> El stock del acopio aumenta y el saldo del proveedor disminuye.</p>
            </>
          ) : (
            <>
              <p><strong>Ingresan envases:</strong> Stock del acopio aumenta y la deuda del acopio hacia el cliente aumenta.</p>
              <p><strong>Devuelvo envases vacíos:</strong> Resta al saldo de deuda y al inventario de envases vacíos del acopio.</p>
            </>
          )}
          <p className="mt-1 text-blue-600">Los envases llenos (con fruta) se gestionan en Ingreso/Salida de Fruta.</p>
        </div>

        {/* Lista de movimientos */}
        {lista.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Envase</th>
                  <th className="px-4 py-3 text-right text-green-700">Ingreso</th>
                  <th className="px-4 py-3 text-right text-orange-600">Salida</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(item => (
                  <tr key={item._id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-medium">{item.envase_nombre}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">
                      {item.cantidad_ingreso > 0 ? `+${item.cantidad_ingreso}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-500">
                      {item.cantidad_salida > 0 ? `-${item.cantidad_salida}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setLista(prev => prev.filter(m => m._id !== item._id))}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Totales */}
                <tr className="bg-gray-50 font-semibold text-gray-700">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-4 py-3 text-right text-green-700">+{totalIngreso}</td>
                  <td className="px-4 py-3 text-right text-orange-600">-{totalSalida}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Botón registrar ───────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={handleRegistrar}
          disabled={
            submitting ||
            lista.length === 0 ||
            (tipoEntidad === 'proveedor' ? !proveedorId : !clienteId)
          }
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {submitting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Registrar Movimiento
        </button>
      </div>
    </div>
  );
}
