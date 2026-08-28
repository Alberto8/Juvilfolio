
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

### Cómo se calcula cada campo
- `valor_actual` = **precio × participaciones**. Es lo único que sobrescribe el botón.
- `participaciones`: de los tres fondos del plan mensual las manda **Fondos Mensual**
  (ver más abajo). Del resto, las escribes tú.
- `aportado` es tuyo, salvo esos tres fondos, que toman el acumulado de Fondos Mensual.
- `coste_medio` es informativo, la app no lo usa. Por definición vale
  `aportado / participaciones`; si no cuadra, pasa `arreglar-coste-medio.sql`.

> **El fallo clásico:** `participaciones` se queda congelado. Aportas cada mes, lo anotas
> en Fondos Mensual, pero nadie actualiza el número de participaciones en `assets` — y
> como el valor es `precio × participaciones`, sale por debajo y la rentabilidad da
> negativa siendo positiva. Por eso los tres fondos del plan las derivan de las
> aportaciones y ya no se pueden desincronizar.

### Símbolos de fondos mapeados a mano
Yahoo identifica los fondos de inversión con códigos `0P...` y buscarlos por ISIN da
resultados inconsistentes. Los conocidos se resuelven en `api/quotes.js`, primero por
ticker/ISIN (`KNOWN`) y si no, por nombre (`KNOWN_NAMES`):

| ISIN / ticker | Símbolo Yahoo | Fondo |
|---|---|---|
| `IE00BYX5NX33` | `0P0001CLDK` | Fidelity MSCI World Index Fund EUR P Acc |
| `IE00BYX5M476` | `0P0001CJGK` | Fidelity MSCI Emerging Markets Index Fund EUR P Acc |
| `ES0165243025` | `0P0001T8V7` | MyInvestor Value Clase C |
| `STORM-RF` | `0P0000X09U` | Storm Bond Fund RC EUR |
| *(por nombre)* | `0P00000LRT` | Groupama Trésorerie IC |

Los dos ISIN de Fidelity sirven para las dos plataformas: es el mismo fondo, solo cambian
las participaciones. Si el símbolo mapeado falla, se recurre al buscador.

Groupama se resuelve por nombre porque su ISIN en la app aún no está fijado: da igual el
ticker que le pongas, mientras el nombre contenga "Groupama Trésorerie".

### No actualizar ciertos activos
**Ajustes → Actualización automática** lista todos los activos agrupados por plataforma con
un check cada uno. Desmarcado = la cotización no lo toca nunca (ni lo consulta), y en la
tabla de Cartera sale con un 🔒. Requiere `migracion-valores-manuales.sql`; si no se ha
pasado, el panel lo avisa y los checks salen deshabilitados en vez de romper el guardado.

## Pestaña Anualidades
Tres bloques, y cada uno dice de dónde salen sus datos porque no cubren lo mismo:

1. **Detalle** — foto de hoy: aportado, valor, ganancia, % y peso en cartera, con fila de
   total. Cubre *todos* los activos. Conmutador `Activo / Plataforma / Tipo / Categoría`
   para agregar por lo que interese; todas las columnas ordenan al hacer clic.
2. **Rentabilidad por activo** — barras horizontales del % de cada activo, de mejor a peor,
   verde/rojo según signo y el cero marcado.
3. **Por año** — una fila por año: aportado del año, valor al inicio, valor al final,
   ganancia y %. Sale del histórico de `fund_monthly`, así que **solo cubre MSCI,
   Emergentes y Clase C**; del resto de la cartera no hay historia. Conmutador
   `Total / MSCI / Emergentes / Clase C`.

La ganancia del año es `valor fin − valor inicio − aportado del año`, y el % se mide sobre
el capital empleado (`valor inicio + aportado del año`), no sobre el aportado total: si no,
un año con muchas aportaciones saldría artificialmente malo.

Los años incompletos se etiquetan con su rango de meses, p. ej. `2025 (ago–dic)`.

## Tipos de activo
`Fondo`, `Monetario`, `ETF`, `Acción`, `Crypto`. El tipo es informativo y agrupa en el
Dashboard y en Anualidades; la categoría (`RV` / `RF`) es la que reparte renta variable
frente a renta fija. Un fondo monetario va como tipo `Monetario` y categoría `RF`.

## Histórico automático (asset_snapshots)
`fund_monthly` solo cubre el plan mensual de MyInvestor porque se rellena a mano. De las
acciones, el Bitcoin, Storm y Groupama no había historia, así que su rentabilidad por años
era incalculable.

Ahora **cada pulsación de "Actualizar cotizaciones" guarda una foto de toda la cartera**:
una fila por activo y día en `asset_snapshots`, con participaciones, aportado, valor y
precio unitario. Basta con darle al botón el día 1 de cada mes para tener la serie.

- Granularidad **diaria**, no mensual: pulsar varias veces el mismo mes no pierde nada, se
  actualiza la fila de ese día y se conservan las anteriores.
- Para el resumen anual se toma la **última foto de cada año**.
- Se guarda el estado *efectivo* (con el aportado de Fondos Mensual ya aplicado), o sea lo
  mismo que ves en pantalla.
- En Anualidades → Por año aparece el modo **Cartera**, que usa estas fotos y cubre todos
  los activos. Los modos MSCI / Emergentes / Clase C siguen leyendo de `fund_monthly`.

Requiere `migracion-historico.sql`. Si no se ha pasado, `fetchSnapshots` avisa por consola
y devuelve vacío: la app funciona igual, solo que sin histórico nuevo.

### Automatizarlo del todo
Hoy la foto se guarda al pulsar el botón. Para que salga sola el día 1 haría falta un cron
de Vercel llamando a un endpoint con service key de Supabase — no está montado.

