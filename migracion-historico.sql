-- ============================================
-- HISTÓRICO AUTOMÁTICO DE TODA LA CARTERA
-- Ejecuta esto en Supabase → SQL Editor.
-- ============================================
-- Problema: fund_monthly solo guarda el plan mensual de MyInvestor
-- (MSCI, Emergentes, Clase C) porque lo rellenas tú a mano. De las
-- acciones, el Bitcoin, Storm y Groupama no hay ninguna historia, así
-- que no se puede calcular su rentabilidad por años.
--
-- Solución: cada vez que pulses "Actualizar cotizaciones", la app guarda
-- una foto de TODOS los activos (participaciones, aportado, valor y
-- precio unitario) con la fecha del día. Una fila por activo y día.
--
-- Al ser por día y no por mes, pulsar el botón varias veces en el mismo
-- mes no pierde nada: la fila del día se actualiza y las de días
-- anteriores se conservan. Para el resumen anual se toma la última foto
-- de cada año.
-- ============================================

CREATE TABLE IF NOT EXISTS asset_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Si assets.id NO es uuid en tu base (mira el bloque de comprobación
  -- de abajo), cambia este tipo por el que corresponda antes de ejecutar.
  asset_id        uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  taken_on        date NOT NULL DEFAULT CURRENT_DATE,
  participaciones numeric NOT NULL DEFAULT 0,
  aportado        numeric NOT NULL DEFAULT 0,
  valor_actual    numeric NOT NULL DEFAULT 0,
  precio          numeric,
  CONSTRAINT asset_snapshots_unq UNIQUE (user_id, asset_id, taken_on)
);

CREATE INDEX IF NOT EXISTS asset_snapshots_user_date
  ON asset_snapshots (user_id, taken_on);

-- ── Seguridad: cada usuario solo ve lo suyo ──
ALTER TABLE asset_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_snapshots propias" ON asset_snapshots;
CREATE POLICY "asset_snapshots propias" ON asset_snapshots
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── COMPROBACIÓN del tipo de assets.id ──
-- Debe decir 'uuid'. Si dice bigint o integer, borra la tabla
-- (DROP TABLE asset_snapshots) y vuelve a crearla cambiando el tipo
-- de asset_id arriba.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'assets' AND column_name = 'id';

-- ── VERIFICACIÓN ──
-- Vacía al principio. Se llena en cuanto pulses "Actualizar cotizaciones".
SELECT taken_on, COUNT(*) AS activos, SUM(aportado) AS aportado, SUM(valor_actual) AS valor
FROM asset_snapshots
GROUP BY taken_on
ORDER BY taken_on;
