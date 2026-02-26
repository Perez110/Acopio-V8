-- Vista de inventario físico de envases VACÍOS por tipo de envase.
-- Reglas de negocio (Acopio = centro):
--   Inventario Vacíos = +Devuelve vacíos(Prov) -Se le entrega vacíos(Prov) +Ingresan envases(Cli) -Devuelvo envases(Cli) -Envases vacíos retirados(Ingreso Fruta) +Ajustes manuales.
--   En Movimientos_Envases: INGRESO suma vacíos, SALIDA resta vacíos, AJUSTE_VACIO suma (puede ser negativo).
--   ENTRADA y SALIDA_OCUPADO no afectan vacíos (afectan ocupados en otra vista/cálculo).

DROP VIEW IF EXISTS stock_vacios_por_envase;

CREATE VIEW stock_vacios_por_envase AS
SELECT
  e.id AS envase_id,
  e.nombre AS envase_nombre,
  (
    COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'INGRESO' THEN m.cantidad ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'SALIDA' THEN m.cantidad ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN m.tipo_movimiento = 'AJUSTE_VACIO' THEN m.cantidad ELSE 0 END), 0)
  )::integer AS vacios
FROM "Envases" e
LEFT JOIN "Movimientos_Envases" m ON m.envase_id = e.id
  AND m.tipo_movimiento IN ('INGRESO', 'SALIDA', 'AJUSTE_VACIO')
GROUP BY e.id, e.nombre;

COMMENT ON VIEW stock_vacios_por_envase IS 'Inventario físico de envases vacíos en el acopio. INGRESO +, SALIDA -, AJUSTE_VACIO ±. Coherente con reglas: Devuelve vacíos(Prov), Se le entrega(Prov), Ingresan envases(Cli), Devuelvo envases(Cli), retiros en Ingreso Fruta.';
