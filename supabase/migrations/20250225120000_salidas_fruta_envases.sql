-- Agregar columnas de trazabilidad de envases a Salidas_Fruta
ALTER TABLE "Salidas_Fruta"
  ADD COLUMN IF NOT EXISTS envase_id integer REFERENCES "Envases"(id),
  ADD COLUMN IF NOT EXISTS cantidad_envases integer;

COMMENT ON COLUMN "Salidas_Fruta".envase_id IS 'Tipo de envase/bin que sale con el despacho (trazabilidad para saldos con cliente).';
COMMENT ON COLUMN "Salidas_Fruta".cantidad_envases IS 'Cantidad de envases que van con el despacho; genera Movimientos_Envases SALIDA_OCUPADO (resta ocupados en Inventario).';

-- Función atómica: registrar salida de fruta + movimiento de envases en una transacción
CREATE OR REPLACE FUNCTION registrar_salida_fruta_con_envases(
  p_fecha_salida date,
  p_cliente_id integer,
  p_fletero_id integer,
  p_lineas jsonb,
  p_envase_id integer DEFAULT NULL,
  p_cantidad_envases integer DEFAULT NULL,
  p_remito_para_nota text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  linea jsonb;
BEGIN
  -- Insertar cada línea en Salidas_Fruta (misma envase_id y cantidad_envases en todas)
  FOR linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO "Salidas_Fruta" (
      fecha_salida,
      cliente_id,
      producto_id,
      fletero_id,
      peso_salida_acopio_kg,
      remito_nro,
      estado_conciliacion,
      envase_id,
      cantidad_envases,
      precio_venta_kg_historico,
      descuento_calidad_kg,
      monto_final_cobrar,
      peso_llegada_cliente_kg,
      notas
    ) VALUES (
      p_fecha_salida,
      p_cliente_id,
      (linea->>'producto_id')::integer,
      NULLIF(p_fletero_id, 0),
      (linea->>'peso_salida_acopio_kg')::numeric,
      NULLIF(TRIM(linea->>'remito_nro'), ''),
      'pendiente',
      p_envase_id,
      p_cantidad_envases,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    );
  END LOOP;

  -- Si se indicaron envases: SALIDA_OCUPADO (bines llenos que salen con fruta)
  -- Resta del stock de ocupados en Inventario y baja deuda de envases con el cliente.
  IF p_envase_id IS NOT NULL AND p_cantidad_envases IS NOT NULL AND p_cantidad_envases > 0 THEN
    INSERT INTO "Movimientos_Envases" (
      fecha_movimiento,
      tipo_movimiento,
      envase_id,
      cantidad,
      proveedor_id,
      cliente_id,
      remito_asociado,
      notas
    ) VALUES (
      p_fecha_salida,
      'SALIDA_OCUPADO',
      p_envase_id,
      p_cantidad_envases,
      NULL,
      p_cliente_id,
      NULL,
      'Salida por despacho - Remito ' || COALESCE(NULLIF(TRIM(p_remito_para_nota), ''), 'N/A')
    );
  END IF;
END;
$$;
