
## Cotizaciones en tiempo real (Yahoo Finance)

El botón "Actualizar cotizaciones" llama a una función serverless (`/api/quotes.js`)
que consulta Yahoo Finance desde el servidor de Vercel (sin problemas de CORS).

Calcula: **valor actual = precio actual × tus participaciones**

### Cobertura
- ✅ **Acciones españolas** (Amper, OHLA, Nueva Expresión Textil): funcionan vía Bolsa de Madrid (.MC)
- ✅ **Bitcoin**: precio en EUR
- ⚠️ **Fondos por ISIN** (Fidelity MSCI, Emergentes, MyInvestor Value): Yahoo cubre muchos
  pero no todos. Los que no encuentre, los editas a mano.
- ⚠️ **Storm Bond Fund** y **MSCI EM ETF**: tickers internos, puede que no estén en Yahoo.

Para los activos que Yahoo no encuentre, el mensaje te dirá cuántos quedaron sin datos
y podrás editarlos manualmente haciendo clic en cada activo en la pestaña Cartera.

### No requiere clave de API
Yahoo Finance se consulta con endpoints públicos, no necesitas registrarte ni pagar.
