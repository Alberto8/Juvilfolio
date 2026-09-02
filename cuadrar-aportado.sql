-- ============================================
-- CUADRE de assets.aportado contra fund_contributions
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- La consulta de cuadre de historico-compras.sql llamaba "sin_anotar" a la
-- diferencia, y eso engaña: suena a que faltan aportaciones por registrar.
-- En los activos del plan mensual es al revés — lo que está desfasado es
-- assets.aportado, y la app YA lo ignora.
--
-- QUIÉN MANDA EN CADA CASO
--   plan_mensual = true  → manda fund_contributions. assets.aportado es un
--                          resto histórico que nadie actualiza y que la app
--                          sustituye al cargar (enrichAssets). Una diferencia
--                          aquí no rompe nada.
--   plan_mensual = false → manda assets.aportado. Las filas de
--                          fund_contributions solo sirven para atribuir la
--                          compra a su año en Anualidades. Una diferencia aquí
--                          sí desplaza ese reparto por años.
-- ============================================

-- ── 1. CUADRE, diciendo quién manda ─────────
SELECT
  a.name,
  a.platform,
  a.plan_mensual,
  a.aportado                        AS en_assets,
  COALESCE(SUM(c.aportado), 0)      AS anotado,
  ROUND(COALESCE(SUM(c.aportado), 0) - a.aportado, 2) AS diferencia,
  CASE
    WHEN ABS(COALESCE(SUM(c.aportado), 0) - a.aportado) < 0.005
      THEN 'cuadra'
    WHEN a.plan_mensual
      THEN 'da igual · manda lo anotado'
    ELSE 'REVISAR · manda assets, el histórico por años queda desplazado'
  END AS veredicto
FROM assets a
LEFT JOIN fund_contributions c ON c.asset_id = a.id
GROUP BY a.id, a.name, a.platform, a.plan_mensual, a.aportado
ORDER BY a.plan_mensual, ABS(COALESCE(SUM(c.aportado), 0) - a.aportado) DESC;

-- ── 2. OPCIONAL: poner assets.aportado al día ──
-- No hace falta para que la app funcione, pero deja la base coherente si algún
-- día consultas assets directamente o quitas el flag plan_mensual a un activo.
-- Solo toca los del plan que tengan aportaciones anotadas.
UPDATE assets a
SET aportado = t.total
FROM (
  SELECT asset_id, SUM(aportado) AS total
  FROM fund_contributions
  GROUP BY asset_id
) t
WHERE a.id = t.asset_id
  AND a.plan_mensual
  AND ABS(a.aportado - t.total) >= 0.005;

-- ── 3. Comprobar que ya solo quedan los de fuera del plan ──
SELECT a.name, a.platform, a.plan_mensual, a.aportado,
       COALESCE(SUM(c.aportado), 0) AS anotado
FROM assets a
LEFT JOIN fund_contributions c ON c.asset_id = a.id
GROUP BY a.id, a.name, a.platform, a.plan_mensual, a.aportado
HAVING ABS(COALESCE(SUM(c.aportado), 0) - a.aportado) >= 0.005
ORDER BY a.name;
