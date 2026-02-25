-- RPC: get_dashboard_kpis(p_mes INT, p_anio INT)
-- Devuelve una sola fila con KPIs del dashboard. Ejecutar en el SQL Editor de Supabase.
-- Uso desde la app: supabase.rpc('get_dashboard_kpis', { p_mes: 2, p_anio: 2025 })

CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_mes INT, p_anio INT)
RETURNS TABLE (
  entradas_mes_kg numeric,
  salidas_mes_kg numeric,
  saldo_financiero_mes numeric,
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
    -- Ingresos menos egresos de Movimientos_Financieros para el mes/año
    (SELECT COALESCE(SUM(
       CASE WHEN m.tipo = 'INGRESO' THEN m.monto
            WHEN m.tipo = 'EGRESO' THEN -(m.monto)
            ELSE 0 END
     ), 0)::numeric
     FROM "Movimientos_Financieros" m
     WHERE date_part('month', (m.fecha)::date) = p_mes
       AND date_part('year', (m.fecha)::date) = p_anio),
    -- Saldo total global de bines (vista stock_vacios_por_envase), sin filtro por mes
    (SELECT COALESCE(SUM(v.vacios), 0)::numeric
     FROM stock_vacios_por_envase v);
$$;

-- Comentario para el catálogo
COMMENT ON FUNCTION get_dashboard_kpis(INT, INT) IS
  'KPIs del dashboard: entradas_mes_kg, salidas_mes_kg, saldo_financiero_mes, stock_bines_actual.';
