-- ============================================
-- ARREGLO: Asegurar constraint UNIQUE en fund_monthly
-- Ejecuta esto en Supabase → SQL Editor SI los datos
-- mensuales no se guardaban correctamente.
-- ============================================

-- 1. Comprueba si ya existe la constraint
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'fund_monthly'::regclass;

-- 2. Si NO aparece una constraint UNIQUE sobre (user_id, month),
--    ejecuta esta línea para crearla:
ALTER TABLE fund_monthly
  ADD CONSTRAINT fund_monthly_user_month_unique UNIQUE (user_id, month);

-- Si te da error "already exists", es que ya estaba bien, ignóralo.

-- ============================================
-- VERIFICACIÓN: comprueba tus datos
-- ============================================
-- Ver cuántos meses tienes guardados:
SELECT month, ap_msci, ap_emergentes, ap_clase_c, cartera_msci_em, cartera_clase_c
FROM fund_monthly
ORDER BY month;
