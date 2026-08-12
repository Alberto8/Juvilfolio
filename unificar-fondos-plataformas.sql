-- ============================================
-- UNIFICAR: el mismo fondo en las dos plataformas
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- Los fondos de Trade Republic son los mismos que los de MyInvestor,
-- solo cambia la plataforma. Deben compartir nombre, ticker (ISIN),
-- tipo y categoría; lo único propio de cada plataforma son las
-- participaciones, el coste medio, lo aportado y el valor.
--
-- Estado actual:
--   ✓ Fidelity MSCI World Index / IE00BYX5NX33 / Fondo / RV
--     ya está igual en las dos plataformas.
--   ✗ El de emergentes en Trade Republic está dado de alta como
--     "MSCI Emerging Markets ETF", ticker interno EM-ETF y tipo ETF,
--     cuando es el mismo fondo Fidelity que en MyInvestor. Su coste
--     medio (6,82 €) encaja con el NAV del fondo, así que es el mismo.
-- ============================================

-- ── 1. ANTES: mira cómo está ────────────────
SELECT name, ticker, platform, type, category,
       participaciones, coste_medio, aportado, valor_actual
FROM assets
WHERE type IN ('Fondo', 'ETF')
ORDER BY name, platform;

-- ── 2. ARREGLO ──────────────────────────────
UPDATE assets
SET name     = 'Fidelity Emerging Markets',
    ticker   = 'IE00BYX5M476',
    type     = 'Fondo',
    category = 'RV'
WHERE platform = 'Trade Republic'
  AND (ticker = 'EM-ETF' OR name = 'MSCI Emerging Markets ETF');

-- ── 3. DESPUÉS: comprueba que cuadra ────────
-- Cada ISIN debe salir con UN solo nombre, tipo y categoría,
-- y tantas plataformas como sitios donde lo tengas.
SELECT ticker,
       COUNT(DISTINCT name)     AS nombres_distintos,
       COUNT(DISTINCT type)     AS tipos_distintos,
       COUNT(DISTINCT category) AS categorias_distintas,
       STRING_AGG(platform, ' + ' ORDER BY platform) AS plataformas,
       STRING_AGG(DISTINCT name, ' | ')              AS nombre,
       SUM(participaciones) AS participaciones_total,
       SUM(aportado)        AS aportado_total,
       SUM(valor_actual)    AS valor_total
FROM assets
GROUP BY ticker
ORDER BY ticker;

-- Si alguna fila sale con nombres_distintos, tipos_distintos o
-- categorias_distintas > 1, ese activo sigue descuadrado entre plataformas.

-- ============================================
-- NOTA
-- ============================================
-- El valor de los fondos de Trade Republic NO sale de Fondos Mensual:
-- esa pestaña lleva solo el plan mensual de MyInvestor. Los de Trade
-- Republic se siguen actualizando por cotización o los editas a mano
-- desde la pestaña Cartera.
