import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, LineChart } from "recharts";
import { supabase } from './supabase';
import * as db from './db';

const PC = { MyInvestor: "#0ea5e9", "Trade Republic": "#ff6b35" };
const CG = { RV: "#a78bfa", RF: "#34d399" };
const TC = { Fondo: "#60a5fa", ETF: "#a78bfa", "Acción": "#f472b6", Crypto: "#fbbf24" };
// Tope de subida aceptable en una actualización de cotizaciones (×2 = +100%)
const MAX_JUMP = 2;
const ME = "#34d399";
const CLC = "#fbbf24";
// Cabecera de grupo (superclase) y separador entre grupos en la tabla mensual
const GH = { textAlign: "center", cursor: "default", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,.12)" };
const GSEP = { borderLeft: "1px solid rgba(148,163,184,.14)" };
const fE = v => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
const fP = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fMN = m => { const n = new Date(m + "-01").toLocaleDateString("es-ES", { month: "short", year: "numeric" }); return n.charAt(0).toUpperCase() + n.slice(1); };
const rc = v => v >= 0 ? "#34d399" : "#f87171";

function enrichFM(raw) {
  let cM = 0, cE = 0, cC = 0;
  return raw.map(m => {
    cM += m.apMsci; cE += m.apEm; cC += m.apClaseC;
    const cME = cM + cE;
    const effC = m.carteraC > 0 ? m.carteraC : (cC > 0 ? cC : 0);
    const gME = m.carteraME > 0 ? m.carteraME - cME : 0;
    const gC = effC > 0 && cC > 0 ? effC - cC : 0;
    const rME = cME > 0 && m.carteraME > 0 ? (gME / cME) * 100 : 0;
    const rC = cC > 0 && effC > 0 ? (gC / cC) * 100 : 0;
    return { ...m, cM, cE, cC, cME, effC, gME, gC, gT: gME + gC, rME, rC };
  });
}

// Los fondos de RV del plan mensual llevan su aportación real en "Fondos Mensual";
// ese acumulado manda sobre el campo manual del activo.
const FM_ACUM = {
  "IE00BYX5NX33|MyInvestor": "cM", // Fidelity MSCI World Index
  "IE00BYX5M476|MyInvestor": "cE", // Fidelity Emerging Markets
  "ES0165243025|MyInvestor": "cC", // MyInvestor Value Clase C
};

function enrichAssets(assets, efm) {
  const last = efm.length ? efm[efm.length - 1] : null;
  if (!last) return assets;
  return assets.map(a => {
    const k = FM_ACUM[a.ticker + "|" + a.platform];
    const ap = k ? last[k] : 0;
    if (!ap || ap <= 0) return a;
    const ge = Math.round((a.valorActual - ap) * 100) / 100;
    return { ...a, aportado: ap, gananciaEur: ge, gananciaPct: Math.round((ge / ap) * 10000) / 100, apFM: true };
  });
}

function useSort(dk, dd) {
  const [sk, setSk] = useState(dk); const [sd, setSd] = useState(dd);
  return { toggle: k => { if (sk === k) setSd(-sd); else { setSk(k); setSd(1); } }, arrow: k => sk === k ? (sd === 1 ? " ▲" : " ▼") : "", sortFn: (a, b) => { const va = a[sk] ?? 0, vb = b[sk] ?? 0; return typeof va === "string" ? va.localeCompare(vb) * sd : (va - vb) * sd; } };
}

function F({ l, children }) { return <div style={{ marginBottom: 4 }}><label style={{ fontSize: 10, color: "#4b5563", display: "block", marginBottom: 2 }}>{l}</label>{children}</div>; }
function Modal({ onClose, title, children }) { return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}><div style={{ background: "#1a2540", border: "1px solid rgba(148,163,184,.1)", borderRadius: 16, padding: 22, maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}><h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>{title}</h3><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div></div></div>; }

