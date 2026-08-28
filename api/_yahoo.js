// Código compartido por /api/quotes y /api/history.
// El prefijo _ evita que Vercel lo publique como endpoint propio.

const YF_SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';
const YF_CHART = 'https://query2.finance.yahoo.com/v8/finance/chart/';
export const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

// Símbolos de Yahoo conocidos, por ticker/ISIN del activo.
// Yahoo identifica los fondos de inversión con códigos 0P...; buscarlos por ISIN
// da resultados inconsistentes (o ninguno), así que se mapean a mano.
// OJO: el código 0P a secas devuelve 404. Hay que pedirlo con sufijo de mercado
// (.F, Frankfurt), que es como Yahoo los publica. Se prueban ambos por si acaso.
const KNOWN = {
  IE00BYX5NX33: '0P0001CLDK', // Fidelity MSCI World Index Fund EUR P Acc
  IE00BYX5M476: '0P0001CJGK', // Fidelity MSCI Emerging Markets Index Fund EUR P Acc
  ES0165243025: '0P0001T8V7', // MyInvestor Value Clase C
  'STORM-RF':   '0P0000X09U', // Storm Bond Fund RC EUR
  FR0000989626: '0P00000LRT', // Groupama Trésorerie IC
};

// Respaldo por nombre, para fondos cuyo ticker/ISIN en la app aún no se conoce
const KNOWN_NAMES = [
  [/groupama\s+tr[eé]sorerie/i, '0P00000LRT'], // Groupama Trésorerie IC
  [/storm\s+bond/i,             '0P0000X09U'], // Storm Bond Fund RC EUR
  [/myinvestor\s+value/i,       '0P0001T8V7'], // MyInvestor Value Clase C
];

function knownSymbol(item, up) {
  if (KNOWN[up]) return KNOWN[up];
  const name = item.name || '';
  for (const [re, sym] of KNOWN_NAMES) if (re.test(name)) return sym;
  return null;
}

// Resolver el identificador (ISIN, ticker o nombre) a un símbolo de Yahoo
export async function searchSymbol(query) {
  try {
    const url = `${YF_SEARCH}?q=${encodeURIComponent(query)}&quotesCount=3&newsCount=0`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const data = await r.json();
    const withSym = (data?.quotes || []).filter(q => q.symbol);
    if (!withSym.length) return null;
    // Priorizar bolsas españolas (.MC) si las hay
    const mc = withSym.find(q => q.symbol.endsWith('.MC'));
    return (mc || withSym[0]).symbol;
  } catch {
    return null;
  }
}

// Candidatos de símbolo de Yahoo para un activo, en orden de preferencia
export async function candidateSymbols(item) {
  const t = (item.ticker || '').trim();
  const up = t.toUpperCase();

  // Bitcoin → precio en EUR
  if (up === 'BTC' || /bitcoin/i.test(item.name || '')) return ['BTC-EUR'];

  // Símbolo conocido: se prueba con sufijo y sin él, y el buscador queda de respaldo
  const known = knownSymbol(item, up);
  if (known) {
    const cands = [known + '.F', known];
    const s = await searchSymbol(ISIN_RE.test(up) ? up : (item.name || t));
    if (s && !cands.includes(s)) cands.push(s);
    return cands;
  }

  // Si parece un ISIN, buscarlo
  if (ISIN_RE.test(up)) {
    const s = await searchSymbol(up);
    return s ? [s] : [];
  }

  // Tickers internos sin equivalente en Yahoo: buscar por nombre
  if (up === 'STORM-RF' || up === 'EM-ETF') {
    const s = await searchSymbol(item.name || t);
    return s ? [s] : [];
  }

  // Acción española: el sufijo .MC (mercado continuo) se prueba SIEMPRE primero.
  // El buscador de Yahoo devuelve homónimos de otras bolsas para tickers cortos
  // (AMP → AMP.AX de Australia, NXT → Nextracker en NYSE) y su precio, aplicado
  // a las participaciones, falsea por completo el valor de la cartera.
  const cands = [];
  if (/^[A-Z]{1,5}$/.test(up)) cands.push(up + '.MC');
  const s = await searchSymbol(t);
  if (s && !cands.includes(s)) cands.push(s);
  return cands;
}

// Precio actual
export async function fetchPrice(symbol) {
  const url = `${YF_CHART}${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('chart ' + r.status);
  const res = (await r.json())?.chart?.result?.[0];
  const meta = res?.meta;
  if (!meta) throw new Error('sin datos');
  return {
    price: meta.regularMarketPrice ?? meta.previousClose ?? null,
    currency: meta.currency || 'EUR',
    symbol: meta.symbol || symbol,
  };
}

// Serie mensual (apertura y cierre de cada mes).
//
// CUIDADO con el mes: Yahoo devuelve el timestamp del bucket como medianoche en
// la zona del mercado, o sea 22:00 UTC del último día del mes ANTERIOR. Pasarlo a
// ISO directamente lo etiquetaría un mes antes, así que hay que sumar gmtoffset.
export async function fetchMonthly(symbol, range = '5y') {
  const url = `${YF_CHART}${encodeURIComponent(symbol)}?interval=1mo&range=${range}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error('chart ' + r.status);
  const res = (await r.json())?.chart?.result?.[0];
  const meta = res?.meta;
  if (!meta || !res.timestamp) throw new Error('sin datos');
  const off = meta.gmtoffset || 0;
  const q = res.indicators?.quote?.[0] || {};
  const months = {};
  for (let i = 0; i < res.timestamp.length; i++) {
    const open = q.open?.[i], close = q.close?.[i];
    if (open == null && close == null) continue;
    const mes = new Date((res.timestamp[i] + off) * 1000).toISOString().slice(0, 7);
    months[mes] = { open: open ?? close, close: close ?? open };
  }
  return { symbol: meta.symbol || symbol, currency: meta.currency || 'EUR', months };
}

// Primer candidato que devuelve datos, prefiriendo EUR
export async function resolve(item, fn) {
  const cands = await candidateSymbols(item);
  let fallback = null;
  for (const sym of cands) {
    try {
      const out = await fn(sym);
      if (!out) continue;
      if (out.currency === 'EUR') return out;
      if (!fallback) fallback = out;
    } catch {
      // símbolo inválido o sin datos: probar el siguiente candidato
    }
  }
  return fallback;
}

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return false; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  return true;
}

export function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  return body || {};
}
