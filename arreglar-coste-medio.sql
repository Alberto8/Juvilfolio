-- ============================================
-- ARREGLO: coste medio descuadrado (Trade Republic)
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- El coste medio no es un dato independiente: por definición es
--   coste_medio = aportado / participaciones
-- En MyInvestor cuadra (desvío < 1 €, redondeo normal). En Trade
-- Republic NO cuadra, y es el único descuadre real que hay:
--
--   activo                          part x coste  aportado   desvío
--   MSCI World  (MyInvestor)           2470,43 €  2470,00 €   +0,43   ✓
--   Emergentes  (MyInvestor)            539,81 €   540,00 €   -0,19   ✓
--   Value Clase C (MyInvestor)          333,32 €   334,03 €   -0,71   ✓
--   MSCI World  (Trade Republic)        150,06 €   157,28 €   -7,22   ✗
--   Emergentes  (Trade Republic)         28,59 €    31,75 €   -3,16   ✗
--
-- El coste medio de Trade Republic está copiado del de MyInvestor
-- (12,74 y 6,82) cuando el real es más alto porque entraste más tarde,
-- a NAV superior. Tu intuición era correcta, solo que el campo afectado
-- es coste_medio, no las participaciones:
--
--   MSCI World  TR → 157,28 / 11,778413 = 13,3532  (no 12,74)
--   Emergentes  TR →  31,75 /  4,192533 =  7,5730  (no 6,82)
--
-- Y así los porcentajes cuadran con la realidad: MSCI World en Trade
-- rinde +7,33% (entraste caro) frente al +16,64% de MyInvestor.
-- ============================================

-- ── 1. ANTES: ver el descuadre ──────────────
SELECT name, platform, participaciones, coste_medio, aportado,
       ROUND(participaciones * coste_medio, 2) AS part_x_coste,
       ROUND(participaciones * coste_medio - aportado, 2) AS desvio,
       ROUND(aportado / NULLIF(participaciones, 0), 4) AS coste_medio_real
FROM assets
WHERE participaciones > 0
ORDER BY platform, name;

-- ── 2. ARREGLO ──────────────────────────────
-- Recalcula el coste medio a partir de lo aportado y las participaciones,
-- que son los dos datos reales. Solo toca las filas descuadradas más de
-- 1 €, así que las de MyInvestor se quedan como están.
UPDATE assets
SET coste_medio = ROUND(aportado / participaciones, 4)
WHERE participaciones > 0
  AND ABS(participaciones * coste_medio - aportado) > 1;

-- ── 3. DESPUÉS: comprobar ───────────────────
-- La columna desvio debe ser ~0 en todas las filas.
SELECT name, platform, participaciones, coste_medio, aportado,
       ROUND(participaciones * coste_medio - aportado, 2) AS desvio
FROM assets
WHERE participaciones > 0
ORDER BY platform, name;

-- ============================================
-- IMPORTANTE: esto NO cambia el valor de la cartera
-- ============================================
-- coste_medio es informativo: la app no lo usa para nada, calcula
--   valor_actual = precio de Yahoo × participaciones
-- Así que si el valor de un activo sale mal, el campo a revisar son las
-- PARTICIPACIONES, no el coste medio. Compara con lo que te muestra la
-- plataforma y corrígelas desde Cartera → clic en el activo.