const CSS = `
  *{box-sizing:border-box}
  body{margin:0}
  .cd{background:rgba(22,33,55,.65);border:1px solid rgba(148,163,184,.08);border-radius:14px;padding:18px}
  .tb{padding:8px 12px;border:none;background:0;color:#64748b;cursor:pointer;font-size:12px;font-weight:500;border-radius:8px;transition:.2s;white-space:nowrap}
  .tb:hover{background:rgba(148,163,184,.08);color:#cbd5e1}
  .tb.ac{background:rgba(99,102,241,.15);color:#818cf8}
  .ip{background:rgba(10,18,32,.8);border:1px solid rgba(148,163,184,.12);border-radius:8px;padding:8px 11px;color:#e2e8f0;font-size:13px;width:100%;outline:0}
  select.ip{appearance:none}
  .bp{background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px}
  .bp:disabled{opacity:.6;cursor:wait}
  .bs{background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.1);color:#94a3b8;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px}
  .bd{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.15);color:#f87171;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:10px}
  .bg{display:inline-block;padding:3px 6px;border-radius:4px;font-size:9px;font-weight:600;text-transform:uppercase}
  .asset-row{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid rgba(148,163,184,.06);gap:8px}
  .asset-row:last-child{border-bottom:none}
  .shdr{padding:5px 8px;background:rgba(148,163,184,.06);border-radius:5px;font-size:9px;font-weight:600;color:#94a3b8;margin:8px 0 3px;text-transform:uppercase}
  .rtable{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .rtable table{width:100%;border-collapse:collapse;min-width:500px}
  .rtable th{padding:8px 10px;text-align:left;font-size:9px;font-weight:600;color:#4b5563;text-transform:uppercase;letter-spacing:.5px;background:rgba(10,18,32,.25);white-space:nowrap;cursor:pointer;user-select:none}
  .rtable th:hover{color:#cbd5e1}
  .rtable td{padding:9px 10px;font-size:11px;border-bottom:1px solid rgba(148,163,184,.04);vertical-align:middle}
  .rtable tr:hover td{background:rgba(148,163,184,.03)}
  .mob-card{display:none}
  @media(max-width:640px){
    .rtable{display:none}
    .mob-card{display:block}
    .mob-item{background:rgba(22,33,55,.5);border:1px solid rgba(148,163,184,.08);border-radius:10px;padding:12px;margin-bottom:8px}
    .mob-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px}
    .mob-lbl{color:#4b5563;font-size:10px}
  }
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .pu{animation:pulse 1.2s ease-in-out infinite}
`;

