// Paleta única para los dos temas. Los colores de acento son hex de 6 dígitos a
// propósito: el código los concatena con alfa ("#60a5fa" + "12") para los fondos
// tenues, y eso solo funciona con hex.

export const PAL = {
  dark: {
    bg: "linear-gradient(160deg,#0b0f1a,#101729,#0d1321)",
    card: "rgba(22,33,55,.65)",
    card2: "#1a2540",
    input: "rgba(10,18,32,.8)",
    seg: "rgba(10,18,32,.5)",
    thead: "rgba(10,18,32,.25)",
    shdr: "rgba(148,163,184,.06)",
    l1: "rgba(148,163,184,.05)",
    l2: "rgba(148,163,184,.08)",
    l3: "rgba(148,163,184,.12)",
    l4: "rgba(148,163,184,.2)",
    hov: "rgba(148,163,184,.06)",
    row: "rgba(148,163,184,.03)",
    tx: "#e2e8f0",
    t1: "#cbd5e1",
    t2: "#94a3b8",
    t3: "#64748b",
    t4: "#4b5563",
    t5: "#374151",
    ac: "#818cf8",
    ac2: "#6366f1",
    ac3: "#4f46e5",
    up: "#34d399",
    down: "#f87171",
    msc: "#60a5fa",
    emg: "#f472b6",
    clc: "#fbbf24",
    me: "#34d399",
    rv: "#a78bfa",
    rf: "#34d399",
    or: "#f97316",
    cy: "#22d3ee",
    my: "#0ea5e9",
    tr: "#ff6b35",
    shadow: "none",
  },
  light: {
    bg: "linear-gradient(160deg,#f7f9fc,#eef2f8,#f4f6fa)",
    card: "rgba(255,255,255,.92)",
    card2: "#ffffff",
    input: "#ffffff",
    seg: "rgba(15,23,42,.05)",
    thead: "rgba(15,23,42,.035)",
    shdr: "rgba(15,23,42,.05)",
    l1: "rgba(15,23,42,.07)",
    l2: "rgba(15,23,42,.10)",
    l3: "rgba(15,23,42,.14)",
    l4: "rgba(15,23,42,.24)",
    hov: "rgba(15,23,42,.06)",
    row: "rgba(15,23,42,.025)",
    tx: "#0f172a",
    t1: "#1e293b",
    t2: "#475569",
    t3: "#64748b",
    t4: "#7b8798",
    t5: "#aab4c2",
    ac: "#4f46e5",
    ac2: "#4f46e5",
    ac3: "#4338ca",
    up: "#047857",
    down: "#dc2626",
    msc: "#1d4ed8",
    emg: "#be185d",
    clc: "#b45309",
    me: "#047857",
    rv: "#6d28d9",
    rf: "#047857",
    or: "#c2410c",
    cy: "#0e7490",
    my: "#0369a1",
    tr: "#c2410c",
    shadow: "0 1px 2px rgba(15,23,42,.06)",
  },
};

const KEY = "pt-theme";

export function readTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch { /* modo privado o almacenamiento bloqueado */ }
  return "dark";
}

export function writeTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* se ignora */ }
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
}

export const css = P => `
  *{box-sizing:border-box}
  body{margin:0;background:${P.card2}}
  .cd{background:${P.card};border:1px solid ${P.l2};border-radius:14px;padding:18px;box-shadow:${P.shadow}}
  .tb{padding:8px 12px;border:none;background:0;color:${P.t3};cursor:pointer;font-size:12px;font-weight:500;border-radius:8px;transition:.2s;white-space:nowrap}
  .tb:hover{background:${P.hov};color:${P.t1}}
  .tb.ac{background:${P.ac}26;color:${P.ac}}
  .ip{background:${P.input};border:1px solid ${P.l3};border-radius:8px;padding:8px 11px;color:${P.tx};font-size:13px;width:100%;outline:0}
  select.ip{appearance:none}
  .ip:disabled{opacity:.55;cursor:not-allowed}
  .bp{background:linear-gradient(135deg,${P.ac2},${P.ac3});border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:12px}
  .bp:disabled{opacity:.6;cursor:wait}
  .bs{background:${P.hov};border:1px solid ${P.l2};color:${P.t2};padding:8px 14px;border-radius:8px;cursor:pointer;font-size:12px}
  .bd{background:${P.down}1a;border:1px solid ${P.down}33;color:${P.down};padding:4px 10px;border-radius:6px;cursor:pointer;font-size:10px}
  .bg{display:inline-block;padding:3px 6px;border-radius:4px;font-size:9px;font-weight:600;text-transform:uppercase}
  .asset-row{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 0;border-bottom:1px solid ${P.l1};gap:8px}
  .asset-row:last-child{border-bottom:none}
  .shdr{padding:5px 8px;background:${P.shdr};border-radius:5px;font-size:9px;font-weight:600;color:${P.t2};margin:8px 0 3px;text-transform:uppercase}
  .rtable{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .rtable table{width:100%;border-collapse:collapse;min-width:500px}
  .rtable th{padding:8px 10px;text-align:left;font-size:9px;font-weight:600;color:${P.t3};text-transform:uppercase;letter-spacing:.5px;background:${P.thead};white-space:nowrap;cursor:pointer;user-select:none}
  .rtable th:hover{color:${P.tx}}
  .rtable td{padding:9px 10px;font-size:11px;border-bottom:1px solid ${P.l1};vertical-align:middle}
  .rtable tr:hover td{background:${P.row}}
  .mob-card{display:none}
  @media(max-width:640px){
    .rtable{display:none}
    .mob-card{display:block}
    .mob-item{background:${P.card};border:1px solid ${P.l2};border-radius:10px;padding:12px;margin-bottom:8px}
    .mob-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px}
    .mob-lbl{color:${P.t3};font-size:10px}
  }
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .pu{animation:pulse 1.2s ease-in-out infinite}
`;

// Velo de los modales: en claro no puede ser negro puro
PAL.dark.veil = "rgba(0,0,0,.6)";
PAL.light.veil = "rgba(15,23,42,.35)";
