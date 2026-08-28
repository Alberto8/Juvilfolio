// Función serverless de Vercel: /api/history
// Devuelve el valor liquidativo MENSUAL (apertura y cierre) de cada fondo, para
// poder calcular participaciones compradas y valor de cartera mes a mes sin que
// el usuario tenga que teclearlo.
//
// POST { items: [{ id, ticker, name }], range?: '5y' }
//  →   { series: { <id>: { symbol, currency, months: { 'YYYY-MM': { open, close } } } } }

import { cors, parseBody, resolve, fetchMonthly } from './_yahoo.js';

export default async function handler(req, res) {
  if (!cors(req, res)) return;

  const body = parseBody(req);
  const items = body.items || [];
  const range = typeof body.range === 'string' ? body.range : '5y';

  const series = {};
  for (const item of items) {
    try {
      const s = await resolve(item, sym => fetchMonthly(sym, range));
      series[item.id] = s || { error: 'sin símbolo', months: {} };
    } catch (e) {
      series[item.id] = { error: e.message, months: {} };
    }
  }

  res.status(200).json({ series });
}
