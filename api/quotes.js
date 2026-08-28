// Función serverless de Vercel: /api/quotes
// Consulta precios reales desde Yahoo Finance del lado del servidor (sin CORS).
// El frontend hace POST con { items: [{ id, ticker, name, type }] }
// y recibe { results: [{ id, symbol, price, currency }] }

import { cors, parseBody, resolve, fetchPrice } from './_yahoo.js';

export default async function handler(req, res) {
  if (!cors(req, res)) return;

  const items = parseBody(req).items || [];
  const results = [];
  for (const item of items) {
    try {
      const q = await resolve(item, fetchPrice);
      if (!q || !q.price || q.price <= 0) { results.push({ id: item.id, price: null, error: 'sin símbolo' }); continue; }
      results.push({ id: item.id, symbol: q.symbol, price: q.price, currency: q.currency });
    } catch (e) {
      results.push({ id: item.id, price: null, error: e.message });
    }
  }

  res.status(200).json({ results });
}
