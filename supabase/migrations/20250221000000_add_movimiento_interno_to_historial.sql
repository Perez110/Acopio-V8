DO $$
DECLARE
  v_def text;
  v_union text := $q$
SELECT
  ('mov_interno_' || mi.id)::text AS uid,
  mi.id AS id_origen,
  'MOVIMIENTO_INTERNO'::text AS tipo_evento,
  mi.created_at,
  NULL::integer AS entidad_proveedor_id,
  NULL::integer AS entidad_cliente_id,
  NULL::integer AS entidad_fletero_id,
  NULL::integer AS entidad_envase_id,
  NULL::integer AS producto_id,
  NULL::integer AS envase_id,
  NULL::integer AS cantidad,
  NULL::double precision AS peso_bruto_kg,
  NULL::double precision AS peso_neto_kg,
  mi.monto,
  NULL::text AS metodo_pago,
  (coalesce(co.nombre, '?') || ' → ' || coalesce(cd.nombre, '?') || CASE WHEN trim(coalesce(mi.descripcion, '')) <> '' THEN ': ' || mi.descripcion ELSE '' END)::text AS descripcion_txt,
  NULL::text AS notas_txt,
  NULL::text AS estado_conciliacion,
  NULL::double precision AS descuento_calidad_kg,
  '/cajas-bancos'::text AS href
FROM "Movimientos_Internos" mi
LEFT JOIN "Cuentas_Financieras" co ON co.id = mi.cuenta_origen_id
LEFT JOIN "Cuentas_Financieras" cd ON cd.id = mi.cuenta_destino_id
$q$;
BEGIN
  SELECT pg_get_viewdef('historial_unificado'::regclass, true) INTO v_def;
  DROP VIEW IF EXISTS historial_unificado;
  EXECUTE 'CREATE VIEW historial_unificado AS ' || v_def || E' UNION ALL\n' || v_union;
END $$;
