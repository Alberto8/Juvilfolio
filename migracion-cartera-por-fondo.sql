-- ============================================
-- MIGRACIÓN + RELLENO: valor de cartera separado por fondo
-- Ejecuta este script completo en Supabase → SQL Editor.
-- ============================================
-- Hasta ahora fund_monthly solo guardaba el valor CONJUNTO de
-- MSCI + Emergentes (cartera_msci_em), así que no se podía calcular
-- la rentabilidad de cada fondo por separado.
--
-- Este script:
--   1. Añade las columnas cartera_msci y cartera_emergentes.
--   2. Reparte el total real de cada mes entre los dos fondos usando
--      su NAV mensual real (Fidelity MSCI World Index EUR P Acc y
--      Fidelity MSCI Emerging Markets Index EUR P Acc).
--
-- El reparto RESPETA cartera_msci_em: cartera_msci + cartera_emergentes
-- suma siempre exactamente el total que ya tenías guardado, así que la
-- rentabilidad combinada no cambia ni un céntimo. Lo único que se añade
-- es el desglose, y ese desglose lo marca el comportamiento real de cada
-- fondo (Emergentes rindió bastante más que el World en este periodo).
-- ============================================

-- ── 1. COLUMNAS ─────────────────────────────
ALTER TABLE fund_monthly
  ADD COLUMN IF NOT EXISTS cartera_msci        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cartera_emergentes  numeric NOT NULL DEFAULT 0;

-- ── 2. VISTA PREVIA (opcional, no modifica nada) ──
-- Ejecuta solo este bloque primero si quieres comprobar los números
-- antes de escribirlos.
WITH nav (month, p_msci, p_em) AS (
  VALUES
    ('2025-07', 11.653, 6.457),
    ('2025-08', 11.691, 6.406),
    ('2025-09', 12.020, 6.835),
    ('2025-10', 12.480, 7.240),
    ('2025-11', 12.446, 7.026),
    ('2025-12', 12.397, 7.149),
    ('2026-01', 12.511, 7.685),
    ('2026-02', 12.698, 8.151),
    ('2026-03', 12.185, 7.285),
    ('2026-04', 13.117, 8.196),
    ('2026-05', 13.785, 9.037),
    ('2026-06', 13.969, 9.098),
    ('2026-07', 13.950, 8.753),
    ('2026-08', 14.332, 8.732)
),
modelo AS (
  SELECT f.id, f.month, f.cartera_msci_em AS total,
         SUM(f.ap_msci)                        OVER w AS ap_acum_msci,
         SUM(f.ap_emergentes)                  OVER w AS ap_acum_em,
         SUM(f.ap_msci       / n.p_msci) OVER w * n.p_msci AS v_msci,
         SUM(f.ap_emergentes / n.p_em)   OVER w * n.p_em   AS v_em
  FROM fund_monthly f
  JOIN nav n ON n.month = f.month::text
  WINDOW w AS (PARTITION BY f.user_id ORDER BY f.month)
)
SELECT month,
       total,
       ap_acum_msci,
       ap_acum_em,
       ROUND(total * v_msci / (v_msci + v_em), 2) AS cartera_msci,
       ROUND(total - ROUND(total * v_msci / (v_msci + v_em), 2), 2) AS cartera_emergentes,
       ROUND(total * v_msci / (v_msci + v_em), 2) - ap_acum_msci AS rent_msci,
       ROUND(total - ROUND(total * v_msci / (v_msci + v_em), 2), 2) - ap_acum_em AS rent_em
FROM modelo
WHERE total > 0 AND v_msci + v_em > 0
ORDER BY month;