### Anualidades → desglose por año
Las filas de la tabla **Por año** son pulsables. Al elegir un año aparece debajo una
rejilla de mini gráficas, una por activo, con su valor de cierre mes a mes de ese año
(línea sólida) sobre lo aportado acumulado (línea de puntos), y en la cabecera lo que
ganó o perdió el activo en ese año.

De dónde saca los meses, en este orden:
1. Las fotos de `asset_snapshots` de ese año, tomando la **última de cada mes**. Cubre
   todos los activos, acciones incluidas.
2. Si de ese año todavía no hay fotos, cae al histórico manual de `fund_monthly` y muestra
   los tres fondos del plan. Así 2025 y 2026 tienen gráficas desde el primer día.


## Plan mensual: cualquier activo, cualquier plataforma
`fund_monthly` tenía una columna por fondo (`ap_msci`, `ap_emergentes`, `ap_clase_c`), así
que solo servía para esos tres y solo para MyInvestor. Sustituida por **`fund_contributions`**:
una fila por `(activo, mes)`. Añadir un fondo ya no toca el esquema, y el mismo fondo en dos
plataformas son dos filas porque son dos activos.

Qué activos entran lo marca el flag `assets.plan_mensual`, que se activa desde
**Cartera → clic en el activo → "Aporto a este activo cada mes"**.

Requiere `migracion-plan-mensual.sql`, que crea la tabla, marca los activos y **trae el
histórico** de `fund_monthly` (que se conserva como copia de seguridad, ya sin usar). Si la
tabla nueva no está, la pestaña avisa y deriva el histórico de la vieja para no perderlo de
vista.

### La tabla mensual
Columnas dinámicas: una por activo del plan en cada uno de los tres grupos —
**Aportación Mensual**, **Suma de aportaciones** y **Rentabilidad** — más una columna
**TOTAL** en cada grupo. Cada cabecera lleva el nombre corto del fondo y debajo la
plataforma (`MY` / `TR`) en el color de esa plataforma, así el mismo fondo en dos sitios
no se confunde. El formulario agrupa las casillas por plataforma y muestra el total del mes
en vivo.

### Solo se teclea lo aportado
Todo lo demás se calcula con el valor liquidativo mensual que sirve `/api/history`:

1. La aportación de cada mes compra participaciones al **NAV de apertura** del mes (se
   aporta a principio de mes, no al cierre).
2. El valor son las participaciones acumuladas por el **NAV de cierre**.
3. De ahí sale la rentabilidad, y de ahí salen también las `participaciones` de esos
   activos en Cartera — que es lo que arregla el valor.

Ese modelo se validó contra los datos reales: las participaciones calculadas a cierre de
abril-2026 daban 201,043 frente a las 201,011 apuntadas a mano, un 0,016 % de diferencia.
Comprar al NAV de cierre en vez de al de apertura se desviaba un 3-5 %.

El TOTAL de un mes compara solo contra lo aportado de los activos que **sí** tienen valor
liquidativo; si algún fondo no lo tiene, su aportación no entra en el cálculo de la
ganancia para no falsearla.

### `/api/history`
`POST { items: [{ id, ticker, name }], range }` → `{ series: { <id>: { symbol, currency,
months: { 'YYYY-MM': { open, close } } } } }`.

**Cuidado con el mes:** Yahoo devuelve el timestamp del bucket mensual como medianoche en
la zona del mercado, o sea 22:00 UTC del último día del mes *anterior*. Pasarlo a ISO
directamente lo etiqueta un mes antes; hay que sumar `meta.gmtoffset` primero. `_yahoo.js`
ya lo hace.

### Estructura de `api/`
- `_yahoo.js` — resolución de símbolos y llamadas a Yahoo, compartido. El `_` evita que
  Vercel lo publique como endpoint.
- `quotes.js` — precio actual de cada activo.
- `history.js` — serie mensual de valor liquidativo.

En desarrollo, el plugin `apiDev` de `vite.config.js` monta automáticamente todos los
`api/*.js` (saltándose los `_`) en el dev server, así que `npm run dev` da la app completa.

## Temas claro y oscuro
`src/theme.js` centraliza los dos temas. Toda la paleta vive en `PAL.dark` / `PAL.light`;
`css(P)` genera la hoja de estilos de las clases y los estilos en línea leen la paleta
activa desde `P`.

`P` es una variable mutable de módulo que `App` reasigna en cada render según el tema
elegido, antes de renderizar los hijos. Así los componentes de `App.jsx` la leen ya
actualizada sin necesidad de contexto ni de pasarla por props.

Se alterna con el botón ☀️/🌙 de la cabecera y se guarda en `localStorage` (`pt-theme`).

**Dos detalles al tocar colores:**
- Los colores de acento (`ac`, `up`, `msc`, `clc`…) tienen que ser **hex de 6 dígitos**: el
  código los concatena con alfa (`P.msc + "12"`) para los fondos tenues, y eso solo
  funciona con hex, no con `rgba()` ni `var()`.
- Los tooltips de recharts necesitan `labelStyle` e `itemStyle` explícitos (helper `TIP()`).
  Sin ellos usa su gris oscuro por defecto y sobre el tema oscuro no se lee nada.

## Anualidades: el año filtra todo
La tabla **Por año** está arriba y es el selector. La fila **TOTAL** viene marcada por
defecto; al pulsar un año, los KPIs, la tabla de detalle, la gráfica de barras y las mini
gráficas mes a mes se recalculan sobre ese año.

En un año, cada fila del detalle muestra valor al empezar, aportado del año, valor al
cerrar y la ganancia del tramo. La serie histórica sale de `asset_snapshots` si hay fotos
(cubre toda la cartera) y si no de `fund_monthly` (solo los tres fondos del plan), y el pie
de la pestaña dice cuál se está usando.
