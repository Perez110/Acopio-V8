-- RPC opcional: unifica movimientos de una cuenta (Cobros/Pagos + Mov. Internos)
-- para conciliación bancaria. Usar desde getHistorialCuenta si se prefiere una sola
-- consulta a la DB. Validación de rango máximo (31 días) debe hacerse en la app.

CREATE OR REPLACE FUNCTION get_movimientos_cuenta(
  p_cuenta_id integer,
  p_desde date,
  p_hasta date
)
RETURNS TABLE (
  fecha date,
  concepto text,
  tipo text,
  monto numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Movimientos_Financieros (cobros/pagos): una fila por movimiento
  SELECT
    (m.fecha)::date AS fecha,
    COALESCE(NULLIF(TRIM(m.descripcion), ''), 'Cobro/Pago')::text AS concepto,
    CASE WHEN UPPER(COALESCE(m.tipo, '')) = 'INGRESO' THEN 'INGRESO'::text ELSE 'EGRESO'::text END AS tipo,
    COALESCE(m.monto, 0)::numeric AS monto
  FROM "Movimientos_Financieros" m
  WHERE m.cuenta_financiera_id = p_cuenta_id
    AND m.fecha IS NOT NULL
    AND (m.fecha)::date >= p_desde
    AND (m.fecha)::date <= p_hasta

  UNION ALL

  -- Movimientos_Internos: cuenta como origen → EGRESO
  SELECT
    (mi.created_at)::date AS fecha,
    COALESCE(NULLIF(TRIM(mi.descripcion), ''), 'Mov. interno')::text AS concepto,
    'EGRESO'::text AS tipo,
    COALESCE(mi.monto, 0)::numeric AS monto
  FROM "Movimientos_Internos" mi
  WHERE mi.cuenta_origen_id = p_cuenta_id
    AND (mi.created_at)::date >= p_desde
    AND (mi.created_at)::date <= p_hasta

  UNION ALL

  -- Movimientos_Internos: cuenta como destino → INGRESO
  SELECT
    (mi.created_at)::date AS fecha,
    COALESCE(NULLIF(TRIM(mi.descripcion), ''), 'Mov. interno')::text AS concepto,
    'INGRESO'::text AS tipo,
    COALESCE(mi.monto, 0)::numeric AS monto
  FROM "Movimientos_Internos" mi
  WHERE mi.cuenta_destino_id = p_cuenta_id
    AND (mi.created_at)::date >= p_desde
    AND (mi.created_at)::date <= p_hasta

  ORDER BY 1 DESC;
$$;

COMMENT ON FUNCTION get_movimientos_cuenta(integer, date, date) IS
  'Unifica Movimientos_Financieros y Movimientos_Internos de una cuenta para conciliación. La app debe validar rango máx. 31 días.';
