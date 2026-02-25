-- Ejecutar en Supabase SQL Editor para habilitar KPIs escalables (evita límite 1000 filas).
-- Si no existe esta función, el módulo usa fallback por chunks.

CREATE OR REPLACE FUNCTION get_perdidas_kpis(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL
)
RETURNS TABLE (
  kilos_totales_perdidos numeric,
  dinero_perdido numeric,
  kilos_merma numeric,
  descuento_calidad_kg numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(v.kilos_totales_perdidos), 0)::numeric,
    COALESCE(SUM(v.dinero_perdido), 0)::numeric,
    COALESCE(SUM(v.kilos_merma), 0)::numeric,
    COALESCE(SUM(v.descuento_calidad_kg), 0)::numeric
  FROM vista_perdidas_fruta v
  INNER JOIN "Salidas_Fruta" s ON s.id = v.salida_id
  WHERE (p_desde IS NULL OR s.fecha_salida >= p_desde)
    AND (p_hasta IS NULL OR s.fecha_salida <= p_hasta)
    AND (p_cliente_id IS NULL OR s.cliente_id = p_cliente_id);
$$;