export default function App({ session }) {
  const [tab, setTab] = useState("Dashboard");
  const [assets, setAssets] = useState([]);
  const [fm, setFm] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [lastUp, setLastUp] = useState(null);
  const [quoteMsg, setQuoteMsg] = useState(null);
  const [err, setErr] = useState(null);
  const init = useRef(false);

  useEffect(() => {
    if (init.current) return;
    init.current = true;
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const [a, f] = await Promise.all([db.fetchAssets(), db.fetchFundMonthly()]);
      setAssets(a);
      setFm(f);
    } catch (e) {
      setErr("Error al cargar datos: " + e.message);
    }
    setLoading(false);
  }

  async function saveAsset(asset) {
    try {
      const data = await db.upsertAsset(asset);
      const saved = data?.[0];
      if (!saved) throw new Error("No se recibió confirmación de la base de datos");
      const mapped = { ...asset, id: saved.id, gananciaEur: parseFloat(saved.ganancia_eur), gananciaPct: parseFloat(saved.ganancia_pct) };
      setAssets(prev => { const e = prev.find(a => a.id === asset.id); return e ? prev.map(a => a.id === asset.id ? mapped : a) : [...prev, mapped]; });
    } catch (e) {
      alert("Error guardando el activo: " + e.message);
      console.error("saveAsset error:", e);
    }
  }

  async function removeAsset(id) {
    try { await db.deleteAsset(id); setAssets(prev => prev.filter(a => a.id !== id)); }
    catch (e) { alert("Error eliminando: " + e.message); }
  }

  async function saveFM(entry) {
    try {
      const data = await db.upsertFundMonth(entry);
      const saved = data?.[0];
      if (!saved) throw new Error("No se recibió confirmación de la base de datos");
      setFm(prev => {
        const arr = [...prev];
        const idx = arr.findIndex(m => m.month === entry.month);
        const mapped = { ...entry, id: saved.id };
        if (idx >= 0) arr[idx] = mapped; else arr.push(mapped);
        return arr.sort((a, b) => a.month.localeCompare(b.month));
      });
    } catch (e) {
      alert("Error guardando el mes: " + e.message);
      console.error("saveFM error:", e);
    }
  }

  async function removeFM(id, month) {
    try { await db.deleteFundMonth(id); setFm(prev => prev.filter(m => m.month !== month)); }
    catch (e) { alert("Error eliminando mes: " + e.message); }
  }

  const fetchQuotes = useCallback(async () => {
    if (!assets.length) return;
    setFetching(true);
    setQuoteMsg(null);
    try {
      const items = assets.map(a => ({ id: a.id, ticker: a.ticker, name: a.name, type: a.type }));
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
      });
      if (!res.ok) throw new Error("El servidor devolvió " + res.status);
      const data = await res.json();
      const results = data?.results || [];

      const updates = [];
      let ok = 0, fail = 0;
      const bad = [];
      const updated = assets.map(a => {
        const r = results.find(x => x.id === a.id);
        if (!r || !r.price || r.price <= 0) { fail++; return a; }
        // Un precio en otra divisa significa que Yahoo devolvió un homónimo de otra bolsa
        if (r.currency && r.currency !== "EUR") { bad.push(a.name); return a; }
        // valorActual = precio actual × participaciones
        const va = Math.round(r.price * a.participaciones * 100) / 100;
        // Descartar saltos imposibles en una sola actualización: no son mercado, es un símbolo mal resuelto
        if (a.valorActual > 0 && va > a.valorActual * MAX_JUMP) { bad.push(a.name); return a; }
        const ge = Math.round((va - a.aportado) * 100) / 100;
        const gp = a.aportado > 0 ? Math.round((ge / a.aportado) * 10000) / 100 : 0;
        updates.push({ id: a.id, valorActual: va });
        ok++;
        return { ...a, valorActual: va, gananciaEur: ge, gananciaPct: gp };
      });
      setAssets(updated);
      if (updates.length) await db.bulkUpdateAssetValues(updates);
      setLastUp(new Date().toLocaleString("es-ES"));
      setQuoteMsg([
        `${ok} activos actualizados`,
        bad.length ? `${bad.length} descartados por precio anómalo (${bad.join(", ")})` : null,
        fail ? `${fail} sin datos (edítalos a mano)` : null,
      ].filter(Boolean).join(" · "));
    } catch (e) {
      console.error("fetchQuotes:", e);
      setQuoteMsg("Error al actualizar: " + e.message);
    }
    setFetching(false);
  }, [assets]);

  const efm = useMemo(() => enrichFM(fm), [fm]);
  // Vista de activos con el aportado de los fondos mensuales ya aplicado
  const av = useMemo(() => enrichAssets(assets, efm), [assets, efm]);
  const tI = useMemo(() => av.reduce((s, a) => s + a.aportado, 0), [av]);
  const tV = useMemo(() => av.reduce((s, a) => s + a.valorActual, 0), [av]);
  const tG = tV - tI;
  const plats = useMemo(() => { const r = {}; av.forEach(a => { if (!r[a.platform]) r[a.platform] = { assets: [], ap: 0, va: 0 }; r[a.platform].assets.push(a); r[a.platform].ap += a.aportado; r[a.platform].va += a.valorActual; }); return r; }, [av]);
  const byType = useMemo(() => { const r = {}; av.forEach(a => { if (!r[a.type]) r[a.type] = { ap: 0, va: 0 }; r[a.type].ap += a.aportado; r[a.type].va += a.valorActual; }); return r; }, [av]);
  const byCat = useMemo(() => { const r = {}; av.forEach(a => { if (!r[a.category]) r[a.category] = { ap: 0, va: 0 }; r[a.category].ap += a.aportado; r[a.category].va += a.valorActual; }); return r; }, [av]);

  const TABS = ["Dashboard", "Cartera", "Fondos Mensual", "Comparativa", "Ajustes"];

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0b0f1a", color: "#64748b", fontFamily: "system-ui" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>Cargando tu cartera desde Supabase...</div></div>;

  if (err) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0b0f1a", color: "#f87171", fontFamily: "system-ui", flexDirection: "column", gap: 12 }}><div>{err}</div><button onClick={loadAll} style={{ background: "#6366f1", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>Reintentar</button></div>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#0b0f1a,#101729,#0d1321)", color: "#e2e8f0", fontFamily: "system-ui,sans-serif" }}>
      <style>{CSS}</style>
      <header style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderBottom: "1px solid rgba(148,163,184,.06)" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, fontStyle: "italic", background: "linear-gradient(135deg,#818cf8,#34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Portfolio Tracker</h1>
          <div style={{ fontSize: 9, color: "#374151" }}>{session?.user?.email}</div>
        </div>
        <div style={{ display: "flex", gap: 2, background: "rgba(10,18,32,.5)", padding: 3, borderRadius: 8, flexWrap: "wrap" }}>
          {TABS.map(t => <button key={t} className={"tb" + (tab === t ? " ac" : "")} onClick={() => setTab(t)}>{t}</button>)}
          <button className="tb" style={{ color: "#f87171" }} onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main style={{ padding: "14px 16px 40px" }}>
        {tab === "Dashboard" && <Dash assets={av} plats={plats} byType={byType} byCat={byCat} tI={tI} tV={tV} tG={tG} efm={efm} fe={fetching} fq={fetchQuotes} lu={lastUp} qmsg={quoteMsg} />}
        {tab === "Cartera" && <Cart assets={av} saveAsset={saveAsset} removeAsset={removeAsset} fe={fetching} fq={fetchQuotes} lu={lastUp} />}
        {tab === "Fondos Mensual" && <FondosM fm={fm} efm={efm} saveFM={saveFM} removeFM={removeFM} />}
        {tab === "Comparativa" && <Comp efm={efm} />}
        {tab === "Ajustes" && <Sett loadAll={loadAll} session={session} />}
      </main>
    </div>
  );
}

function KPICard({ label, labelColor, value, gain, pct, invested }) {
  return (
    <div className="cd" style={{ borderTop: labelColor ? `3px solid ${labelColor}` : undefined }}>
      <div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontFamily: "monospace", fontWeight: 700 }}>{fE(value)}</div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: rc(gain) }}>{fE(gain)} ({fP(pct)})</div>
      {invested !== undefined && <div style={{ fontSize: 9, color: "#374151", marginTop: 3 }}>Invertido: {fE(invested)}</div>}
    </div>
  );
}

