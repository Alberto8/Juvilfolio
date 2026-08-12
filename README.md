
## Cotizaciones en tiempo real (Yahoo Finance)

El botón "Actualizar cotizaciones" llama a una función serverless (`/api/quotes.js`)
que consulta Yahoo Finance desde el servidor de Vercel (sin problemas de CORS).

Calcula: **valor actual = precio actual × tus participaciones**

### Cobertura
- ✅ **Acciones españolas** (Amper, OHLA, Nueva Expresión Textil): se consultan siempre con
  sufijo `.MC` (Bolsa de Madrid) **antes** de usar el buscador de Yahoo. Sin esto, tickers
  cortos como `AMP` o `NXT` devolvían homónimos de otras bolsas (AMP Limited en Australia,
  Nextracker en NYSE) y el valor de la cartera salía disparatado.
- ✅ **Bitcoin**: precio en EUR
- 🔒 **Fondos del plan mensual** (Fidelity MSCI, Emergentes, MyInvestor Value Clase C):
  no se consultan. Su aportado y su valor salen de la pestaña **Fondos Mensual**.
- ⚠️ **Fondos de Trade Republic**: son los mismos fondos que en MyInvestor (mismo ISIN,
  nombre, tipo y categoría), pero su valor no sale de Fondos Mensual — esa pestaña lleva
  solo el plan mensual de MyInvestor. Se actualizan por cotización o a mano.
- ⚠️ **Storm Bond Fund** (`STORM-RF`): ticker interno, puede que no esté en Yahoo.

### Filtros de seguridad
Una cotización se **descarta** (el activo se queda como estaba) si:
- viene en una divisa distinta de EUR → señal de que Yahoo resolvió otro valor, o
- el valor resultante supera el actual por más de ×2 (`MAX_JUMP`) → un salto así en una
  sola actualización no es mercado, es un símbolo mal resuelto.

El mensaje del botón detalla cuántos se actualizaron, cuántos se descartaron y por qué.
Los que Yahoo no encuentre se editan a mano haciendo clic en el activo en la pestaña Cartera.

### No requiere clave de API
Yahoo Finance se consulta con endpoints públicos, no necesitas registrarte ni pagar.
