import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, LineChart, BarChart, Bar, Cell, ReferenceLine } from "recharts";
import { supabase } from './supabase';
import * as db from './db';
import { PAL, css, readTheme, writeTheme } from './theme';

// Paleta activa. Se reasigna en cada render de App según el tema elegido, así que
// todos los componentes de este fichero la leen ya actualizada.
let P = PAL[readTheme()];
const PC = () => ({ MyInvestor: P.my, "Trade Republic": P.tr });
const CG = () => ({ RV: P.rv, RF: P.rf });
const TC = () => ({ Fondo: P.msc, Monetario: P.cy, ETF: P.rv, "Acción": P.emg, Crypto: P.clc });
// Tope de subida aceptable en una actualización de cotizaciones (×2 = +100%)
const MAX_JUMP = 2;

// Cabecera de grupo (superclase) y separador entre grupos en la tabla mensual.
// Son funciones para que lean la paleta del tema activo en cada render.
const GH = () => ({ textAlign: "center", cursor: "default", color: P.t2, borderBottom: "1px solid " + P.l3 });
const GSEP = () => ({ borderLeft: "1px solid " + P.l3 });
// Estilo del tooltip de recharts. Sin labelStyle/itemStyle explícitos usa su
// color por defecto (gris oscuro) y sobre el fondo del tema oscuro no se lee.
const TIP = () => ({
  contentStyle: { background: P.card2, border: "1px solid " + P.l3, borderRadius: 8, fontSize: 10, color: P.tx, boxShadow: "0 4px 14px rgba(0,0,0,.28)" },
  labelStyle: { color: P.t2, fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: P.tx },
});
const fE = v => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(v);
const fP = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fMN = m => { const n = new Date(m + "-01").toLocaleDateString("es-ES", { month: "short", year: "numeric" }); return n.charAt(0).toUpperCase() + n.slice(1); };
const rc = v => v >= 0 ? P.up : P.down;

const r2 = v => Math.round(v * 100) / 100;

// Etiqueta corta para las cabeceras de la tabla mensual
const corto = a => {
  const n = a.name || "";
  if (/emerg/i.test(n)) return "EMERG.";
  if (/world|msci/i.test(n)) return "MSCI";
  if (/clase\s*c|value/i.test(n)) return "Clase C";
  if (/groupama/i.test(n)) return "Groupama";
  if (/storm/i.test(n)) return "Storm";
  return n.split(" ").slice(0, 2).join(" ");
};
const abrev = p => p === "MyInvestor" ? "MY" : p === "Trade Republic" ? "TR" : p;
// Color por identidad del fondo: MyInvestor y Trade Republic del mismo fondo
// comparten tono, y lo que los distingue es la plataforma bajo el nombre.
const tono = a => {
  const n = a.name || "";
  if (/emerg/i.test(n)) return P.emg;
  if (/world|msci/i.test(n)) return P.msc;
  if (/clase\s*c|value/i.test(n)) return P.clc;
  if (/groupama/i.test(n)) return P.cy;
  return P.ac;
};

// Activos del plan mensual. Si nadie está marcado (migración pendiente), se
// deducen de los que ya tienen aportaciones registradas.
function planAssetsDe(assets, contribs) {
  const marcados = assets.filter(a => a.planMensual);
  if (marcados.length) return ordenPlan(marcados);
  const ids = new Set(contribs.map(c => c.assetId));
  return ordenPlan(assets.filter(a => ids.has(a.id)));
}
const ordenPlan = list => [...list].sort((a, b) =>
  corto(a).localeCompare(corto(b)) || a.platform.localeCompare(b.platform));

// Respaldo: si fund_contributions no está disponible, se derivan las
// aportaciones de la vieja fund_monthly para no perder el histórico de vista.
function contribsDeFundMonthly(fm, assets) {
  const pares = [["IE00BYX5NX33", "apMsci"], ["IE00BYX5M476", "apEm"], ["ES0165243025", "apClaseC"]];
  const out = [];
  for (const m of fm) {
    for (const [ticker, campo] of pares) {
      const a = assets.find(x => x.ticker === ticker && x.platform === "MyInvestor");
      if (a && m[campo] > 0) out.push({ assetId: a.id, month: m.month, aportado: m[campo] });
    }
  }
  return out;
}

// Serie mensual del plan. Una fila por mes y, dentro, un bloque por activo:
// lo aportado ese mes, el acumulado, las participaciones compradas y el valor.
//
// La aportación compra al NAV de APERTURA del mes (se aporta a principio de mes)
// y el valor son las participaciones acumuladas por el NAV de CIERRE.
function enrichPlan(planAssets, contribs, nav) {
  const meses = [...new Set(contribs.map(c => c.month))].sort();
  const porMes = new Map();
  for (const c of contribs) {
    const m = porMes.get(c.month) || {};
    m[c.assetId] = (m[c.assetId] || 0) + c.aportado;
    porMes.set(c.month, m);
  }
  const acum = {}, units = {};
  for (const a of planAssets) { acum[a.id] = 0; units[a.id] = 0; }

  return meses.map(month => {
    const aps = porMes.get(month) || {};
    const per = {};
    let tAp = 0, tAcum = 0, tVal = 0, tAcumConVal = 0;
    for (const a of planAssets) {
      const ap = aps[a.id] || 0;
      acum[a.id] += ap;
      const n = nav?.[a.id]?.months?.[month];
      if (n && ap > 0) units[a.id] += ap / n.open;
      const ac = acum[a.id];
      const val = n && units[a.id] > 0 ? r2(units[a.id] * n.close) : 0;
      const g = val > 0 ? r2(val - ac) : 0;
      per[a.id] = { ap, apAcum: ac, units: units[a.id], val, g, pct: ac > 0 && val > 0 ? (g / ac) * 100 : 0, hasVal: val > 0 };
      tAp += ap; tAcum += ac;
      // El total solo se compara con lo aportado de los activos que SÍ tienen
      // valor liquidativo; si no, la ganancia saldría falseada
      if (val > 0) { tVal += val; tAcumConVal += ac; }
    }
    const tG = tVal > 0 ? r2(tVal - tAcumConVal) : 0;
    return { month, per, tot: {
      ap: r2(tAp), apAcum: r2(tAcum), val: r2(tVal), g: tG,
      pct: tAcumConVal > 0 && tVal > 0 ? (tG / tAcumConVal) * 100 : 0, hasVal: tVal > 0,
    } };
  });
}

// De los activos del plan, la aportación acumulada y las PARTICIPACIONES las
// manda el plan mensual. El campo participaciones de assets se quedaba
// congelado (nadie lo actualiza tras cada aportación) y como
//   valor = precio × participaciones
// el valor salía por debajo y la rentabilidad daba negativa siendo positiva.
function enrichAssets(assets, plan) {
  const last = plan.length ? plan[plan.length - 1] : null;
  if (!last) return assets;
  return assets.map(a => {
    const d = last.per[a.id];
    if (!d || !(d.apAcum > 0)) return a;
    const partFM = d.units > 0;
    const px = a.participaciones > 0 ? a.valorActual / a.participaciones : 0;
    const pa = partFM ? Math.round(d.units * 1e6) / 1e6 : a.participaciones;
    const va = partFM && px > 0 ? r2(px * pa) : a.valorActual;
    const ge = r2(va - d.apAcum);
    return { ...a, participaciones: pa, aportado: d.apAcum, valorActual: va,
      gananciaEur: ge, gananciaPct: r2((ge / d.apAcum) * 100), apFM: true, partFM };
  });
}

function useSort(dk, dd) {
  const [sk, setSk] = useState(dk); const [sd, setSd] = useState(dd);
  return { toggle: k => { if (sk === k) setSd(-sd); else { setSk(k); setSd(1); } }, arrow: k => sk === k ? (sd === 1 ? " ▲" : " ▼") : "", sortFn: (a, b) => { const va = a[sk] ?? 0, vb = b[sk] ?? 0; return typeof va === "string" ? va.localeCompare(vb) * sd : (va - vb) * sd; } };
}