function Dash({ assets, plats, byType, byCat, tI, tV, tG, efm, fe, fq, lu, qmsg }) {
  const cd = efm.filter(m => m.cME > 0).map(m => ({ label: fMN(m.month), aportado: m.cME + m.cC, cartera: m.carteraME + m.effC }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cd" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Cotizaciones en tiempo real</div>
          <div style={{ fontSize: 9, color: qmsg ? (qmsg.startsWith("Error") ? "#f87171" : "#34d399") : "#4b5563" }}>{qmsg || (lu ? "Actualizado: " + lu : "Sin actualizar — pulsa para buscar precios actuales")}</div>
        </div>
        <button className={"bp" + (fe ? " pu" : "")} onClick={fq} disabled={fe}>{fe ? "🔍 Buscando precios..." : "🔄 Actualizar cotizaciones"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div className="cd"><div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Total Invertido</div><div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color: "#818cf8" }}>{fE(tI)}</div></div>
        <div className="cd"><div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Valor Actual</div><div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700 }}>{fE(tV)}</div></div>
        <div className="cd"><div style={{ fontSize: 9, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Rentabilidad Total</div><div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: rc(tG) }}>{fE(tG)}</div><div style={{ fontSize: 12, fontFamily: "monospace", color: rc(tG) }}>{fP(tI > 0 ? (tG / tI) * 100 : 0)}</div></div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Por Plataforma</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        {Object.entries(plats).map(([p, d]) => { const g = d.va - d.ap; return <KPICard key={p} label={p} labelColor={PC[p]} value={d.va} gain={g} pct={d.ap > 0 ? (g / d.ap) * 100 : 0} invested={d.ap} />; })}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Por Categoría (RV / RF)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        {Object.entries(byCat).map(([cat, d]) => { const g = d.va - d.ap; return <KPICard key={cat} label={cat === "RV" ? "Renta Variable" : "Renta Fija"} labelColor={CG[cat]} value={d.va} gain={g} pct={d.ap > 0 ? (g / d.ap) * 100 : 0} invested={d.ap} />; })}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>Por Tipo de Activo</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        {Object.entries(byType).map(([type, d]) => { const g = d.va - d.ap; return <KPICard key={type} label={type} labelColor={TC[type]} value={d.va} gain={g} pct={d.ap > 0 ? (g / d.ap) * 100 : 0} invested={d.ap} />; })}
      </div>

      {Object.entries(plats).map(([p, d]) => {
        const cats = {}; d.assets.forEach(a => { const k = a.category + "|" + a.type; if (!cats[k]) cats[k] = { c: a.category, t: a.type, i: [] }; cats[k].i.push(a); });
        return (
          <div key={p} className="cd" style={{ borderLeft: "3px solid " + (PC[p] || "#6366f1") }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>{p}</div>
            {Object.values(cats).map(c => (
              <div key={c.c + c.t}>
                <div className="shdr">{c.c === "RV" ? "RV" : "RF"} — {c.t}</div>
                {c.i.map(a => (
                  <div key={a.id} className="asset-row">
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12 }}>{a.name}</div><div style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace" }}>{a.participaciones} part.</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700 }}>{fE(a.valorActual)}</div><div style={{ fontSize: 11, fontFamily: "monospace", color: rc(a.gananciaEur) }}>{fE(a.gananciaEur)} ({fP(a.gananciaPct)})</div></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {cd.length > 0 && <div className="cd"><div style={{ fontSize: 8, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Evolución</div><div style={{ height: 200 }}><ResponsiveContainer><AreaChart data={cd}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={.2} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity={.15} /><stop offset="100%" stopColor="#818cf8" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.05)" /><XAxis dataKey="label" tick={{ fill: "#374151", fontSize: 9 }} /><YAxis tick={{ fill: "#374151", fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(1) + "k"} /><Tooltip contentStyle={{ background: "#1a2540", border: "1px solid rgba(148,163,184,.12)", borderRadius: 8, fontSize: 10 }} formatter={v => fE(v)} /><Legend wrapperStyle={{ fontSize: 9 }} /><Area type="monotone" dataKey="aportado" name="Aportado" stroke="#818cf8" fill="url(#g2)" strokeWidth={2} /><Area type="monotone" dataKey="cartera" name="Cartera" stroke="#34d399" fill="url(#g1)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div>}
    </div>
  );
}

function Cart({ assets, saveAsset, removeAsset, fe, fq, lu }) {
  const [sh, setSh] = useState(false); const [eId, setEId] = useState(null);
  const [f, sF] = useState({ name: "", ticker: "", platform: "MyInvestor", type: "Fondo", category: "RV", participaciones: "", costeMedio: "", aportado: "", valorActual: "" });
  const s = useSort("name", 1); const sorted = [...assets].sort(s.sortFn);
  function openEdit(a) { setEId(a.id); sF({ name: a.name, ticker: a.ticker, platform: a.platform, type: a.type, category: a.category, participaciones: String(a.participaciones), costeMedio: String(a.costeMedio), aportado: String(a.aportado), valorActual: String(a.valorActual), apFM: !!a.apFM }); setSh(true); }
  async function save() { const ap = parseFloat(f.aportado) || 0; const va = parseFloat(f.valorActual) || 0; await saveAsset({ id: eId || ("temp-" + Date.now()), name: f.name, ticker: f.ticker, platform: f.platform, type: f.type, category: f.category, participaciones: parseFloat(f.participaciones) || 0, costeMedio: parseFloat(f.costeMedio) || 0, aportado: ap, valorActual: va, gananciaEur: va - ap, gananciaPct: ap > 0 ? ((va - ap) / ap) * 100 : 0 }); sF({ name: "", ticker: "", platform: "MyInvestor", type: "Fondo", category: "RV", participaciones: "", costeMedio: "", aportado: "", valorActual: "" }); setEId(null); setSh(false); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Mi Cartera</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lu && <span style={{ fontSize: 9, color: "#4b5563", alignSelf: "center" }}>Act: {lu}</span>}
          <button className={"bs" + (fe ? " pu" : "")} onClick={fq} disabled={fe} style={{ fontSize: 11 }}>{fe ? "🔍 Buscando..." : "🔄 Actualizar cotizaciones"}</button>
          <button className="bp" onClick={() => { setEId(null); sF({ name: "", ticker: "", platform: "MyInvestor", type: "Fondo", category: "RV", participaciones: "", costeMedio: "", aportado: "", valorActual: "" }); setSh(true); }}>+ Activo</button>
        </div>
      </div>
      <div className="cd" style={{ padding: 0 }}>
        <div className="rtable"><table><thead><tr>
          <th onClick={() => s.toggle("name")}>Activo {s.arrow("name")}</th>
          <th onClick={() => s.toggle("platform")}>Plataforma {s.arrow("platform")}</th>
          <th onClick={() => s.toggle("type")}>Tipo {s.arrow("type")}</th>
          <th onClick={() => s.toggle("aportado")} style={{ textAlign: "right" }}>Aportado {s.arrow("aportado")}</th>
          <th onClick={() => s.toggle("valorActual")} style={{ textAlign: "right" }}>Valor {s.arrow("valorActual")}</th>
          <th onClick={() => s.toggle("gananciaPct")} style={{ textAlign: "right" }}>Rentabilidad {s.arrow("gananciaPct")}</th>
          <th />
        </tr></thead><tbody>
          {sorted.map(a => (
            <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => openEdit(a)}>
              <td><div style={{ fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 9, color: "#4b5563", fontFamily: "monospace" }}>{a.participaciones} part.</div></td>
              <td><span className="bg" style={{ background: (PC[a.platform] || "#6366f1") + "18", color: PC[a.platform] }}>{a.platform}</span></td>
              <td style={{ whiteSpace: "nowrap" }}>
                <span className="bg" style={{ background: (TC[a.type] || "#6366f1") + "18", color: TC[a.type] || "#818cf8" }}>{a.type}</span>
                {a.type === "Fondo" && <span className="bg" style={{ background: CG[a.category] + "18", color: CG[a.category], marginLeft: 4 }}>{a.category}</span>}
              </td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fE(a.aportado)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fE(a.valorActual)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: rc(a.gananciaEur) }}>{fE(a.gananciaEur)} ({fP(a.gananciaPct)})</td>
              <td><button className="bd" onClick={e => { e.stopPropagation(); removeAsset(a.id); }}>✕</button></td>
            </tr>
          ))}
        </tbody></table></div>
        <div className="mob-card" style={{ padding: 12 }}>
          {sorted.map(a => (
            <div key={a.id} className="mob-item" onClick={() => openEdit(a)}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{a.name}</span><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fE(a.valorActual)}</span></div>
              <div className="mob-row"><span className="mob-lbl">Plataforma</span><span>{a.platform}</span></div>
              <div className="mob-row"><span className="mob-lbl">Tipo</span><span style={{ color: TC[a.type] || "#818cf8" }}>{a.type}{a.type === "Fondo" ? ` · ${a.category}` : ""}</span></div>
              <div className="mob-row"><span className="mob-lbl">Aportado</span><span style={{ fontFamily: "monospace" }}>{fE(a.aportado)}</span></div>
              <div className="mob-row"><span className="mob-lbl">Rentabilidad</span><span style={{ fontFamily: "monospace", color: rc(a.gananciaEur) }}>{fE(a.gananciaEur)} ({fP(a.gananciaPct)})</span></div>
            </div>
          ))}
        </div>
      </div>
      {sh && <Modal onClose={() => setSh(false)} title={eId ? "Editar Activo" : "Añadir Activo"}>
        <F l="Nombre"><input className="ip" value={f.name} onChange={e => sF({ ...f, name: e.target.value })} /></F>
        <F l="Ticker/ISIN"><input className="ip" value={f.ticker} onChange={e => sF({ ...f, ticker: e.target.value })} /></F>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <F l="Plataforma"><select className="ip" value={f.platform} onChange={e => sF({ ...f, platform: e.target.value })}><option>MyInvestor</option><option>Trade Republic</option></select></F>
          <F l="Tipo"><select className="ip" value={f.type} onChange={e => sF({ ...f, type: e.target.value })}><option>Fondo</option><option>ETF</option><option>Acción</option><option>Crypto</option></select></F>
          <F l="Cat."><select className="ip" value={f.category} onChange={e => sF({ ...f, category: e.target.value })}><option value="RV">RV</option><option value="RF">RF</option></select></F>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <F l="Participaciones"><input className="ip" type="number" step="0.000001" value={f.participaciones} onChange={e => sF({ ...f, participaciones: e.target.value })} /></F>
          <F l="Coste Medio (€)"><input className="ip" type="number" step="0.01" value={f.costeMedio} onChange={e => sF({ ...f, costeMedio: e.target.value })} /></F>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <F l={f.apFM ? "Aportado (€) — de Fondos Mensual" : "Aportado (€)"}><input className="ip" type="number" step="0.01" value={f.aportado} disabled={f.apFM} onChange={e => sF({ ...f, aportado: e.target.value })} /></F>
          <F l="Valor Actual (€)"><input className="ip" type="number" step="0.01" value={f.valorActual} onChange={e => sF({ ...f, valorActual: e.target.value })} /></F>
        </div>
        <div style={{ display: "flex", gap: 6 }}><button className="bp" style={{ flex: 1 }} onClick={save}>Guardar</button><button className="bs" onClick={() => { setSh(false); setEId(null); }}>Cancelar</button></div>
      </Modal>}
    </div>
  );
}

function FondosM({ fm, efm, saveFM, removeFM }) {
  const [sh, setSh] = useState(false); const [eMonth, setEMonth] = useState(null);
  const [f, sF] = useState({ month: "", apMsci: "", apEm: "", apClaseC: "", carteraME: "", carteraC: "" });
  function openEdit(m) { setEMonth(m.month); sF({ month: m.month, apMsci: String(m.apMsci), apEm: String(m.apEm), apClaseC: String(m.apClaseC), carteraME: String(m.carteraME), carteraC: String(m.carteraC) }); setSh(true); }
  async function saveM() { if (!f.month) return; const existing = fm.find(m => m.month === f.month); await saveFM({ id: existing?.id, month: f.month, apMsci: parseFloat(f.apMsci) || 0, apEm: parseFloat(f.apEm) || 0, apClaseC: parseFloat(f.apClaseC) || 0, carteraME: parseFloat(f.carteraME) || 0, carteraC: parseFloat(f.carteraC) || 0 }); setEMonth(null); setSh(false); sF({ month: "", apMsci: "", apEm: "", apClaseC: "", carteraME: "", carteraC: "" }); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Fondos — Mensual</h2>
        <button className="bp" onClick={() => { setEMonth(null); sF({ month: "", apMsci: "", apEm: "", apClaseC: "", carteraME: "", carteraC: "" }); setSh(true); }}>+ Mes</button>
      </div>
      <div className="cd" style={{ padding: 0 }}>
        <div className="rtable"><table><thead>
          <tr>
            <th rowSpan={2} style={{ verticalAlign: "bottom", cursor: "default" }}>Mes</th>
            <th colSpan={3} style={GH}>Aportación Mensual</th>
            <th colSpan={2} style={{ ...GH, ...GSEP, background: ME + "10" }}>Suma de aportaciones</th>
            <th colSpan={2} style={{ ...GH, ...GSEP }}>Rentabilidad</th>
            <th rowSpan={2} />
          </tr>
          <tr>
            <th style={{ color: "#60a5fa" }}>MSCI</th>
            <th style={{ color: "#f472b6" }}>EMERG.</th>
            <th style={{ color: CLC }}>Clase C</th>
            <th style={{ ...GSEP, background: ME + "15", color: ME }}>MSCI+EMERG.</th>
            <th style={{ background: CLC + "15", color: CLC }}>Clase C</th>
            <th style={{ ...GSEP, background: ME + "15", color: ME }}>MSCI+EMERG.</th>
            <th style={{ background: CLC + "15", color: CLC }}>Clase C</th>
          </tr>
        </thead><tbody>
          {efm.map(m => {
            if (m.cME === 0 && m.carteraME === 0) return null;
            return (
              <tr key={m.month} style={{ cursor: "pointer" }} onClick={() => openEdit(m)}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fMN(m.month)}</td>
                <td style={{ fontFamily: "monospace", color: "#60a5fa" }}>{m.apMsci > 0 ? fE(m.apMsci) : "—"}</td>
                <td style={{ fontFamily: "monospace", color: "#f472b6" }}>{m.apEm > 0 ? fE(m.apEm) : "—"}</td>
                <td style={{ fontFamily: "monospace", color: CLC }}>{m.apClaseC > 0 ? fE(m.apClaseC) : "—"}</td>
                <td style={{ ...GSEP, fontFamily: "monospace", fontWeight: 600, background: ME + "08" }}>{m.carteraME > 0 ? fE(m.carteraME) : "—"}</td>
                <td style={{ fontFamily: "monospace", fontWeight: 600, color: CLC, background: CLC + "08" }}>{m.effC > 0 ? fE(m.effC) : "—"}</td>
                <td style={{ ...GSEP, fontFamily: "monospace", background: ME + "08", color: rc(m.gME) }}>{m.carteraME > 0 ? fE(m.gME) + " (" + fP(m.rME) + ")" : "—"}</td>
                <td style={{ fontFamily: "monospace", background: CLC + "08", color: m.effC > 0 ? rc(m.gC) : "#374151" }}>{m.effC > 0 && m.cC > 0 ? fE(m.gC) + " (" + fP(m.rC) + ")" : "—"}</td>
                <td><button className="bd" onClick={e => { e.stopPropagation(); removeFM(m.id, m.month); }}>✕</button></td>
              </tr>
            );
          })}
        </tbody></table></div>
        <div className="mob-card" style={{ padding: 12 }}>
          {efm.map(m => {
            if (m.cME === 0 && m.carteraME === 0) return null;
            return (
              <div key={m.month} className="mob-item" onClick={() => openEdit(m)}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{fMN(m.month)}</div>
                <div className="shdr">Aportación Mensual</div>
                <div className="mob-row"><span className="mob-lbl" style={{ color: "#60a5fa" }}>MSCI</span><span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{fE(m.apMsci)}</span></div>
                <div className="mob-row"><span className="mob-lbl" style={{ color: "#f472b6" }}>EMERG.</span><span style={{ fontFamily: "monospace", color: "#f472b6" }}>{fE(m.apEm)}</span></div>
                {m.apClaseC > 0 && <div className="mob-row"><span className="mob-lbl" style={{ color: CLC }}>Clase C</span><span style={{ fontFamily: "monospace", color: CLC }}>{fE(m.apClaseC)}</span></div>}
                <div className="shdr">Suma de aportaciones</div>
                <div className="mob-row"><span className="mob-lbl" style={{ color: ME }}>MSCI+EMERG.</span><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{m.carteraME > 0 ? fE(m.carteraME) : "—"}</span></div>
                {m.effC > 0 && <div className="mob-row"><span className="mob-lbl" style={{ color: CLC }}>Clase C</span><span style={{ fontFamily: "monospace", fontWeight: 700, color: CLC }}>{fE(m.effC)}</span></div>}
                <div className="shdr">Rentabilidad</div>
                {m.carteraME > 0 && <div className="mob-row"><span className="mob-lbl" style={{ color: ME }}>MSCI+EMERG.</span><span style={{ fontFamily: "monospace", color: rc(m.gME) }}>{fE(m.gME)} ({fP(m.rME)})</span></div>}
                {m.effC > 0 && m.cC > 0 && <div className="mob-row"><span className="mob-lbl" style={{ color: CLC }}>Clase C</span><span style={{ fontFamily: "monospace", color: rc(m.gC) }}>{fE(m.gC)} ({fP(m.rC)})</span></div>}
              </div>
            );
          })}
        </div>
      </div>
      {sh && <Modal onClose={() => setSh(false)} title={eMonth ? "Editar Mes" : "Añadir Mes"}>
        <F l="Mes"><input className="ip" type="month" value={f.month} onChange={e => sF({ ...f, month: e.target.value })} disabled={!!eMonth} /></F>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Aportaciones del mes</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <F l="MSCI (€)"><input className="ip" type="number" step="0.01" value={f.apMsci} onChange={e => sF({ ...f, apMsci: e.target.value })} /></F>
          <F l="Emerg. (€)"><input className="ip" type="number" step="0.01" value={f.apEm} onChange={e => sF({ ...f, apEm: e.target.value })} /></F>
          <F l="Clase C (€)"><input className="ip" type="number" step="0.01" value={f.apClaseC} onChange={e => sF({ ...f, apClaseC: e.target.value })} /></F>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Cartera Real (fin de mes)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <F l="MSCI+Emerg. (€)"><input className="ip" type="number" step="0.01" value={f.carteraME} onChange={e => sF({ ...f, carteraME: e.target.value })} /></F>
          <F l="Clase C (€) — 0 usa acumulado"><input className="ip" type="number" step="0.01" value={f.carteraC} onChange={e => sF({ ...f, carteraC: e.target.value })} /></F>
        </div>
        <div style={{ display: "flex", gap: 6 }}><button className="bp" style={{ flex: 1 }} onClick={saveM}>Guardar en Supabase</button><button className="bs" onClick={() => setSh(false)}>Cancelar</button></div>
      </Modal>}
    </div>
  );
}

function Comp({ efm }) {
  const data = efm.filter(m => m.cME > 0);
  if (!data.length) return <div className="cd"><p style={{ color: "#4b5563" }}>Sin datos en Fondos Mensual</p></div>;
  const rows = data.map((m, idx) => {
    let v3 = 0, v9 = 0;
    for (let j = 0; j <= idx; j++) { const ap = data[j].apMsci + data[j].apEm; const mi = idx - j; v3 += ap * Math.pow(1 + 0.03 / 12, mi); v9 += ap * Math.pow(1 + 0.09 / 12, mi); }
    v3 = Math.round(v3 * 100) / 100; v9 = Math.round(v9 * 100) / 100;
    return { label: fMN(m.month), ap: m.cME, real: m.carteraME, gR: m.gME, v3, v9, g3: Math.round((v3 - m.cME) * 100) / 100, g9: Math.round((v9 - m.cME) * 100) / 100 };
  });
  const cd = rows.map(r => ({ label: r.label, "Solo aportación": r.ap, "Cartera Real": r.real, "Al 3%": r.v3, "Al 9%": r.v9 }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Comparativa — MSCI + Emergentes</h2>
      <div className="cd" style={{ padding: 0 }}>
        <div className="rtable"><table><thead><tr>
          <th>Mes</th>
          <th style={{ textAlign: "right", color: "#64748b" }}>Solo aportación</th>
          <th style={{ textAlign: "right", color: "#818cf8" }}>Cartera Real</th>
          <th style={{ textAlign: "right", color: "#fbbf24" }}>Al 3% anual</th>
          <th style={{ textAlign: "right", color: "#f97316" }}>Al 9% anual</th>
        </tr></thead><tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.label}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: "#64748b" }}>{fE(r.ap)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}><span style={{ color: "#818cf8" }}>{fE(r.real)}</span> <span style={{ fontSize: 10, color: rc(r.gR) }}>({fE(r.gR)})</span></td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}><span style={{ color: "#fbbf24" }}>{fE(r.v3)}</span> <span style={{ fontSize: 10, color: "#a78bfa" }}>({fE(r.g3)})</span></td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}><span style={{ color: "#f97316" }}>{fE(r.v9)}</span> <span style={{ fontSize: 10, color: "#a78bfa" }}>({fE(r.g9)})</span></td>
            </tr>
          ))}
        </tbody></table></div>
        <div className="mob-card" style={{ padding: 12 }}>
          {rows.map(r => (
            <div key={r.label} className="mob-item">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{r.label}</div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: "#64748b" }}>Solo aportación</span><span style={{ fontFamily: "monospace", color: "#64748b" }}>{fE(r.ap)}</span></div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: "#818cf8" }}>Cartera Real</span><span style={{ fontFamily: "monospace", color: rc(r.gR) }}>{fE(r.real)}</span></div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: "#fbbf24" }}>Al 3%</span><span style={{ fontFamily: "monospace", color: "#fbbf24" }}>{fE(r.v3)}</span></div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: "#f97316" }}>Al 9%</span><span style={{ fontFamily: "monospace", color: "#f97316" }}>{fE(r.v9)}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="cd" style={{ background: "rgba(167,139,250,.04)", borderColor: "rgba(167,139,250,.12)", padding: 12 }}>
        <p style={{ margin: 0, fontSize: 10, color: "#4b5563" }}>Interés compuesto en <span style={{ color: "#a78bfa", fontWeight: 700 }}>morado</span>. Cada aportación se compone por los meses que lleva invertida (DCA real).</p>
      </div>
      <div className="cd"><div style={{ fontSize: 8, color: "#4b5563", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Proyección</div><div style={{ height: 250 }}><ResponsiveContainer><LineChart data={cd}><CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.05)" /><XAxis dataKey="label" tick={{ fill: "#374151", fontSize: 8 }} /><YAxis tick={{ fill: "#374151", fontSize: 8 }} tickFormatter={v => (v / 1000).toFixed(1) + "k"} /><Tooltip contentStyle={{ background: "#1a2540", border: "1px solid rgba(148,163,184,.12)", borderRadius: 8, fontSize: 10 }} formatter={v => fE(v)} /><Legend wrapperStyle={{ fontSize: 9 }} /><Line type="monotone" dataKey="Solo aportación" stroke="#64748b" strokeWidth={2} strokeDasharray="5 5" dot={false} /><Line type="monotone" dataKey="Cartera Real" stroke="#818cf8" strokeWidth={2.5} dot={{ r: 3, fill: "#818cf8" }} /><Line type="monotone" dataKey="Al 3%" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="3 3" dot={false} /><Line type="monotone" dataKey="Al 9%" stroke="#f97316" strokeWidth={1.5} strokeDasharray="3 3" dot={false} /></LineChart></ResponsiveContainer></div></div>
    </div>
  );
}

function Sett({ loadAll, session }) {
  const [msg, setMsg] = useState(null);
  async function reload() { setMsg("Recargando..."); await loadAll(); setMsg("✓ Datos recargados"); setTimeout(() => setMsg(null), 3000); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Ajustes</h2>
      <div className="cd">
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>SESIÓN ACTIVA</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>Conectado como: <strong style={{ color: "#818cf8" }}>{session?.user?.email}</strong></div>
        <button className="bp" onClick={reload} style={{ marginRight: 8 }}>{msg || "🔄 Recargar datos"}</button>
        <button className="bd" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
      <div className="cd" style={{ background: "rgba(52,211,153,.04)", borderColor: "rgba(52,211,153,.1)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#34d399", marginBottom: 6 }}>BASE DE DATOS</div>
        <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>Todos los cambios se guardan automáticamente en Supabase. Los datos persisten entre sesiones y dispositivos.</p>
      </div>
    </div>
  );
}
