-- Vista de saldos de envases por entidad (proveedor o cliente) y por tipo de envase.
-- Fórmula: (INGRESO + ENTRADA) - SALIDA
--   - Positivo: les debemos (a favor, verde en front).
--   - Negativo: nos deben (deuda, rojo en front).
-- Proveedores: Movimientos_Envases (INGRESO/SALIDA) + Entradas_Fruta (ENTRADA = envases que entraron con fruta).
-- Clientes: solo Movimientos_Envases (INGRESO - SALIDA).

DROP VIEW IF EXISTS v_saldos_envases_total;

CREATE VIEW v_saldos_envases_total AS
WITH
-- Proveedor: agregado de Movimientos_Envases por (proveedor_id, envase_id)
me_prov AS (
  SELECT
    proveedor_id,
    envase_id,
    SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN COALESCE(cantidad, 0) ELSE 0 END) AS ingreso,
    SUM(CASE WHEN tipo_movimiento = 'SALIDA' THEN COALESCE(cantidad, 0) ELSE 0 END) AS salida
  FROM "Movimientos_Envases"
  WHERE proveedor_id IS NOT NULL AND envase_id IS NOT NULL
  GROUP BY proveedor_id, envase_id
),
-- Proveedor: agregado de Entradas_Fruta (envases que entraron con fruta = ENTRADA)
ef_prov AS (
  SELECT
    proveedor_id,
    envase_id,
    SUM(COALESCE(cantidad_envases, 0)) AS entrada
  FROM "Entradas_Fruta"
  WHERE proveedor_id IS NOT NULL AND envase_id IS NOT NULL
  GROUP BY proveedor_id, envase_id
),
-- Todas las combinaciones (proveedor_id, envase_id) que aparecen en ME o en EF
prov_envases AS (
  SELECT proveedor_id, envase_id FROM me_prov
  UNION
  SELECT proveedor_id, envase_id FROM ef_prov
),
-- Saldo proveedor: (INGRESO + ENTRADA) - SALIDA
prov_saldo AS (
  SELECT
    p.proveedor_id,
    p.envase_id,
    (COALESCE(me.ingreso, 0) + COALESCE(ef.entrada, 0)) - COALESCE(me.salida, 0) AS saldo_neto
  FROM prov_envases p
  LEFT JOIN me_prov me ON me.proveedor_id = p.proveedor_id AND me.envase_id = p.envase_id
  LEFT JOIN ef_prov ef ON ef.proveedor_id = p.proveedor_id AND ef.envase_id = p.envase_id
),
-- Cliente: (INGRESO) - (SALIDA vacíos + SALIDA_OCUPADO bines con fruta)
cli_saldo AS (
  SELECT
    cliente_id,
    envase_id,
    SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN COALESCE(cantidad, 0) ELSE 0 END)
    - SUM(CASE WHEN tipo_movimiento IN ('SALIDA', 'SALIDA_OCUPADO') THEN COALESCE(cantidad, 0) ELSE 0 END) AS saldo_neto
  FROM "Movimientos_Envases"
  WHERE cliente_id IS NOT NULL AND envase_id IS NOT NULL
  GROUP BY cliente_id, envase_id
)
-- Filas de proveedores
SELECT
  ps.proveedor_id,
  NULL::integer AS cliente_id,
  ps.envase_id,
  e.nombre AS envase_nombre,
  ps.saldo_neto
FROM prov_saldo ps
JOIN "Envases" e ON e.id = ps.envase_id
UNION ALL
-- Filas de clientes
SELECT
  NULL::integer AS proveedor_id,
  cs.cliente_id,
  cs.envase_id,
  e.nombre AS envase_nombre,
  cs.saldo_neto
FROM cli_saldo cs
JOIN "Envases" e ON e.id = cs.envase_id;
