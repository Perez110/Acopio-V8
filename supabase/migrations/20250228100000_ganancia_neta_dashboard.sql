-- Reemplaza saldo_financiero_mes por ganancia_neta_mes en el dashboard.
-- Fórmula: Ganancia Neta = (Ventas a Clientes + Ingresos Extra) - (Compras a Proveedores + Gastos Operativos)
-- Movimientos_Internos: INGRESO_EXTRA suma, GASTO resta; TRANSFERENCIA y RETIRO_SOCIO se ignoran.

CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_mes INT, p_anio INT)
RETURNS TABLE (
  entradas_mes_kg numeric,
  salidas_mes_kg numeric,
  ganancia_neta_mes numeric,
  stock_bines_actual numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- Suma de kilos netos de Entradas_Fruta para el mes/año indicados
    (SELECT COALESCE(SUM(e.peso_neto_kg), 0)::numeric
     FROM "Entradas_Fruta" e
     WHERE date_part('month', (e.fecha_entrada)::date) = p_mes
       AND date_part('year', (e.fecha_entrada)::date) = p_anio),
    -- Suma de kilos de Salidas_Fruta para el mes/año indicados
    (SELECT COALESCE(SUM(s.peso_salida_acopio_kg), 0)::numeric
     FROM "Salidas_Fruta" s
     WHERE date_part('month', (s.fecha_salida)::date) = p_mes
       AND date_part('year', (s.fecha_salida)::date) = p_anio),
    -- Ganancia Neta del Mes: (Ventas + Ingresos Extra) - (Compras + Gastos)
    (
      -- Ventas a clientes (INGRESO con cliente_id)
      (SELECT COALESCE(SUM(m.monto), 0)::numeric
       FROM "Movimientos_Financieros" m
       WHERE m.tipo = 'INGRESO' AND m.cliente_id IS NOT NULL
         AND date_part('month', (m.fecha)::date) = p_mes
         AND date_part('year', (m.fecha)::date) = p_anio)
      +
      -- Ingresos extra / Aporte de capital (Movimientos_Internos)
      (SELECT COALESCE(SUM(mi.monto), 0)::numeric
       FROM "Movimientos_Internos" mi
       WHERE mi.tipo_operacion = 'INGRESO_EXTRA'
         AND date_part('month', (mi.created_at)::date) = p_mes
         AND date_part('year', (mi.created_at)::date) = p_anio)
      -
      -- Compras a proveedores (EGRESO con proveedor_id)
      (SELECT COALESCE(SUM(m.monto), 0)::numeric
       FROM "Movimientos_Financieros" m
       WHERE m.tipo = 'EGRESO' AND m.proveedor_id IS NOT NULL
         AND date_part('month', (m.fecha)::date) = p_mes
         AND date_part('year', (m.fecha)::date) = p_anio)
      -
      -- Gastos operativos (Movimientos_Internos GASTO)
      (SELECT COALESCE(SUM(mi.monto), 0)::numeric
       FROM "Movimientos_Internos" mi
       WHERE mi.tipo_operacion = 'GASTO'
         AND date_part('month', (mi.created_at)::date) = p_mes
         AND date_part('year', (mi.created_at)::date) = p_anio)
    )::numeric,
    -- Saldo total global de bines (vista stock_vacios_por_envase), sin filtro por mes
    (SELECT COALESCE(SUM(v.vacios), 0)::numeric
     FROM stock_vacios_por_envase v);
$$;

COMMENT ON FUNCTION get_dashboard_kpis(INT, INT) IS
  'KPIs del dashboard: entradas_mes_kg, salidas_mes_kg, ganancia_neta_mes, stock_bines_actual. TRANSFERENCIA y RETIRO_SOCIO en Movimientos_Internos no afectan ganancia.';