-- ── 3. RELLENO ──────────────────────────────
WITH nav (month, p_msci, p_em) AS (
  VALUES
    ('2025-07', 11.653, 6.457),
    ('2025-08', 11.691, 6.406),
    ('2025-09', 12.020, 6.835),
    ('2025-10', 12.480, 7.240),
    ('2025-11', 12.446, 7.026),
    ('2025-12', 12.397, 7.149),
    ('2026-01', 12.511, 7.685),
    ('2026-02', 12.698, 8.151),
    ('2026-03', 12.185, 7.285),
    ('2026-04', 13.117, 8.196),
    ('2026-05', 13.785, 9.037),
    ('2026-06', 13.969, 9.098),
    ('2026-07', 13.950, 8.753),
    ('2026-08', 14.332, 8.732)
),
modelo AS (
  SELECT f.id, f.cartera_msci_em AS total,
         SUM(f.ap_msci       / n.p_msci) OVER w * n.p_msci AS v_msci,
         SUM(f.ap_emergentes / n.p_em)   OVER w * n.p_em   AS v_em
  FROM fund_monthly f
  JOIN nav n ON n.month = f.month::text
  WINDOW w AS (PARTITION BY f.user_id ORDER BY f.month)
),
reparto AS (
  SELECT id, total, ROUND(total * v_msci / (v_msci + v_em), 2) AS c_msci
  FROM modelo
  WHERE total > 0 AND v_msci + v_em > 0
)
UPDATE fund_monthly f
SET cartera_msci       = r.c_msci,
    cartera_emergentes = ROUND(r.total - r.c_msci, 2)
FROM reparto r
WHERE f.id = r.id;

-- ── 4. VERIFICACIÓN ─────────────────────────
SELECT month, ap_msci, ap_emergentes, ap_clase_c,
       cartera_msci, cartera_emergentes,
       cartera_msci + cartera_emergentes AS suma_desglose,
       cartera_msci_em AS total_guardado,
       cartera_clase_c
FROM fund_monthly
ORDER BY month;

-- suma_desglose debe coincidir con total_guardado en todas las filas.

-- ============================================
-- RESULTADO ESPERADO con los datos de insertar-datos.sql
-- ============================================
--  mes      | c_msci   | c_em    | rent MSCI          | rent EMERG.
-- ----------+----------+---------+--------------------+-------------------
--  2025-08  |   200.00 |   37.50 |    +0.00 ( 0.00%)  |   +0.00 ( 0.00%)
--  2025-09  |   416.48 |   79.59 |   +16.48 (+4.12%)  |   +4.59 (+6.12%)
--  2025-10  |   684.61 |  120.21 |   +24.61 (+3.73%)  |   +7.71 (+6.85%)
--  2025-11  |   927.79 |  214.80 |   +67.79 (+7.88%)  |  +14.80 (+7.40%)
--  2025-12  |  1228.89 |  268.74 |   +68.89 (+5.94%)  |  +18.74 (+7.50%)
--  2026-01  |  1545.36 |  339.30 |   +85.36 (+5.85%)  |  +39.30 (+13.10%)
--  2026-02  |  1890.92 |  440.66 |  +110.92 (+6.23%)  |  +60.66 (+15.96%)
--  2026-03  |  2148.68 |  477.29 |   +48.68 (+2.32%)  |  +17.29 (+3.76%)
--  2026-04  |  2694.84 |  631.65 |  +274.84 (+11.36%) |  +91.65 (+16.97%)

-- ============================================
-- NOTAS
-- ============================================
-- · MÉTODO: cada aportación mensual se convierte en participaciones al NAV
--   de cierre de ese mes; las participaciones acumuladas por el NAV del mes
--   dan el valor modelado de cada fondo, y con esa proporción se reparte el
--   total real. Comprar al cierre subestima algo las participaciones (tú
--   aportas a principio de mes), y por eso el modelo queda un 3-5% por debajo
--   de tu total real — el reescalado a cartera_msci_em corrige esa desviación.
--
-- · MESES SIN NAV: si añades meses posteriores a 2026-08, el JOIN los ignora
--   y se quedan a 0; la app mostrará "—" en las columnas MSCI y EMERG. de
--   Rentabilidad hasta que amplíes la tabla nav de arriba y vuelvas a ejecutar
--   los bloques 2-4. Es idempotente: puedes relanzarlo cuantas veces quieras.
--
-- · FUENTE DE LOS NAV: columna Price (cierre mensual) de
--     Fidelity MSCI World Index Fund EUR P Acc          → 0P0001CLDK
--     Fidelity MSCI Emerging Markets Index Fund EUR P Acc → 0P0001CJGK
--   Esos códigos 0P... son los símbolos de Yahoo Finance para estos fondos.
