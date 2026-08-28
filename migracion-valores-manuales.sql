-- ============================================
-- MIGRACIÓN: no actualizar ciertos activos
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- El botón "Actualizar cotizaciones" recalcula
--   valor_actual = precio de Yahoo × participaciones
-- y sobrescribe lo que hubiera. Esta columna permite marcar activos que
-- llevas a mano: si manual = true, la actualización los salta y no los
-- toca nunca.
--
-- Todo empieza a false, así que nada cambia hasta que marques algo en
-- Ajustes → Actualización automática.
-- ============================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

-- ── VERIFICACIÓN ──
SELECT name, platform, type, participaciones, aportado, valor_actual, manual
FROM assets
ORDER BY platform, name;