// Celda de rentabilidad: ganancia arriba y porcentaje debajo, para no ensanchar la tabla
function RentCell({ g, r, on, tint, sep, bold }) {
  const st = { fontFamily: "monospace", background: tint + "08", ...(sep ? GSEP() : null) };
  if (!on) return <td style={{ ...st, color: P.t5 }}>—</td>;
  return (
    <td style={{ ...st, color: rc(g), whiteSpace: "nowrap" }}>
      <div style={{ fontWeight: bold ? 600 : 400 }}>{fE(g)}</div>
      <div style={{ fontSize: 9, opacity: .75 }}>{fP(r)}</div>
    </td>
  );
}

function F({ l, children }) { return <div style={{ marginBottom: 4 }}><label style={{ fontSize: 10, color: P.t4, display: "block", marginBottom: 2 }}>{l}</label>{children}</div>; }
function Modal({ onClose, title, children }) { return <div style={{ position: "fixed", inset: 0, background: P.veil, backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}><div style={{ background: P.card2, border: "1px solid " + P.l2, borderRadius: 16, padding: 22, maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}><h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>{title}</h3><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div></div></div>; }


export default function App({ session }) {
  const [tab, setTab] = useState("Dashboard");
  const [tema, setTema] = useState(readTheme);
  // La paleta del módulo se reasigna aquí, antes de renderizar los hijos
  P = PAL[tema];
  useEffect(() => { writeTheme(tema); }, [tema]);
  const [assets, setAssets] = useState([]);
  const [fm, setFm] = useState([]);
  const [contribs, setContribs] = useState([]);
  const [snaps, setSnaps] = useState([]);
  const [nav, setNav] = useState(null);
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
      const [a, f, sn, co] = await Promise.all([db.fetchAssets(), db.fetchFundMonthly(), db.fetchSnapshots(), db.fetchContributions()]);
      setAssets(a);
      setFm(f);
      setSnaps(sn);
      // Si la tabla nueva aún no está, se deriva el histórico de la vieja
      const cc = co.length || db.contribSupported() ? co : contribsDeFundMonthly(f, a);
      setContribs(cc);
      // El NAV mensual no bloquea la carga: si Yahoo no responde, la pestaña avisa
      const pa = planAssetsDe(a, cc);
      if (pa.length) {
        try { setNav(await db.fetchNavSeries(pa.map(x => ({ id: x.id, ticker: x.ticker, name: x.name })))); }
        catch (e) { console.warn("fetchNavSeries:", e.message); }
      }
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

  async function toggleManual(id, manual) {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, manual } : a));
    try { await db.setAssetManual(id, manual); }
    catch (e) {
      setAssets(prev => prev.map(a => a.id === id ? { ...a, manual: !manual } : a));
      alert(e.message);
    }
  }

  async function removeAsset(id) {
    try { await db.deleteAsset(id); setAssets(prev => prev.filter(a => a.id !== id)); }
    catch (e) { alert("Error eliminando: " + e.message); }
  }

  async function saveMonth(month, porActivo) {
    try {
      await db.saveMonthContributions(month, porActivo);
      setContribs(prev => {
        const resto = prev.filter(c => c.month !== month);
        const nuevas = Object.entries(porActivo)
          .filter(([, v]) => v > 0)
          .map(([assetId, aportado]) => ({ assetId, month, aportado }));
        return [...resto, ...nuevas].sort((a, b) => a.month.localeCompare(b.month));
      });
    } catch (e) {
      alert("Error guardando el mes: " + e.message);
      console.error("saveMonth error:", e);
    }
  }

  async function removeMonth(month) {
    try {
      await db.deleteMonthContributions(month);
      setContribs(prev => prev.filter(c => c.month !== month));
    } catch (e) { alert("Error eliminando mes: " + e.message); }
  }

  const fetchQuotes = useCallback(async () => {
    if (!assets.length) return;
    setFetching(true);
    setQuoteMsg(null);
    try {
      // Activos marcados en Ajustes: se llevan a mano, la cotización no los toca
      const locked = assets.filter(a => a.manual).length;
      const items = av.filter(a => !a.manual).map(a => ({ id: a.id, ticker: a.ticker, name: a.name, type: a.type }));
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
      const updated = av.map(a => {
        if (a.manual) return a;
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
        // Se persisten también las participaciones cuando las manda Fondos Mensual
        updates.push({ id: a.id, valorActual: va, participaciones: a.partFM ? a.participaciones : undefined });
        ok++;
        return { ...a, valorActual: va, gananciaEur: ge, gananciaPct: gp };
      });
      setAssets(updated);
      if (updates.length) await db.bulkUpdateAssetValues(updates);
      // Foto del día de toda la cartera, para el histórico de Anualidades.
      // Se guarda el estado efectivo (con el aportado de Fondos Mensual ya aplicado).
      let snapN = 0;
      try {
        const eff = enrichAssets(updated, plan);
        snapN = await db.saveSnapshots(eff);
        if (snapN) setSnaps(await db.fetchSnapshots());
      } catch (e) { console.warn("saveSnapshots:", e.message); }
      setLastUp(new Date().toLocaleString("es-ES"));
      setQuoteMsg([
        `${ok} activos actualizados`,
        locked ? `${locked} a mano (sin tocar)` : null,
        snapN ? `foto del día guardada` : null,
        bad.length ? `${bad.length} descartados por precio anómalo (${bad.join(", ")})` : null,
        fail ? `${fail} sin datos (edítalos a mano)` : null,
      ].filter(Boolean).join(" · "));
    } catch (e) {
      console.error("fetchQuotes:", e);
      setQuoteMsg("Error al actualizar: " + e.message);
    }
    setFetching(false);
  }, [assets, av]);

  const tI = useMemo(() => av.reduce((s, a) => s + a.aportado, 0), [av]);
  const tV = useMemo(() => av.reduce((s, a) => s + a.valorActual, 0), [av]);
  const tG = tV - tI;
  const plats = useMemo(() => { const r = {}; av.forEach(a => { if (!r[a.platform]) r[a.platform] = { assets: [], ap: 0, va: 0 }; r[a.platform].assets.push(a); r[a.platform].ap += a.aportado; r[a.platform].va += a.valorActual; }); return r; }, [av]);
  const byType = useMemo(() => { const r = {}; av.forEach(a => { if (!r[a.type]) r[a.type] = { ap: 0, va: 0 }; r[a.type].ap += a.aportado; r[a.type].va += a.valorActual; }); return r; }, [av]);
  const byCat = useMemo(() => { const r = {}; av.forEach(a => { if (!r[a.category]) r[a.category] = { ap: 0, va: 0 }; r[a.category].ap += a.aportado; r[a.category].va += a.valorActual; }); return r; }, [av]);

  const TABS = ["Dashboard", "Cartera", "Fondos Mensual", "Comparativa", "Anualidades", "Ajustes"];

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: P.bg, color: P.t3, fontFamily: "system-ui" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>Cargando tu cartera desde Supabase...</div></div>;

  if (err) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: P.bg, color: P.down, fontFamily: "system-ui", flexDirection: "column", gap: 12 }}><div>{err}</div><button onClick={loadAll} style={{ background: P.ac2, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>Reintentar</button></div>;

  return (
    <div style={{ minHeight: "100vh", background: P.bg, color: P.tx, fontFamily: "system-ui,sans-serif" }}>
      <style>{css(P)}</style>
      <header style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderBottom: "1px solid " + P.l1 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, fontStyle: "italic", background: `linear-gradient(135deg,${P.ac},${P.up})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Portfolio Tracker</h1>
          <div style={{ fontSize: 9, color: P.t5 }}>Cartera personal</div>
        </div>
        <div style={{ display: "flex", gap: 2, background: P.seg, padding: 3, borderRadius: 8, flexWrap: "wrap" }}>
          {TABS.map(t => <button key={t} className={"tb" + (tab === t ? " ac" : "")} onClick={() => setTab(t)}>{t}</button>)}
          <button className="tb" title={tema === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} onClick={() => setTema(t => t === "dark" ? "light" : "dark")}>{tema === "dark" ? "☀️" : "🌙"}</button>
          <button className="tb" style={{ color: P.down }} onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main style={{ padding: "14px 16px 40px" }}>
        {tab === "Dashboard" && <Dash assets={av} plats={plats} byType={byType} byCat={byCat} tI={tI} tV={tV} tG={tG} plan={plan} fe={fetching} fq={fetchQuotes} lu={lastUp} qmsg={quoteMsg} />}
        {tab === "Cartera" && <Cart assets={av} saveAsset={saveAsset} removeAsset={removeAsset} fe={fetching} fq={fetchQuotes} lu={lastUp} />}
        {tab === "Fondos Mensual" && <FondosM planAssets={planAssets} plan={plan} nav={nav} contribOk={db.contribSupported()} saveMonth={saveMonth} removeMonth={removeMonth} />}
        {tab === "Comparativa" && <Comp plan={plan} />}
        {tab === "Anualidades" && <Anu assets={av} plan={plan} planAssets={planAssets} snaps={snaps} tI={tI} tV={tV} tG={tG} />}
        {tab === "Ajustes" && <Sett loadAll={loadAll} session={session} assets={av} toggleManual={toggleManual} />}
      </main>
    </div>
  );
}

function KPICard({ label, labelColor, value, gain, pct, invested }) {
  return (
    <div className="cd" style={{ borderTop: labelColor ? `3px solid ${labelColor}` : undefined }}>
      <div style={{ fontSize: 9, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 19, fontFamily: "monospace", fontWeight: 700 }}>{fE(value)}</div>
      <div style={{ fontSize: 11, fontFamily: "monospace", color: rc(gain) }}>{fE(gain)} ({fP(pct)})</div>
      {invested !== undefined && <div style={{ fontSize: 9, color: P.t5, marginTop: 3 }}>Invertido: {fE(invested)}</div>}
    </div>
  );
}

function Dash({ assets, plats, byType, byCat, tI, tV, tG, plan, fe, fq, lu, qmsg }) {
  const cd = plan.filter(m => m.tot.hasVal).map(m => ({ label: fMN(m.month), aportado: m.tot.apAcum, cartera: m.tot.val }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cd" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Cotizaciones en tiempo real</div>
          <div style={{ fontSize: 9, color: qmsg ? (qmsg.startsWith("Error") ? P.down : P.up) : P.t4 }}>{qmsg || (lu ? "Actualizado: " + lu : "Sin actualizar — pulsa para buscar precios actuales")}</div>
        </div>
        <button className={"bp" + (fe ? " pu" : "")} onClick={fq} disabled={fe}>{fe ? "🔍 Buscando precios..." : "🔄 Actualizar cotizaciones"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div className="cd"><div style={{ fontSize: 9, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Total Invertido</div><div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700, color: P.ac }}>{fE(tI)}</div></div>
        <div className="cd"><div style={{ fontSize: 9, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Valor Actual</div><div style={{ fontSize: 22, fontFamily: "monospace", fontWeight: 700 }}>{fE(tV)}</div></div>
        <div className="cd"><div style={{ fontSize: 9, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Rentabilidad Total</div><div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color: rc(tG) }}>{fE(tG)}</div><div style={{ fontSize: 12, fontFamily: "monospace", color: rc(tG) }}>{fP(tI > 0 ? (tG / tI) * 100 : 0)}</div></div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, textTransform: "uppercase", letterSpacing: 1 }}>Por Plataforma</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        {Object.entries(plats).map(([p, d]) => { const g = d.va - d.ap; return <KPICard key={p} label={p} labelColor={PC()[p]} value={d.va} gain={g} pct={d.ap > 0 ? (g / d.ap) * 100 : 0} invested={d.ap} />; })}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, textTransform: "uppercase", letterSpacing: 1 }}>Por Categoría (RV / RF)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        {Object.entries(byCat).map(([cat, d]) => { const g = d.va - d.ap; return <KPICard key={cat} label={cat === "RV" ? "Renta Variable" : "Renta Fija"} labelColor={CG()[cat]} value={d.va} gain={g} pct={d.ap > 0 ? (g / d.ap) * 100 : 0} invested={d.ap} />; })}
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, textTransform: "uppercase", letterSpacing: 1 }}>Por Tipo de Activo</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
        {Object.entries(byType).map(([type, d]) => { const g = d.va - d.ap; return <KPICard key={type} label={type} labelColor={TC()[type]} value={d.va} gain={g} pct={d.ap > 0 ? (g / d.ap) * 100 : 0} invested={d.ap} />; })}
      </div>

      {Object.entries(plats).map(([p, d]) => {
        const cats = {}; d.assets.forEach(a => { const k = a.category + "|" + a.type; if (!cats[k]) cats[k] = { c: a.category, t: a.type, i: [] }; cats[k].i.push(a); });
        return (
          <div key={p} className="cd" style={{ borderLeft: "3px solid " + (PC()[p] || P.ac2) }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>{p}</div>
            {Object.values(cats).map(c => (
              <div key={c.c + c.t}>
                <div className="shdr">{c.c === "RV" ? "RV" : "RF"} — {c.t}</div>
                {c.i.map(a => (
                  <div key={a.id} className="asset-row">
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12 }}>{a.name}</div><div style={{ fontSize: 9, color: P.t4, fontFamily: "monospace" }}>{a.participaciones} part.</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700 }}>{fE(a.valorActual)}</div><div style={{ fontSize: 11, fontFamily: "monospace", color: rc(a.gananciaEur) }}>{fE(a.gananciaEur)} ({fP(a.gananciaPct)})</div></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {cd.length > 0 && <div className="cd"><div style={{ fontSize: 8, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Evolución</div><div style={{ height: 200 }}><ResponsiveContainer><AreaChart data={cd}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.up} stopOpacity={.2} /><stop offset="100%" stopColor={P.up} stopOpacity={0} /></linearGradient><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.ac} stopOpacity={.15} /><stop offset="100%" stopColor={P.ac} stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={P.l1} /><XAxis dataKey="label" tick={{ fill: P.t5, fontSize: 9 }} /><YAxis tick={{ fill: P.t5, fontSize: 9 }} tickFormatter={v => (v / 1000).toFixed(1) + "k"} /><Tooltip contentStyle={TIP().contentStyle} labelStyle={TIP().labelStyle} itemStyle={TIP().itemStyle} formatter={v => fE(v)} /><Legend wrapperStyle={{ fontSize: 9 }} /><Area type="monotone" dataKey="aportado" name="Aportado" stroke={P.ac} fill="url(#g2)" strokeWidth={2} /><Area type="monotone" dataKey="cartera" name="Cartera" stroke={P.up} fill="url(#g1)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div></div>}
    </div>
  );
}

function Cart({ assets, saveAsset, removeAsset, fe, fq, lu }) {
  const [sh, setSh] = useState(false); const [eId, setEId] = useState(null);
  const [f, sF] = useState({ name: "", ticker: "", platform: "MyInvestor", type: "Fondo", category: "RV", participaciones: "", costeMedio: "", aportado: "", valorActual: "", planMensual: false });
  const s = useSort("name", 1); const sorted = [...assets].sort(s.sortFn);
  function openEdit(a) { setEId(a.id); sF({ name: a.name, ticker: a.ticker, platform: a.platform, type: a.type, category: a.category, participaciones: String(a.participaciones), costeMedio: String(a.costeMedio), aportado: String(a.aportado), valorActual: String(a.valorActual), apFM: !!a.apFM, planMensual: !!a.planMensual }); setSh(true); }
  async function save() { const ap = parseFloat(f.aportado) || 0; const va = parseFloat(f.valorActual) || 0; await saveAsset({ id: eId || ("temp-" + Date.now()), name: f.name, ticker: f.ticker, platform: f.platform, type: f.type, category: f.category, participaciones: parseFloat(f.participaciones) || 0, costeMedio: parseFloat(f.costeMedio) || 0, aportado: ap, valorActual: va, planMensual: !!f.planMensual, gananciaEur: va - ap, gananciaPct: ap > 0 ? ((va - ap) / ap) * 100 : 0 }); sF({ name: "", ticker: "", platform: "MyInvestor", type: "Fondo", category: "RV", participaciones: "", costeMedio: "", aportado: "", valorActual: "", planMensual: false }); setEId(null); setSh(false); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Mi Cartera</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {lu && <span style={{ fontSize: 9, color: P.t4, alignSelf: "center" }}>Act: {lu}</span>}
          <button className={"bs" + (fe ? " pu" : "")} onClick={fq} disabled={fe} style={{ fontSize: 11 }}>{fe ? "🔍 Buscando..." : "🔄 Actualizar cotizaciones"}</button>
          <button className="bp" onClick={() => { setEId(null); sF({ name: "", ticker: "", platform: "MyInvestor", type: "Fondo", category: "RV", participaciones: "", costeMedio: "", aportado: "", valorActual: "", planMensual: false }); setSh(true); }}>+ Activo</button>
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
              <td><div style={{ fontWeight: 600 }}>{a.name}{a.manual && <span title="A mano: no se actualiza por cotización" style={{ marginLeft: 5, fontSize: 10 }}>🔒</span>}</div><div style={{ fontSize: 9, color: P.t4, fontFamily: "monospace" }}>{a.participaciones} part.</div></td>
              <td><span className="bg" style={{ background: (PC()[a.platform] || P.ac2) + "18", color: PC()[a.platform] }}>{a.platform}</span></td>
              <td style={{ whiteSpace: "nowrap" }}>
                <span className="bg" style={{ background: (TC()[a.type] || P.ac2) + "18", color: TC()[a.type] || P.ac }}>{a.type}</span>
                {a.type === "Fondo" && <span className="bg" style={{ background: CG()[a.category] + "18", color: CG()[a.category], marginLeft: 4 }}>{a.category}</span>}
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
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{a.name}{a.manual && <span style={{ marginLeft: 5, fontSize: 10 }}>🔒</span>}</span><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fE(a.valorActual)}</span></div>
              <div className="mob-row"><span className="mob-lbl">Plataforma</span><span>{a.platform}</span></div>
              <div className="mob-row"><span className="mob-lbl">Tipo</span><span style={{ color: TC()[a.type] || P.ac }}>{a.type}{a.type === "Fondo" ? ` · ${a.category}` : ""}</span></div>
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
          <F l="Tipo"><select className="ip" value={f.type} onChange={e => sF({ ...f, type: e.target.value })}><option>Fondo</option><option>Monetario</option><option>ETF</option><option>Acción</option><option>Crypto</option></select></F>
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
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: P.t2, cursor: "pointer", background: `${P.up}12`, border: `1px solid ${P.up}2b`, borderRadius: 8, padding: "9px 11px" }}>
          <input type="checkbox" checked={!!f.planMensual} onChange={e => sF({ ...f, planMensual: e.target.checked })} style={{ marginTop: 1, cursor: "pointer" }} />
          <span>Aporto a este activo cada mes<div style={{ fontSize: 9, color: P.t4, marginTop: 2 }}>Le da columna propia en Fondos Mensual, separada por plataforma. Su aportado y sus participaciones pasarán a salir de ahí.</div></span>
        </label>
        <div style={{ display: "flex", gap: 6 }}><button className="bp" style={{ flex: 1 }} onClick={save}>Guardar</button><button className="bs" onClick={() => { setSh(false); setEId(null); }}>Cancelar</button></div>
      </Modal>}
    </div>
  );
}

function FondosM({ planAssets, plan, nav, contribOk, saveMonth, removeMonth }) {
  const [sh, setSh] = useState(false);
  const [eMonth, setEMonth] = useState(null);
  const [mes, setMes] = useState("");
  const [imp, setImp] = useState({});          // { assetId: "importe" }
  const [guardando, setGuardando] = useState(false);

  function abrir(fila) {
    if (fila) {
      setEMonth(fila.month); setMes(fila.month);
      setImp(Object.fromEntries(planAssets.map(a => [a.id, String(fila.per[a.id]?.ap || "")])));
    } else {
      setEMonth(null); setMes("");
      setImp(Object.fromEntries(planAssets.map(a => [a.id, ""])));
    }
    setSh(true);
  }

  async function guardar() {
    if (!mes) return;
    setGuardando(true);
    await saveMonth(mes, Object.fromEntries(planAssets.map(a => [a.id, parseFloat(imp[a.id]) || 0])));
    setGuardando(false); setSh(false); setEMonth(null);
  }

  const totalMes = planAssets.reduce((s, a) => s + (parseFloat(imp[a.id]) || 0), 0);
  // En el formulario se agrupa por plataforma: el mismo fondo en MyInvestor y en
  // Trade Republic son dos casillas distintas, y así no hay confusión posible.
  const porPlataforma = {};
  for (const a of planAssets) (porPlataforma[a.platform] = porPlataforma[a.platform] || []).push(a);

  const nCols = planAssets.length + 1;   // +1 por la columna TOTAL de cada grupo
  const cabecera = (grupo, sep) => (
    <th colSpan={nCols} style={{ ...GH(), ...(sep ? GSEP() : null) }}>{grupo}</th>
  );
  const subcabeceras = (sep, tinte) => planAssets.map((a, i) => (
    <th key={a.id} style={{ ...(sep && i === 0 ? GSEP() : null), background: tono(a) + (tinte || "10"), color: tono(a), lineHeight: 1.35 }}>
      {corto(a)}
      <div style={{ fontSize: 8, fontWeight: 500, color: PC()[a.platform] || P.t3 }}>{abrev(a.platform)}</div>
    </th>
  )).concat(
    <th key="tot" style={{ background: P.ac + "14", color: P.ac }}>TOTAL</th>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Fondos — Mensual</h2>
          <div style={{ fontSize: 9, color: nav ? P.me : P.clc, marginTop: 2 }}>
            {nav ? "Valor y rentabilidad calculados con el valor liquidativo de Yahoo" : "Sin valor liquidativo de Yahoo — no se puede calcular el valor"}
          </div>
        </div>
        <button className="bp" disabled={!planAssets.length} onClick={() => abrir(null)}>+ Mes</button>
      </div>

      {!contribOk && <div className="cd" style={{ background: `${P.clc}12`, borderColor: `${P.clc}2b`, padding: 12 }}>
        <p style={{ margin: 0, fontSize: 11, color: P.clc }}>
          Falta la tabla <code>fund_contributions</code>. Ejecuta <strong>migracion-plan-mensual.sql</strong> en
          Supabase para poder añadir o editar meses. Abajo se muestra el histórico de la tabla antigua.
        </p>
      </div>}

      {!planAssets.length
        ? <div className="cd"><p style={{ margin: 0, fontSize: 11, color: P.t4 }}>
            Ningún activo está marcado como del plan mensual. Márcalos en Cartera → clic en el activo →
            "Aporto a este activo cada mes", o pasa <strong>migracion-plan-mensual.sql</strong>.
          </p></div>
        : <div className="cd" style={{ padding: 0 }}>
          <div className="rtable"><table><thead>
            <tr>
              <th rowSpan={2} style={{ verticalAlign: "bottom", cursor: "default" }}>Mes</th>
              {cabecera("Aportación Mensual", false)}
              {cabecera("Suma de aportaciones", true)}
              {cabecera("Rentabilidad", true)}
              <th rowSpan={2} />
            </tr>
            <tr>
              {subcabeceras(false, "08")}
              {subcabeceras(true)}
              {subcabeceras(true)}
            </tr>
          </thead><tbody>
            {plan.map(f => (
              <tr key={f.month} style={{ cursor: "pointer" }} onClick={() => abrir(f)}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fMN(f.month)}</td>
                {planAssets.map((a, i) => (
                  <td key={"ap" + a.id} style={{ fontFamily: "monospace", color: tono(a) }}>
                    {f.per[a.id]?.ap > 0 ? fE(f.per[a.id].ap) : "—"}
                  </td>
                ))}
                <td style={{ fontFamily: "monospace", fontWeight: 600, background: P.ac + "0a" }}>{f.tot.ap > 0 ? fE(f.tot.ap) : "—"}</td>
                {planAssets.map((a, i) => (
                  <td key={"ac" + a.id} style={{ ...(i === 0 ? GSEP() : null), fontFamily: "monospace", color: tono(a), background: tono(a) + "08" }}>
                    {f.per[a.id]?.apAcum > 0 ? fE(f.per[a.id].apAcum) : "—"}
                  </td>
                ))}
                <td style={{ fontFamily: "monospace", fontWeight: 600, background: P.ac + "0a" }}>{fE(f.tot.apAcum)}</td>
                {planAssets.map((a, i) => (
                  <RentCell key={"r" + a.id} g={f.per[a.id]?.g || 0} r={f.per[a.id]?.pct || 0}
                    on={!!f.per[a.id]?.hasVal && f.per[a.id]?.apAcum > 0} tint={tono(a)} sep={i === 0} />
                ))}
                <RentCell g={f.tot.g} r={f.tot.pct} on={f.tot.hasVal} tint={P.ac} bold />
                <td><button className="bd" onClick={e => { e.stopPropagation(); removeMonth(f.month); }}>✕</button></td>
              </tr>
            ))}
            {!plan.length && <tr><td colSpan={3 * nCols + 2} style={{ color: P.t4 }}>Sin meses todavía. Pulsa "+ Mes".</td></tr>}
          </tbody></table></div>

          <div className="mob-card" style={{ padding: 12 }}>
            {plan.map(f => (
              <div key={f.month} className="mob-item" onClick={() => abrir(f)}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{fMN(f.month)}</div>
                <div className="shdr">Aportación del mes · {fE(f.tot.ap)}</div>
                {planAssets.filter(a => f.per[a.id]?.ap > 0).map(a => (
                  <div key={a.id} className="mob-row">
                    <span className="mob-lbl" style={{ color: tono(a) }}>{corto(a)} · {abrev(a.platform)}</span>
                    <span style={{ fontFamily: "monospace", color: tono(a) }}>{fE(f.per[a.id].ap)}</span>
                  </div>
                ))}
                <div className="shdr">Acumulado y rentabilidad</div>
                {planAssets.filter(a => f.per[a.id]?.apAcum > 0).map(a => (
                  <div key={a.id} className="mob-row">
                    <span className="mob-lbl" style={{ color: tono(a) }}>{corto(a)} · {abrev(a.platform)}</span>
                    <span style={{ fontFamily: "monospace" }}>
                      {fE(f.per[a.id].apAcum)}
                      {f.per[a.id].hasVal && <span style={{ color: rc(f.per[a.id].g) }}> → {fE(f.per[a.id].val)} ({fP(f.per[a.id].pct)})</span>}
                    </span>
                  </div>
                ))}
                <div className="mob-row" style={{ borderTop: "1px solid " + P.l2, marginTop: 4, paddingTop: 6 }}>
                  <span className="mob-lbl" style={{ color: P.ac, fontWeight: 700 }}>TOTAL</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                    {fE(f.tot.apAcum)}
                    {f.tot.hasVal && <span style={{ color: rc(f.tot.g) }}> → {fE(f.tot.val)} ({fP(f.tot.pct)})</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>}

      {sh && <Modal onClose={() => setSh(false)} title={eMonth ? "Editar " + fMN(eMonth) : "Añadir Mes"}>
        <F l="Mes"><input className="ip" type="month" value={mes} onChange={e => setMes(e.target.value)} disabled={!!eMonth} /></F>
        {Object.entries(porPlataforma).map(([plat, list]) => (
          <div key={plat}>
            <div className="shdr" style={{ color: PC()[plat] || P.t2 }}>{plat}</div>
            <div style={{ display: "grid", gridTemplateColumns: list.length > 1 ? "1fr 1fr" : "1fr", gap: 8 }}>
              {list.map(a => (
                <F key={a.id} l={corto(a) + " (€)"}>
                  <input className="ip" type="number" step="0.01" placeholder="0"
                    value={imp[a.id] ?? ""} onChange={e => setImp({ ...imp, [a.id]: e.target.value })} />
                </F>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: P.t2, borderTop: "1px solid " + P.l2, paddingTop: 8 }}>
          <span>Total del mes</span>
          <strong style={{ fontFamily: "monospace", color: P.ac }}>{fE(totalMes)}</strong>
        </div>
        <div style={{ fontSize: 10, color: P.t4, background: `${P.up}12`, border: `1px solid ${P.up}2b`, borderRadius: 8, padding: "9px 11px", lineHeight: 1.5 }}>
          Solo hace falta lo aportado a cada uno. La app pide a Yahoo el valor liquidativo del mes,
          calcula las participaciones compradas y con ellas el valor y la rentabilidad. Lo que dejes
          vacío o a 0 no cuenta como aportación ese mes.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="bp" style={{ flex: 1 }} disabled={guardando || !mes} onClick={guardar}>{guardando ? "Guardando..." : "Guardar"}</button>
          <button className="bs" onClick={() => setSh(false)}>Cancelar</button>
        </div>
      </Modal>}
    </div>
  );
}

function Comp({ plan }) {
  const data = plan.filter(m => m.tot.apAcum > 0);
  if (!data.length) return <div className="cd"><p style={{ color: P.t4 }}>Sin datos en Fondos Mensual</p></div>;
  const rows = data.map((m, idx) => {
    let v3 = 0, v9 = 0;
    for (let j = 0; j <= idx; j++) { const ap = data[j].tot.ap; const mi = idx - j; v3 += ap * Math.pow(1 + 0.03 / 12, mi); v9 += ap * Math.pow(1 + 0.09 / 12, mi); }
    v3 = r2(v3); v9 = r2(v9);
    const ac = m.tot.apAcum;
    return { label: fMN(m.month), ap: ac, real: m.tot.val, gR: m.tot.g, v3, v9, g3: r2(v3 - ac), g9: r2(v9 - ac) };
  });
  const cd = rows.map(r => ({ label: r.label, "Solo aportación": r.ap, "Cartera Real": r.real, "Al 3%": r.v3, "Al 9%": r.v9 }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Comparativa — Plan mensual</h2>
      <div className="cd" style={{ padding: 0 }}>
        <div className="rtable"><table><thead><tr>
          <th>Mes</th>
          <th style={{ textAlign: "right", color: P.t3 }}>Solo aportación</th>
          <th style={{ textAlign: "right", color: P.ac }}>Cartera Real</th>
          <th style={{ textAlign: "right", color: P.clc }}>Al 3% anual</th>
          <th style={{ textAlign: "right", color: P.or }}>Al 9% anual</th>
        </tr></thead><tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.label}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t3 }}>{fE(r.ap)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}><span style={{ color: P.ac }}>{fE(r.real)}</span> <span style={{ fontSize: 10, color: rc(r.gR) }}>({fE(r.gR)})</span></td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}><span style={{ color: P.clc }}>{fE(r.v3)}</span> <span style={{ fontSize: 10, color: P.rv }}>({fE(r.g3)})</span></td>
              <td style={{ textAlign: "right", fontFamily: "monospace" }}><span style={{ color: P.or }}>{fE(r.v9)}</span> <span style={{ fontSize: 10, color: P.rv }}>({fE(r.g9)})</span></td>
            </tr>
          ))}
        </tbody></table></div>
        <div className="mob-card" style={{ padding: 12 }}>
          {rows.map(r => (
            <div key={r.label} className="mob-item">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{r.label}</div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: P.t3 }}>Solo aportación</span><span style={{ fontFamily: "monospace", color: P.t3 }}>{fE(r.ap)}</span></div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: P.ac }}>Cartera Real</span><span style={{ fontFamily: "monospace", color: rc(r.gR) }}>{fE(r.real)}</span></div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: P.clc }}>Al 3%</span><span style={{ fontFamily: "monospace", color: P.clc }}>{fE(r.v3)}</span></div>
              <div className="mob-row"><span className="mob-lbl" style={{ color: P.or }}>Al 9%</span><span style={{ fontFamily: "monospace", color: P.or }}>{fE(r.v9)}</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="cd" style={{ background: `${P.rv}0d`, borderColor: `${P.rv}2b`, padding: 12 }}>
        <p style={{ margin: 0, fontSize: 10, color: P.t4 }}>Interés compuesto en <span style={{ color: P.rv, fontWeight: 700 }}>morado</span>. Cada aportación se compone por los meses que lleva invertida (DCA real).</p>
      </div>
      <div className="cd"><div style={{ fontSize: 8, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Proyección</div><div style={{ height: 250 }}><ResponsiveContainer><LineChart data={cd}><CartesianGrid strokeDasharray="3 3" stroke={P.l1} /><XAxis dataKey="label" tick={{ fill: P.t5, fontSize: 8 }} /><YAxis tick={{ fill: P.t5, fontSize: 8 }} tickFormatter={v => (v / 1000).toFixed(1) + "k"} /><Tooltip contentStyle={TIP().contentStyle} labelStyle={TIP().labelStyle} itemStyle={TIP().itemStyle} formatter={v => fE(v)} /><Legend wrapperStyle={{ fontSize: 9 }} /><Line type="monotone" dataKey="Solo aportación" stroke={P.t3} strokeWidth={2} strokeDasharray="5 5" dot={false} /><Line type="monotone" dataKey="Cartera Real" stroke={P.ac} strokeWidth={2.5} dot={{ r: 3, fill: P.ac }} /><Line type="monotone" dataKey="Al 3%" stroke={P.clc} strokeWidth={1.5} strokeDasharray="3 3" dot={false} /><Line type="monotone" dataKey="Al 9%" stroke={P.or} strokeWidth={1.5} strokeDasharray="3 3" dot={false} /></LineChart></ResponsiveContainer></div></div>
    </div>
  );
}

const CATL = { RV: "Renta Variable", RF: "Renta Fija" };
const mCorto = m => new Date(m + "-01").toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
const anoDe = d => d.slice(0, 4);

// Serie histórica por activo, con lo aportado y el valor a cierre de cada mes y de
// cada año. Dos orígenes posibles, y el primero que tenga datos gana:
//   1. asset_snapshots — las fotos que guarda el botón. Cubre TODA la cartera.
//   2. fund_monthly — el histórico manual. Solo los tres fondos del plan.
function buildSeries(assets, snaps, plan, planAssets) {
  if (snaps.length) {
    const porActivo = new Map();
    for (const sn of snaps) {
      const m = porActivo.get(sn.assetId) || new Map();
      // De cada mes se queda la última foto: es el cierre de ese mes
      const mes = sn.takenOn.slice(0, 7);
      const prev = m.get(mes);
      if (!prev || prev.d <= sn.takenOn) m.set(mes, { d: sn.takenOn, ap: sn.aportado, val: sn.valorActual });
      porActivo.set(sn.assetId, m);
    }
    const out = [];
    for (const a of assets) {
      const m = porActivo.get(a.id);
      if (!m) continue;
      out.push({ key: a.id, name: a.name, sub: a.platform + " · " + a.type, tint: TC()[a.type], byMonth: m });
    }
    if (out.length) return { entries: out, origen: "fotos" };
  }
  const entries = planAssets.map(a => {
    const byMonth = new Map();
    for (const m of plan) {
      const d = m.per[a.id];
      if (d && (d.apAcum > 0 || d.val > 0)) byMonth.set(m.month, { d: m.month, ap: d.apAcum, val: d.val });
    }
    return { key: a.id, name: a.name, sub: a.platform + " · plan mensual", tint: tono(a), byMonth };
  }).filter(e => e.byMonth.size);
  return { entries, origen: "fondos" };
}

// Último mes registrado de cada año, por entrada
function cierresPorAno(entry) {
  const out = new Map();
  for (const mes of [...entry.byMonth.keys()].sort()) out.set(anoDe(mes), entry.byMonth.get(mes));
  return out;
}

// Lo aportado y lo ganado de una entrada en un año concreto.
// 'aportado' en el histórico es acumulado, así que lo del año es la diferencia
// con el cierre del año anterior.
function tramoAno(entry, ano) {
  const cierres = cierresPorAno(entry);
  const anos = [...cierres.keys()].sort();
  const i = anos.indexOf(ano);
  if (i < 0) return null;
  const fin = cierres.get(ano);
  const prev = i > 0 ? cierres.get(anos[i - 1]) : null;
  const ap = fin.ap - (prev ? prev.ap : 0);
  const ini = prev ? prev.val : 0;
  const g = fin.val - ini - ap;
  const base = ini + ap;
  return { ap, ini, fin: fin.val, g, pct: base > 0 ? (g / base) * 100 : 0 };
}

function anosDe(entries) {
  const set = new Set();
  for (const e of entries) for (const mes of e.byMonth.keys()) set.add(anoDe(mes));
  return [...set].sort();
}

// Mini gráfica: valor de cierre mes a mes sobre lo aportado acumulado
function MiniChart({ item, meses }) {
  const pts = meses.map(mes => ({ label: mCorto(mes), val: item.byMonth.get(mes).val, ap: item.byMonth.get(mes).ap }));
  const ini = pts[0], fin = pts[pts.length - 1];
  const apTramo = fin.ap - ini.ap;
  const g = fin.val - ini.val - apTramo;
  const base = ini.val + apTramo;
  const pct = base > 0 ? (g / base) * 100 : 0;
  const id = "mg" + String(item.key).replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div className="cd" style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
          <div style={{ fontSize: 8, color: P.t4 }}>{item.sub}</div>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>{fE(fin.val)}</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: rc(g) }}>{fE(g)} ({fP(pct)})</div>
        </div>
      </div>
      <div style={{ height: 86 }}>
        <ResponsiveContainer>
          <AreaChart data={pts} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.tint || P.ac} stopOpacity={.28} />
                <stop offset="100%" stopColor={item.tint || P.ac} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fill: P.t5, fontSize: 8 }} interval="preserveStartEnd" />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Tooltip contentStyle={TIP().contentStyle} labelStyle={TIP().labelStyle} itemStyle={TIP().itemStyle}
              formatter={(v, k) => [fE(v), k === "val" ? "Valor" : "Aportado"]} />
            <Area type="monotone" dataKey="ap" name="ap" stroke={P.t4} strokeWidth={1} strokeDasharray="3 3" fill="none" dot={false} />
            <Area type="monotone" dataKey="val" name="val" stroke={item.tint || P.ac} strokeWidth={2} fill={"url(#" + id + ")"} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KPI({ l, v, sub, color }) {
  return (
    <div className="cd">
      <div style={{ fontSize: 9, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{l}</div>
      <div style={{ fontSize: 20, fontFamily: "monospace", fontWeight: 700, color }}>{fE(v)}</div>
      {sub != null && <div style={{ fontSize: 11, fontFamily: "monospace", color }}>{sub}</div>}
    </div>
  );
}

function Anu({ assets, plan, planAssets, snaps, tI, tV, tG }) {
  const [ano, setAno] = useState("Total");   // "Total" o un año concreto
  const [gb, setGb] = useState("Activo");
  const s = useSort("valorActual", -1);

  const { entries, origen } = useMemo(() => buildSeries(assets, snaps, plan, planAssets), [assets, snaps, plan, planAssets]);
  const anos = useMemo(() => anosDe(entries), [entries]);
  const esTotal = ano === "Total" || !anos.includes(ano);

  // Filas de la tabla de años. La de TOTAL es toda la cartera a día de hoy.
  const filasAno = useMemo(() => anos.map(y => {
    let ap = 0, ini = 0, fin = 0, meses = new Set();
    for (const e of entries) {
      const t = tramoAno(e, y);
      if (!t) continue;
      ap += t.ap; ini += t.ini; fin += t.fin;
      for (const mes of e.byMonth.keys()) if (anoDe(mes) === y) meses.add(mes);
    }
    const ms = [...meses].sort();
    const g = fin - ini - ap, base = ini + ap;
    return { y, ap, ini, fin, g, pct: base > 0 ? (g / base) * 100 : 0,
      label: y + (ms.length < 12 ? " (" + mCorto(ms[0]) + "–" + mCorto(ms[ms.length - 1]) + ")" : "") };
  }), [entries, anos]);

  // Base del detalle: en Total, la foto de hoy de todos los activos.
  // En un año, el tramo de ese año de cada entrada del histórico.
  const base = useMemo(() => {
    if (esTotal) return assets.map(a => ({ k: a.id, name: a.name, sub: a.platform + " · " + a.type, platform: a.platform, type: a.type, category: a.category, aportado: a.aportado, valorActual: a.valorActual }));
    return entries.map(e => {
      const t = tramoAno(e, ano);
      if (!t) return null;
      const a = assets.find(x => x.id === e.key);
      return { k: e.key, name: e.name, sub: e.sub, platform: a?.platform || "—", type: a?.type || "—", category: a?.category || "RV",
        aportado: t.ap, valorActual: t.fin, ini: t.ini, gPre: t.g, pctPre: t.pct };
    }).filter(Boolean);
  }, [esTotal, ano, assets, entries]);

  const totalValor = base.reduce((x, r) => x + r.valorActual, 0);

  const rows = useMemo(() => {
    let arr = base;
    if (gb !== "Activo") {
      const key = gb === "Plataforma" ? "platform" : gb === "Tipo" ? "type" : "category";
      const m = {};
      for (const r of base) {
        const k = r[key];
        if (!m[k]) m[k] = { k, name: CATL[k] || k, aportado: 0, valorActual: 0, ini: 0, n: 0 };
        m[k].aportado += r.aportado; m[k].valorActual += r.valorActual; m[k].ini += (r.ini || 0); m[k].n++;
      }
      arr = Object.values(m).map(r => ({ ...r, sub: r.n + (r.n === 1 ? " activo" : " activos") }));
    }
    return arr.map(r => {
      const g = r.valorActual - r.aportado - (r.ini || 0);
      const den = (r.ini || 0) + r.aportado;
      return { ...r, gananciaEur: g, gananciaPct: den > 0 ? (g / den) * 100 : 0, peso: totalValor > 0 ? (r.valorActual / totalValor) * 100 : 0 };
    }).sort(s.sortFn);
  }, [base, gb, totalValor, s.sortFn]);

  // KPIs del ámbito elegido
  const kAp = esTotal ? tI : rows.reduce((x, r) => x + r.aportado, 0);
  const kVal = esTotal ? tV : totalValor;
  const kIni = esTotal ? 0 : rows.reduce((x, r) => x + (r.ini || 0), 0);
  const kG = esTotal ? tG : kVal - kIni - kAp;
  const kBase = kIni + kAp;

  const bars = rows.filter(r => r.aportado > 0 || r.ini > 0)
    .map(r => ({ name: r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, pct: Math.round(r.gananciaPct * 100) / 100, eur: r.gananciaEur }))
    .sort((a, b) => b.pct - a.pct);

  // Meses que entran en las mini gráficas
  const mesesAmbito = useMemo(() => {
    const set = new Set();
    for (const e of entries) for (const mes of e.byMonth.keys()) if (esTotal || anoDe(mes) === ano) set.add(mes);
    return [...set].sort();
  }, [entries, esTotal, ano]);
  const detalle = entries.map(e => ({ e, meses: mesesAmbito.filter(m => e.byMonth.has(m)) })).filter(d => d.meses.length > 1);

  const desde = plan.length ? plan[0].month : null;
  const meses = desde ? Math.max(1, Math.round((Date.now() - new Date(desde + "-01").getTime()) / 2629800000)) : 0;
  const ambito = esTotal ? "toda la historia" : "el año " + ano;

  const thAno = { cursor: "pointer", textAlign: "right" };
  const filaSel = y => ({ cursor: "pointer", background: (esTotal ? y === "Total" : y === ano) ? P.ac + "1a" : undefined });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Anualidades</h2>
        {desde && <span style={{ fontSize: 10, color: P.t4 }}>Desde {fMN(desde)} · {meses} meses</span>}
      </div>

      {/* ── Selector: la tabla de años manda sobre todo lo de abajo ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, textTransform: "uppercase", letterSpacing: 1 }}>Por año</div>
        <span style={{ fontSize: 9, color: P.t4 }}>Pulsa una fila y todo lo de abajo se recalcula sobre {ambito}</span>
      </div>
      <div className="cd" style={{ padding: 0 }}>
        <div className="rtable"><table><thead><tr>
          <th style={{ cursor: "default" }}>Ámbito</th>
          <th style={{ ...thAno, cursor: "default" }}>Aportado</th>
          <th style={{ ...thAno, cursor: "default" }}>Valor inicio</th>
          <th style={{ ...thAno, cursor: "default" }}>Valor fin</th>
          <th style={{ ...thAno, cursor: "default" }}>Ganancia</th>
          <th style={{ ...thAno, cursor: "default" }}>%</th>
        </tr></thead><tbody>
          <tr onClick={() => setAno("Total")} style={filaSel("Total")}>
            <td style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{esTotal ? "▸ " : ""}TOTAL <span style={{ fontWeight: 400, color: P.t4 }}>· toda la cartera hoy</span></td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: P.ac }}>{fE(tI)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t4 }}>—</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fE(tV)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: rc(tG) }}>{fE(tG)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: rc(tG) }}>{fP(tI > 0 ? (tG / tI) * 100 : 0)}</td>
          </tr>
          {filasAno.map(r => (
            <tr key={r.y} onClick={() => setAno(r.y)} style={filaSel(r.y)}>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{!esTotal && r.y === ano ? "▸ " : ""}{r.label}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: P.ac }}>{fE(r.ap)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t4 }}>{fE(r.ini)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fE(r.fin)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: rc(r.g) }}>{fE(r.g)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: rc(r.g) }}>{fP(r.pct)}</td>
            </tr>
          ))}
          {!filasAno.length && <tr><td colSpan={6} style={{ color: P.t4 }}>Sin histórico todavía. Pulsa "Actualizar cotizaciones" para guardar la primera foto.</td></tr>}
        </tbody></table></div>
        <div className="mob-card" style={{ padding: 12 }}>
          {[{ y: "Total", label: "TOTAL · toda la cartera hoy", ap: tI, ini: 0, fin: tV, g: tG, pct: tI > 0 ? (tG / tI) * 100 : 0 }, ...filasAno].map(r => (
            <div key={r.y} className="mob-item" onClick={() => setAno(r.y)} style={{ borderColor: (esTotal ? r.y === "Total" : r.y === ano) ? P.ac + "59" : undefined }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{r.label}</div>
              <div className="mob-row"><span className="mob-lbl">Aportado</span><span style={{ fontFamily: "monospace", color: P.ac }}>{fE(r.ap)}</span></div>
              <div className="mob-row"><span className="mob-lbl">Valor</span><span style={{ fontFamily: "monospace" }}>{r.ini > 0 ? fE(r.ini) + " → " : ""}{fE(r.fin)}</span></div>
              <div className="mob-row"><span className="mob-lbl">Ganancia</span><span style={{ fontFamily: "monospace", color: rc(r.g) }}>{fE(r.g)} ({fP(r.pct)})</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Todo lo siguiente ya está filtrado por el ámbito ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <KPI l={esTotal ? "Aportado" : "Aportado en " + ano} v={kAp} color={P.ac} />
        {!esTotal && <KPI l="Valor al empezar" v={kIni} color={P.t2} />}
        <KPI l={esTotal ? "Valor Hoy" : "Valor al cerrar " + ano} v={kVal} />
        <KPI l={esTotal ? "Ganancia" : "Ganancia en " + ano} v={kG} color={rc(kG)} sub={fP(kBase > 0 ? (kG / kBase) * 100 : 0)} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, textTransform: "uppercase", letterSpacing: 1 }}>
          Detalle · {esTotal ? "total" : ano}
        </div>
        <div style={{ display: "flex", gap: 2, background: P.seg, padding: 3, borderRadius: 8, flexWrap: "wrap" }}>
          {["Activo", "Plataforma", "Tipo", "Categoría"].map(g => <button key={g} className={"tb" + (gb === g ? " ac" : "")} onClick={() => setGb(g)}>{g}</button>)}
        </div>
      </div>
      <div className="cd" style={{ padding: 0 }}>
        <div className="rtable"><table><thead><tr>
          <th onClick={() => s.toggle("name")}>{gb} {s.arrow("name")}</th>
          {!esTotal && <th onClick={() => s.toggle("ini")} style={{ textAlign: "right" }}>Valor inicio {s.arrow("ini")}</th>}
          <th onClick={() => s.toggle("aportado")} style={{ textAlign: "right" }}>{esTotal ? "Aportado" : "Aportado " + ano} {s.arrow("aportado")}</th>
          <th onClick={() => s.toggle("valorActual")} style={{ textAlign: "right" }}>{esTotal ? "Valor" : "Valor fin"} {s.arrow("valorActual")}</th>
          <th onClick={() => s.toggle("gananciaEur")} style={{ textAlign: "right" }}>Ganancia {s.arrow("gananciaEur")}</th>
          <th onClick={() => s.toggle("gananciaPct")} style={{ textAlign: "right" }}>% {s.arrow("gananciaPct")}</th>
          <th onClick={() => s.toggle("peso")} style={{ textAlign: "right" }}>Peso {s.arrow("peso")}</th>
        </tr></thead><tbody>
          {rows.map(r => (
            <tr key={r.k}>
              <td><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 9, color: P.t4 }}>{r.sub}</div></td>
              {!esTotal && <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t3 }}>{fE(r.ini || 0)}</td>}
              <td style={{ textAlign: "right", fontFamily: "monospace", color: P.ac }}>{fE(r.aportado)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fE(r.valorActual)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: rc(r.gananciaEur) }}>{fE(r.gananciaEur)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: rc(r.gananciaEur) }}>{fP(r.gananciaPct)}</td>
              <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t3 }}>{r.peso.toFixed(1)}%</td>
            </tr>
          ))}
          <tr style={{ borderTop: "2px solid " + P.l3 }}>
            <td style={{ fontWeight: 800 }}>TOTAL</td>
            {!esTotal && <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t3 }}>{fE(kIni)}</td>}
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: P.ac }}>{fE(kAp)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fE(kVal)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: rc(kG) }}>{fE(kG)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: rc(kG) }}>{fP(kBase > 0 ? (kG / kBase) * 100 : 0)}</td>
            <td style={{ textAlign: "right", fontFamily: "monospace", color: P.t3 }}>100%</td>
          </tr>
        </tbody></table></div>
        <div className="mob-card" style={{ padding: 12 }}>
          {rows.map(r => (
            <div key={r.k} className="mob-item">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{r.name}</span><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fE(r.valorActual)}</span></div>
              {!esTotal && <div className="mob-row"><span className="mob-lbl">Valor inicio</span><span style={{ fontFamily: "monospace" }}>{fE(r.ini || 0)}</span></div>}
              <div className="mob-row"><span className="mob-lbl">Aportado</span><span style={{ fontFamily: "monospace", color: P.ac }}>{fE(r.aportado)}</span></div>
              <div className="mob-row"><span className="mob-lbl">Ganancia</span><span style={{ fontFamily: "monospace", color: rc(r.gananciaEur) }}>{fE(r.gananciaEur)} ({fP(r.gananciaPct)})</span></div>
              <div className="mob-row"><span className="mob-lbl">Peso</span><span style={{ fontFamily: "monospace", color: P.t3 }}>{r.peso.toFixed(1)}%</span></div>
            </div>
          ))}
        </div>
      </div>

      {bars.length > 0 && <div className="cd">
        <div style={{ fontSize: 9, color: P.t4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Rentabilidad {esTotal ? "acumulada" : "en " + ano} por {gb.toLowerCase()}
        </div>
        <div style={{ height: bars.length * 30 + 34 }}>
          <ResponsiveContainer>
            <BarChart data={bars} layout="vertical" margin={{ left: 4, right: 34, top: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke={P.l1} />
              <XAxis type="number" tick={{ fill: P.t5, fontSize: 9 }} tickFormatter={v => v.toFixed(0) + "%"} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fill: P.t3, fontSize: 9 }} />
              <Tooltip contentStyle={TIP().contentStyle} labelStyle={TIP().labelStyle} itemStyle={TIP().itemStyle}
                formatter={(v, nm, pl) => [fP(v) + "  (" + fE(pl.payload.eur) + ")", "Rentabilidad"]} />
              <ReferenceLine x={0} stroke={P.l4} />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={16}>
                {bars.map(b => <Cell key={b.name} fill={rc(b.pct)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>}

      {detalle.length > 0 && <>
        <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, textTransform: "uppercase", letterSpacing: 1 }}>
          Mes a mes {esTotal ? "(todo el histórico)" : "de " + ano}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
          {detalle.map(d => <MiniChart key={d.e.key} item={d.e} meses={d.meses} />)}
        </div>
      </>}

      <div className="cd" style={{ background: `${P.rv}0d`, borderColor: `${P.rv}2b`, padding: 12 }}>
        <p style={{ margin: 0, fontSize: 10, color: P.t4, lineHeight: 1.6 }}>
          <strong style={{ color: P.rv }}>TOTAL</strong> es la foto de hoy de los {assets.length} activos: lo aportado frente al valor de cotización.<br />
          <strong style={{ color: P.rv }}>Los años</strong> salen {origen === "fotos"
            ? "de las fotos que guarda el botón de actualizar, así que cubren toda la cartera."
            : "del plan mensual, así que solo cubren los " + planAssets.length + " activos a los que aportas cada mes. En cuanto se acumulen fotos del botón pasarán a cubrir toda la cartera."}
          {" "}Por eso TOTAL puede no cuadrar con la suma de los años.<br />
          Ganancia de un año = <em>valor fin − valor inicio − aportado del año</em>, y el % se mide sobre el capital empleado (valor inicio + aportado).
        </p>
      </div>
    </div>
  );
}

function Sett({ loadAll, session, assets, toggleManual }) {
  const [msg, setMsg] = useState(null);
  async function reload() { setMsg("Recargando..."); await loadAll(); setMsg("✓ Datos recargados"); setTimeout(() => setMsg(null), 3000); }
  const ok = db.manualSupported();
  const groups = {};
  assets.forEach(a => { (groups[a.platform] = groups[a.platform] || []).push(a); });
  const nAuto = assets.filter(a => !a.manual).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Ajustes</h2>

      <div className="cd">
        <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, marginBottom: 3 }}>ACTUALIZACIÓN AUTOMÁTICA</div>
        <p style={{ fontSize: 10, color: P.t4, margin: "0 0 12px" }}>
          Desmarca los activos que lleves a mano: "Actualizar cotizaciones" los saltará y no
          sobrescribirá lo que hayas escrito. Ahora mismo se actualizan {nAuto} de {assets.length}.
        </p>
        {!ok && <p style={{ fontSize: 10, color: P.clc, margin: "0 0 12px", background: `${P.clc}12`, border: "1px solid ${P.clc}2b", borderRadius: 8, padding: "8px 10px" }}>
          Falta la columna <code>manual</code> en la tabla assets. Ejecuta <strong>migracion-valores-manuales.sql</strong> en Supabase y recarga: hasta entonces los checks no se pueden guardar.
        </p>}
        {Object.entries(groups).map(([plat, list]) => (
          <div key={plat}>
            <div className="shdr" style={{ color: PC()[plat] }}>{plat}</div>
            {list.map(a => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + P.l1, cursor: ok ? "pointer" : "not-allowed" }}>
                <input type="checkbox" disabled={!ok} checked={!a.manual} onChange={e => toggleManual(a.id, !e.target.checked)} style={{ cursor: ok ? "pointer" : "not-allowed" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 9, color: P.t4, fontFamily: "monospace" }}>{a.ticker} · {a.participaciones} part.</div>
                </span>
                <span className="bg" style={{ background: (TC()[a.type] || P.ac2) + "18", color: TC()[a.type] || P.ac }}>{a.type}</span>
                <span style={{ fontSize: 9, width: 74, textAlign: "right", color: a.manual ? P.clc : P.me }}>{a.manual ? "🔒 A mano" : "Cotización"}</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="cd">
        <div style={{ fontSize: 10, fontWeight: 700, color: P.t2, marginBottom: 6 }}>SESIÓN ACTIVA</div>
        <div style={{ fontSize: 12, color: P.t3, marginBottom: 12 }}>Sesión iniciada.</div>
        <button className="bp" onClick={reload} style={{ marginRight: 8 }}>{msg || "🔄 Recargar datos"}</button>
        <button className="bd" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </div>
      <div className="cd" style={{ background: `${P.up}0d`, borderColor: `${P.up}24` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: P.up, marginBottom: 6 }}>BASE DE DATOS</div>
        <p style={{ fontSize: 11, color: P.t4, margin: 0 }}>Todos los cambios se guardan automáticamente en Supabase. Los datos persisten entre sesiones y dispositivos.</p>
      </div>
    </div>
  );
}
