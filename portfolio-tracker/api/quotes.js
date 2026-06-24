// Función serverless de Vercel: /api/quotes
// Consulta precios reales desde Yahoo Finance del lado del servidor (sin CORS).
// El frontend hace POST con { items: [{ id, ticker, type }] }
// y recibe { results: [{ id, symbol, price, currency }] }

const YF_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const YF_CHART = 'https://query2.finance.yahoo.com/v8/finance/chart/';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

// Resolver el identificador (ISIN, ticker o nombre) a un símbolo de Yahoo
async function searchSymbol(query) {
  try {
    const url = `${YF_SEARCH}?q=${encodeURIComponent(query)}&quotesCount=3&newsCount=0`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const data = await r.json();
    const quotes = data?.quotes || [];
    // Preferir resultados con símbolo y, si es posible, de mercados EUR
    const withSym = quotes.filter(q => q.symbol);
    if (!withSym.length) return null;
    // Priorizar bolsas españolas (.MC) si las hay
    const mc = withSym.find(q => q.symbol.endsWith('.MC'));
    return (mc || withSym[0]).symbol;
  } catch {
    return null;
  }
}

// Obtener precio actual desde el endpoint chart
async function fetchPrice(symbol) {
  const url = `${YF_CHART}${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('chart ' + r.status);
  const data = await r.json();
  const res = data?.chart?.result?.[0];
  const meta = res?.meta;
  if (!meta) throw new Error('sin datos');
  const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
  return { price, currency: meta.currency || 'EUR', symbol: meta.symbol || symbol };
}

// Determinar el símbolo de Yahoo según el activo
async function resolveSymbol(item) {
  const t = (item.ticker || '').trim();

  // Bitcoin → precio en EUR
  if (t.toUpperCase() === 'BTC' || /bitcoin/i.test(item.name || '')) return 'BTC-EUR';

  // Si parece un ISIN, buscarlo
  if (ISIN_RE.test(t)) {
    const s = await searchSymbol(t);
    if (s) return s;
  }

  // Tickers internos sin equivalente en Yahoo
  if (t === 'STORM-RF' || t === 'EM-ETF') {
    // Intentar buscar por nombre como último recurso
    const s = await searchSymbol(item.name || t);
    if (s) return s;
    return null;
  }

  // Acción española: probar buscar el ticker y, si falla, añadir .MC
  const s = await searchSymbol(t);
  if (s) return s;
  return t + '.MC';
}

export default async function handler(req, res) {
  // CORS por si se llama desde otro origen (normalmente mismo dominio)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const items = body?.items || [];

  const results = [];
  for (const item of items) {
    try {
      const symbol = await resolveSymbol(item);
      if (!symbol) { results.push({ id: item.id, price: null, error: 'sin símbolo' }); continue; }
      const { price, currency, symbol: finalSym } = await fetchPrice(symbol);
      results.push({ id: item.id, symbol: finalSym, price, currency });
    } catch (e) {
      results.push({ id: item.id, price: null, error: e.message });
    }
  }

  res.status(200).json({ results });
}
