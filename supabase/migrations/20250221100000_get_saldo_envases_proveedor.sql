CREATE OR REPLACE FUNCTION get_saldo_envases_proveedor(p_proveedor_id integer)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(SUM(e.cantidad_envases), 0)::integer
     FROM "Entradas_Fruta" e
     WHERE e.proveedor_id = p_proveedor_id),
    0
  ) - COALESCE(
    (SELECT COALESCE(SUM(m.cantidad), 0)::integer
     FROM "Movimientos_Envases" m
     WHERE m.proveedor_id = p_proveedor_id
       AND m.tipo_movimiento = 'SALIDA'),
    0
  );
$$;
