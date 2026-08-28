-- ============================================
-- ¿POR QUÉ NO SALE GROUPAMA?
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- La app pinta todo lo que devuelve `SELECT * FROM assets`, así que si Groupama
-- no aparece es que la fila no existe o que RLS no te la deja ver.
-- Sospecha número uno: crear-groupama.sql termina en
--     WHERE email = 'TU-EMAIL-AQUI'
-- Si no sustituiste ese texto por tu email, el INSERT ... SELECT no encontró
-- ningún usuario y insertó CERO filas, sin dar error. Supabase te habría dicho
-- "Success. No rows returned", que parece un OK.
-- ============================================

-- ── 1. ¿Existe la fila? ─────────────────────
SELECT id, user_id, name, ticker, platform, type, category,
       participaciones, aportado, valor_actual
FROM assets
WHERE ticker = 'FR0000989626' OR name ILIKE '%groupama%';

-- Si no devuelve nada → no se creó. Ve al bloque 3.
-- Si devuelve una fila → compara su user_id con el del bloque 2.

-- ── 2. ¿Es tuyo el user_id? ─────────────────
SELECT id AS mi_user_id, email FROM auth.users ORDER BY created_at;

-- Si el user_id de Groupama no coincide con el tuyo, la fila existe pero RLS
-- la esconde. Arréglalo con:
--   UPDATE assets SET user_id = 'TU-UUID'
--   WHERE ticker = 'FR0000989626';

-- ── 3. CREARLA (con el user_id ya resuelto) ──
-- Rellena los tres números y ejecuta. Aquí el user_id se saca del activo que ya
-- tienes, así que no hay email que sustituir ni forma de equivocarse.
INSERT INTO assets (user_id, name, ticker, platform, type, category,
                    participaciones, coste_medio, aportado, valor_actual)
SELECT DISTINCT user_id,
       'Groupama Trésorerie IC',
       'FR0000989626',
       'MyInvestor',
       'Monetario',
       'RF',
       0,   -- participaciones ← RELLENAR (ojo: el NAV es ~44.500 €/participación,
            --                   así que serán decimales pequeños, tipo 0.0225)
       0,   -- coste_medio     ← RELLENAR (aportado / participaciones)
       0,   -- aportado        ← RELLENAR
       0    -- valor_actual    (lo recalcula el botón)
FROM assets
WHERE ticker = 'IE00BYX5NX33'
LIMIT 1;

-- ── 4. COMPROBAR ────────────────────────────
SELECT name, ticker, platform, type, category, participaciones, aportado
FROM assets
ORDER BY name;
