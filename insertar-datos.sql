-- ============================================
-- OJO: FICHERO SEMILLA, NO ES EL ESTADO ACTUAL
-- ============================================
-- Estos son los datos con los que se arrancó el proyecto. NO reflejan
-- lo que hay ahora: los meses y valores se han ido editando desde la app.
-- La verdad está en Supabase. Para ver el estado real:
--   SELECT * FROM assets ORDER BY platform, name;
--   SELECT * FROM fund_monthly ORDER BY month;
-- No vuelvas a ejecutar este fichero: empieza con DELETE y se lo llevaría todo.
-- ============================================

-- ============================================
-- PORTFOLIO TRACKER - INSERTAR DATOS REALES
-- ============================================
-- PASO 1: Ejecuta esto primero para obtener tu user_id:
--   SELECT id, email FROM auth.users;
-- Copia el UUID que aparece y reemplaza TODOS los
-- 'TU-USER-ID-AQUI' de abajo por ese UUID.
-- ============================================

-- Limpia datos anteriores si los hay (por si acaso)
DELETE FROM fund_monthly;
DELETE FROM assets;

-- ============================================
-- ASSETS
-- ============================================
INSERT INTO assets (user_id, name, ticker, platform, type, category, participaciones, coste_medio, aportado, valor_actual)
VALUES
  ('TU-USER-ID-AQUI', 'Fidelity MSCI World Index', 'IE00BYX5NX33', 'MyInvestor', 'Fondo', 'RV', 201.011, 12.29, 2470.00, 2652.02),
  ('TU-USER-ID-AQUI', 'Fidelity Emerging Markets', 'IE00BYX5M476', 'MyInvestor', 'Fondo', 'RV', 73.845, 7.31, 540.00, 616.01),
  ('TU-USER-ID-AQUI', 'MyInvestor Value Clase C', 'ES0165243025', 'MyInvestor', 'Fondo', 'RV', 289.845158, 1.15, 334.03, 354.75),
  ('TU-USER-ID-AQUI', 'Storm Bond Fund RC Eur', 'STORM-RF', 'MyInvestor', 'Fondo', 'RF', 16.317, 154.10, 2514.45, 2558.00),
  ('TU-USER-ID-AQUI', 'Amper S.A.', 'AMP', 'MyInvestor', 'Acción', 'RV', 7730, 0.14, 1097.05, 1430.05),
  ('TU-USER-ID-AQUI', 'Nueva Expresión Textil', 'NXT', 'MyInvestor', 'Acción', 'RV', 1390, 0.71, 988.88, 1224.59),
  ('TU-USER-ID-AQUI', 'OHLA', 'OHLA', 'MyInvestor', 'Acción', 'RV', 900, 0.43, 385.71, 426.42),
  ('TU-USER-ID-AQUI', 'Fidelity MSCI World Index', 'IE00BYX5NX33', 'Trade Republic', 'Fondo', 'RV', 11.778413, 12.74, 157.28, 155.40),
  ('TU-USER-ID-AQUI', 'MSCI Emerging Markets ETF', 'EM-ETF', 'Trade Republic', 'ETF', 'RV', 4.192533, 6.82, 31.75, 35.00),
  ('TU-USER-ID-AQUI', 'Bitcoin', 'BTC', 'Trade Republic', 'Crypto', 'RV', 0.000656, 0, 50.98, 57.09);

-- ============================================
-- FUND MONTHLY
-- ============================================
INSERT INTO fund_monthly (user_id, month, ap_msci, ap_emergentes, ap_clase_c, cartera_msci_em, cartera_clase_c)
VALUES
  ('TU-USER-ID-AQUI', '2025-08', 200,   37.5,  0,    237.50,  0),
  ('TU-USER-ID-AQUI', '2025-09', 200,   37.5,  0,    496.07,  0),
  ('TU-USER-ID-AQUI', '2025-10', 260,   37.5,  0,    804.82,  0),
  ('TU-USER-ID-AQUI', '2025-11', 200,   87.5,  0,    1142.59, 0),
  ('TU-USER-ID-AQUI', '2025-12', 300,   50,    0,    1497.63, 0),
  ('TU-USER-ID-AQUI', '2026-01', 300,   50,    0,    1884.66, 0),
  ('TU-USER-ID-AQUI', '2026-02', 320,   80,    0,    2331.58, 0),
  ('TU-USER-ID-AQUI', '2026-03', 320,   80,    324,  2625.97, 324),
  ('TU-USER-ID-AQUI', '2026-04', 320,   80,    100,  3326.49, 424);

-- ============================================
-- Verifica que se insertó todo correctamente:
-- SELECT COUNT(*) FROM assets;      -- debe ser 10
-- SELECT COUNT(*) FROM fund_monthly; -- debe ser 9
-- ============================================
