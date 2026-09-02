-- ============================================
-- HISTÓRICO DE COMPRAS PUNTUALES
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- fund_contributions vale para cualquier aportación, no solo para el plan
-- mensual: una acción comprada un mes concreto es una aportación de ese mes.
-- Con esto, Anualidades y Comparativa pueden atribuir esas compras a su año
-- en lugar de darlas por "sin histórico".
--
-- NO marca estos activos como plan_mensual, así que NO les sale columna en la
-- pestaña Fondos Mensual, que es para el plan recurrente. Tampoco les toca las
-- participaciones: en una acción con contrasplit (Amper) el modelo de
-- participaciones daría un número falso, así que ahí manda lo que tengas escrito.
--
-- Los importes cuadran con el aportado de cada activo:
--   Amper    350,00 (oct-25) +  747,05 (nov-25) = 1.097,05  ✓
--   Nextil   988,88 (sept-25)                   =   988,88  ✓
--   OHLA     385,71 (nov-25)                    =   385,71  ✓
--   Storm  2.514,45 (ene-26)                    = 2.514,45  ✓
-- ============================================

-- ── 1. LAS COMPRAS ──────────────────────────
INSERT INTO fund_contributions (user_id, asset_id, month, aportado)
SELECT a.user_id, a.id, c.month, c.importe
FROM assets a
JOIN (VALUES
  ('AMP',      '2025-10',  350.00),
  ('AMP',      '2025-11',  747.05),
  ('NXT',      '2025-09',  988.88),
  ('OHLA',     '2025-11',  385.71),
  ('STORM-RF', '2026-01', 2514.45)
) AS c(ticker, month, importe) ON a.ticker = c.ticker
ON CONFLICT (user_id, asset_id, month) DO UPDATE SET aportado = EXCLUDED.aportado;

-- ── 2. QUÉ HA QUEDADO ───────────────────────
SELECT c.month, a.name, a.platform, c.aportado
FROM fund_contributions c
JOIN assets a ON a.id = c.asset_id
WHERE a.ticker IN ('AMP', 'NXT', 'OHLA', 'STORM-RF')
ORDER BY c.month, a.name;

-- ── 3. CUADRE contra el aportado de cada activo ──
-- 'sin_anotar' debe salir ~0 en estos cuatro. En los fondos del plan mensual
-- también, porque sus aportaciones ya están en la tabla.
SELECT a.name, a.platform, a.aportado,
       COALESCE(SUM(c.aportado), 0)              AS anotado,
       a.aportado - COALESCE(SUM(c.aportado), 0) AS sin_anotar
FROM assets a
LEFT JOIN fund_contributions c ON c.asset_id = a.id
GROUP BY a.id, a.name, a.platform, a.aportado
ORDER BY ABS(a.aportado - COALESCE(SUM(c.aportado), 0)) DESC;

-- Bitcoin y Groupama saldrán descuadrados: del Bitcoin no me has dado el mes de
-- compra, y Groupama todavía no existe como activo (ver diagnostico-groupama.sql).
