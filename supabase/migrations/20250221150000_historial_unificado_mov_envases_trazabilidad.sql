-- Trazabilidad en Historial: que la rama Movimientos_Envases (AJUSTE_STOCK)
-- exponga entidad_proveedor_id y entidad_cliente_id para mostrar a qué
-- proveedor o cliente se asignó el movimiento.
DO $$
DECLARE
  v_def    text;
  v_parts  text[];
  v_new    text[];
  v_i      int;
  v_sep    text := E' UNION ALL ';
BEGIN
  SELECT pg_get_viewdef('historial_unificado'::regclass, true) INTO v_def;
  IF v_def IS NULL OR v_def = '' THEN
    RAISE EXCEPTION 'Vista historial_unificado no encontrada';
  END IF;

  v_parts := regexp_split_to_array(v_def, '\s+UNION\s+ALL\s+');

  FOR v_i IN 1 .. array_length(v_parts, 1) LOOP
    IF v_parts[v_i] ~* 'Movimientos_Envases' THEN
      v_parts[v_i] := regexp_replace(
        v_parts[v_i],
        'NULL::integer AS entidad_proveedor_id',
        '"Movimientos_Envases".proveedor_id AS entidad_proveedor_id',
        'g'
      );
      v_parts[v_i] := regexp_replace(
        v_parts[v_i],
        'NULL::integer AS entidad_cliente_id',
        '"Movimientos_Envases".cliente_id AS entidad_cliente_id',
        'g'
      );
    END IF;
    v_new := array_append(v_new, v_parts[v_i]);
  END LOOP;

  v_def := array_to_string(v_new, v_sep);
  DROP VIEW IF EXISTS historial_unificado;
  EXECUTE 'CREATE VIEW historial_unificado AS ' || v_def;
END $$;
