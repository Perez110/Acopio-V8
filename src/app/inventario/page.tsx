import { BarChart2, Package, AlertTriangle } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase-server';
import ProductSearch from '@/components/inventario/ProductSearch';
import InventarioEnvases from '@/components/inventario/InventarioEnvases';
import type { ProductoConStock } from '@/components/inventario/ProductSearch';
import type { EnvaseConStock, AjusteHistorial } from '@/components/inventario/InventarioEnvases';

// revalidatePath() desde las actions invalida la caché en cada ajuste.
// En acceso normal: 30s de cache para no sobrecargar la API.
export const revalidate = 30;

const UMBRAL_STOCK_BAJO_KG = 500;

export default async function InventarioPage() {
  // ── Fetch en paralelo ──────────────────────────────────────────────────────
  const [
    { data: productos },
    { data: entradas },
    { data: salidas },
    { data: envases },
    { data: movEnvases },
  ] = await Promise.all([
    supabaseServer.from('Productos').select('*').eq('activo', true).order('nombre'),
    supabaseServer.from('Entradas_Fruta').select('producto_id, peso_neto_kg, envase_id, cantidad_envases'),
    supabaseServer.from('Salidas_Fruta').select('producto_id, peso_salida_acopio_kg'),
    supabaseServer.from('Envases').select('*').eq('activo', true).order('nombre'),
    // Traemos todos los campos necesarios: stock + historial de ajustes
    supabaseServer
      .from('Movimientos_Envases')
      .select('id, envase_id, tipo_movimiento, cantidad, fecha_movimiento, notas')
      .order('created_at', { ascending: false }),
  ]);

  // ── Stock por producto ─────────────────────────────────────────────────────
  const stockMap = new Map<number, number>();

  for (const e of entradas ?? []) {
    if (e.producto_id != null)
      stockMap.set(e.producto_id, (stockMap.get(e.producto_id) ?? 0) + (e.peso_neto_kg ?? 0));
  }
  for (const s of salidas ?? []) {
    if (s.producto_id != null)
      stockMap.set(s.producto_id, (stockMap.get(s.producto_id) ?? 0) - (s.peso_salida_acopio_kg ?? 0));
  }

  const productosConStock: ProductoConStock[] = (productos ?? []).map(p => ({
    ...p,
    stock: parseFloat(Math.max(0, stockMap.get(p.id) ?? 0).toFixed(2)),
  }));

  const stockTotal = productosConStock.reduce((s, p) => s + p.stock, 0);
  const productosEnStock = productosConStock.filter(p => p.stock > 0).length;
  const stockBajo = productosConStock.filter(p => p.stock > 0 && p.stock < UMBRAL_STOCK_BAJO_KG).length;

  // ── Stock de envases ───────────────────────────────────────────────────────
  // Tipos de movimiento y su impacto en el stock:
  //   INGRESO         → +vacíos   (envase vacío llegó al galpón)
  //   SALIDA          → −vacíos   (envase vacío salió del galpón)
  //   ENTRADA         → +ocupados (bin llegó lleno con fruta)
  //   SALIDA_OCUPADO  → −ocupados (bin salió lleno con fruta, ej. salida a cliente)
  //   AJUSTE_VACIO    → ±vacíos   (ajuste manual del conteo físico)
  //   AJUSTE_OCUPADO  → ±ocupados (ajuste manual del conteo físico)
  const vaciosMap = new Map<number, number>();
  const ocupadosMap = new Map<number, number>();

  for (const m of movEnvases ?? []) {
    if (!m.envase_id || m.cantidad == null) continue;

    switch (m.tipo_movimiento) {
      case 'INGRESO':
        vaciosMap.set(m.envase_id, (vaciosMap.get(m.envase_id) ?? 0) + m.cantidad);
        break;
      case 'SALIDA':
        vaciosMap.set(m.envase_id, (vaciosMap.get(m.envase_id) ?? 0) - m.cantidad);
        break;
      case 'ENTRADA':
        ocupadosMap.set(m.envase_id, (ocupadosMap.get(m.envase_id) ?? 0) + m.cantidad);
        break;
      case 'SALIDA_OCUPADO':
        ocupadosMap.set(m.envase_id, (ocupadosMap.get(m.envase_id) ?? 0) - m.cantidad);
        break;
      case 'AJUSTE_VACIO':
        vaciosMap.set(m.envase_id, (vaciosMap.get(m.envase_id) ?? 0) + m.cantidad);
        break;
      case 'AJUSTE_OCUPADO':
        ocupadosMap.set(m.envase_id, (ocupadosMap.get(m.envase_id) ?? 0) + m.cantidad);
        break;
    }
  }

  const envasesConStock: EnvaseConStock[] = (envases ?? []).map(e => ({
    id: e.id,
    nombre: e.nombre,
    tara_kg: e.tara_kg ?? null,
    vacios: Math.max(0, vaciosMap.get(e.id) ?? 0),
    ocupados: Math.max(0, ocupadosMap.get(e.id) ?? 0),
  }));

  const totalVacios = envasesConStock.reduce((s, e) => s + e.vacios, 0);
  const totalOcupados = envasesConStock.reduce((s, e) => s + e.ocupados, 0);

  // ── Historial de ajustes manuales ─────────────────────────────────────────
  const historialAjustes: AjusteHistorial[] = (movEnvases ?? [])
    .filter(m => m.tipo_movimiento === 'AJUSTE_VACIO' || m.tipo_movimiento === 'AJUSTE_OCUPADO')
    .map(m => ({
      id: m.id,
      fecha_movimiento: m.fecha_movimiento,
      envase_id: m.envase_id,
      envase_nombre: (envases ?? []).find(e => e.id === m.envase_id)?.nombre ?? '—',
      tipo_movimiento: m.tipo_movimiento,
      cantidad: m.cantidad,
      notas: m.notas ?? null,
    }));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold text-gray-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
            <BarChart2 className="h-5 w-5 text-blue-600" />
          </span>
          Inventario
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Control de stock y movimientos de productos / envases
        </p>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Stock Total</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {stockTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <BarChart2 className="h-5 w-5 text-blue-500" />
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Productos en Stock</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{productosEnStock}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
              <Package className="h-5 w-5 text-green-500" />
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Stock Bajo</p>
              <p className={`mt-2 text-3xl font-bold ${stockBajo > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {stockBajo}
              </p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stockBajo > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <AlertTriangle className={`h-5 w-5 ${stockBajo > 0 ? 'text-red-500' : 'text-gray-400'}`} />
            </span>
          </div>
        </div>
      </div>

      {/* Lista de productos con búsqueda */}
      <ProductSearch productos={productosConStock} />

      {/* Control de envases con ajuste manual (Client Component) */}
      <InventarioEnvases
        envasesConStock={envasesConStock}
        historialAjustes={historialAjustes}
        totalVacios={totalVacios}
        totalOcupados={totalOcupados}
      />
    </div>
  );
}
