// Prueba de humo: monta la app entera en jsdom con datos falsos y captura
// cualquier error de render. Solo para depurar, no se despliega.
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';

// Vite primero: si jsdom pisa los globales antes, sus internos CJS revientan
import { resolve } from 'path';
const server = await createServer({
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
  // Los namespaces ESM son de solo lectura, así que el doble se inyecta por alias
  resolve: { alias: [
    { find: './db', replacement: resolve('.smoke/db-stub.js') },
    { find: './supabase', replacement: resolve('.smoke/supabase-stub.js') },
  ] },
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'getComputedStyle', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'CSSStyleDeclaration']) {
  if (w[k] !== undefined) { try { globalThis[k] = w[k]; } catch { /* solo getter */ } }
}
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = false;

const errores = [];
const orig = console.error;
console.error = (...a) => errores.push(a.map(x => (x && x.stack) || String(x)).join(' '));

// React se carga por import normal: ssrLoadModule le mete su build CJS y peta
const R = (await import('react')).default;
const RD = await import('react-dom/client');
const App = (await server.ssrLoadModule('/src/App.jsx')).default;

const root = RD.createRoot(document.getElementById('root'));
try {
  root.render(R.createElement(App, { session: { user: { email: 'x@y.z' } } }));
  await new Promise(r => setTimeout(r, 1500));
} catch (e) { errores.push('THROW: ' + e.stack); }
console.error = orig;


// Recorrer todas las pestañas: es donde están los componentes reescritos
const btn = t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t);
const click = async (b, ms) => { b.click(); await new Promise(r => setTimeout(r, ms || 300)); };

for (const nombre of ['Cartera', 'Fondos Mensual', 'Comparativa', 'Anualidades', 'Ajustes', 'Dashboard']) {
  const b = btn(nombre);
  if (!b) { console.log(nombre.padEnd(17) + 'BOTON NO ENCONTRADO'); continue; }
  const antes = errores.length;
  await click(b);
  const h = document.getElementById('root').innerHTML;
  console.log(nombre.padEnd(17) + String(h.length).padStart(7) + ' car.' + (errores.length > antes ? '   ' + (errores.length - antes) + ' ERROR' : '   ok'));
}

const probar = async (etiqueta, texto) => {
  const b = btn(texto);
  if (!b) { console.log(etiqueta.padEnd(17) + 'no disponible'); return; }
  const antes = errores.length;
  await click(b);
  console.log(etiqueta.padEnd(17) + (errores.length > antes ? '   ERROR' : '   ok'));
};

await click(btn('Cartera'));
await probar('modal + Activo', '+ Activo');
await click(btn('Fondos Mensual'));
await probar('modal + Mes', '+ Mes');

const tog = [...document.querySelectorAll('button')].find(b => /☀|🌙/.test(b.textContent));
if (tog) { const n = errores.length; await click(tog, 400); console.log('cambio de tema'.padEnd(17) + (errores.length > n ? '   ERROR' : '   ok')); }

const html = document.getElementById('root').innerHTML;
console.log('\nHTML final: ' + html.length + ' caracteres');
if (errores.length) {
  console.log('\n=== ERRORES (' + errores.length + ') ===');
  for (const e of errores.slice(0, 3)) console.log('\n' + e.split('\n').slice(0, 18).join('\n'));
} else console.log('sin errores en ninguna pestaña');
await server.close();
process.exit(0);
