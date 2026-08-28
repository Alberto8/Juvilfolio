-- ============================================
-- PLAN MENSUAL GENÉRICO: cualquier activo, cualquier plataforma
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- fund_monthly tenía una columna por fondo (ap_msci, ap_emergentes,
-- ap_clase_c), así que solo servía para esos tres y para MyInvestor.
-- Añadir Groupama y los dos de Trade Republic habría sido meter seis
-- columnas más, y el siguiente fondo otras dos.
--
-- Se pasa a una fila por (activo, mes). Así cada activo lleva su propia
-- aportación, y los de Trade Republic quedan separados de los de
-- MyInvestor aunque sean el mismo fondo: son filas distintas porque son
-- activos distintos.
--
-- fund_monthly NO se borra: queda como copia de seguridad. La app deja
-- de usarla.
-- ============================================

-- ── 1. Marcar qué activos son del plan mensual ──
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS plan_mensual boolean NOT NULL DEFAULT false;

-- Los dos Fidelity (en las dos plataformas), el Value Clase C y Groupama
UPDATE assets SET plan_mensual = true
WHERE ticker IN ('IE00BYX5NX33', 'IE00BYX5M476', 'ES0165243025', 'FR0000989626');

-- ── 2. Aportaciones por activo y mes ──
CREATE TABLE IF NOT EXISTS fund_contributions (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  month    text NOT NULL,                      -- 'YYYY-MM'
  aportado numeric NOT NULL DEFAULT 0,
  CONSTRAINT fund_contributions_unq UNIQUE (user_id, asset_id, month)
);

CREATE INDEX IF NOT EXISTS fund_contributions_user_month
  ON fund_contributions (user_id, month);

ALTER TABLE fund_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fund_contributions propias" ON fund_contributions;
CREATE POLICY "fund_contributions propias" ON fund_contributions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── 3. Traer el histórico de fund_monthly ──
-- Las tres columnas antiguas eran siempre de MyInvestor.
INSERT INTO fund_contributions (user_id, asset_id, month, aportado)
SELECT fm.user_id, a.id, fm.month, fm.ap_msci
FROM fund_monthly fm
JOIN assets a ON a.user_id = fm.user_id AND a.ticker = 'IE00BYX5NX33' AND a.platform = 'MyInvestor'
WHERE fm.ap_msci > 0
ON CONFLICT (user_id, asset_id, month) DO UPDATE SET aportado = EXCLUDED.aportado;

INSERT INTO fund_contributions (user_id, asset_id, month, aportado)
SELECT fm.user_id, a.id, fm.month, fm.ap_emergentes
FROM fund_monthly fm
JOIN assets a ON a.user_id = fm.user_id AND a.ticker = 'IE00BYX5M476' AND a.platform = 'MyInvestor'
WHERE fm.ap_emergentes > 0
ON CONFLICT (user_id, asset_id, month) DO UPDATE SET aportado = EXCLUDED.aportado;

INSERT INTO fund_contributions (user_id, asset_id, month, aportado)
SELECT fm.user_id, a.id, fm.month, fm.ap_clase_c
FROM fund_monthly fm
JOIN assets a ON a.user_id = fm.user_id AND a.ticker = 'ES0165243025' AND a.platform = 'MyInvestor'
WHERE fm.ap_clase_c > 0
ON CONFLICT (user_id, asset_id, month) DO UPDATE SET aportado = EXCLUDED.aportado;

-- ── 4. VERIFICACIÓN ──
-- Debe salir un activo por columna y los mismos meses que tenías.
SELECT c.month,
       a.name || ' (' || a.platform || ')' AS activo,
       c.aportado
FROM fund_contributions c
JOIN assets a ON a.id = c.asset_id
ORDER BY c.month, a.platform, a.name;

-- Cuadre contra la tabla vieja: las dos sumas deben coincidir.
SELECT
  (SELECT COALESCE(SUM(ap_msci + ap_emergentes + ap_clase_c), 0) FROM fund_monthly) AS total_viejo,
  (SELECT COALESCE(SUM(aportado), 0) FROM fund_contributions)                       AS total_nuevo;

-- ── 5. Quiénes están en el plan ──
SELECT name, platform, type, plan_mensual FROM assets ORDER BY plan_mensual DESC, name, platform;

-- Para añadir o quitar activos del plan puedes usar el check
-- "Aporto a este activo cada mes" en Cartera → clic en el activo.
