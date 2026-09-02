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

for (const nombre of ['Cartera', 'Fondos Mensual', 'Comparativa', 'Anualidades', 'Balanceo', 'Ajustes', 'Dashboard']) {
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

// Interacciones del Balanceo: ordenar, desmarcar, cambiar de eje, fijar objetivos
await click(btn('Balanceo'));
{
  const antes = errores.length;
  const ths = [...document.querySelectorAll('th')].filter(t => /Valor|Peso real|Ajuste/.test(t.textContent));
  for (const t of ths) { t.click(); await new Promise(r => setTimeout(r, 120)); }
  console.log('ordenar columnas'.padEnd(17) + (errores.length > antes ? '   ERROR' : '   ok (' + ths.length + ' cabeceras)'));
}
{
  const antes = errores.length;
  const cb = document.querySelector('tbody input[type=checkbox]');
  if (cb) { cb.click(); await new Promise(r => setTimeout(r, 300)); }
  console.log('desmarcar activo'.padEnd(17) + (cb ? (errores.length > antes ? '   ERROR' : '   ok') : '   no habia check'));
}
// Fondos Mensual: la tabla arranca plegada por año y los años se abren
await click(btn('Fondos Mensual'), 350);
{
  const filasIni = document.querySelectorAll('tbody tr').length;
  const antes = errores.length;
  const filaAno = [...document.querySelectorAll('tbody tr')].find(r => r.getAttribute('role') === 'button');
  console.log('mensual plegado'.padEnd(19) + 'filas=' + filasIni + (filaAno ? ' · fila de año: ' + filaAno.textContent.trim().slice(0, 22) : ' · SIN fila de año'));
  if (filaAno) {
    await click(filaAno, 350);
    {
      const txt = [...document.querySelectorAll('tbody tr')].map(r => r.textContent.trim().slice(0, 10));
      const iAno = txt.findIndex(t => t.indexOf('2026') === 0 || t.indexOf('2026') === 1);
      console.log('abrir un año'.padEnd(19) + 'filas=' + txt.length + ' · orden=[' + txt.join(' | ') + ']');
      console.log('año al final'.padEnd(19) + (iAno === txt.length - 1 || iAno === txt.length - 2 ? 'SI, los meses quedan encima' : 'NO, indice ' + iAno));
    }
    await click(filaAno, 300);
    console.log('cerrarlo'.padEnd(19) + 'filas=' + document.querySelectorAll('tbody tr').length);
  }
  await probar('abrir años', 'Abrir años');
  await probar('plegar años', 'Plegar años');
}
await click(btn('Balanceo'), 350);

// Check maestro: partiendo de TODOS marcados, debe desmarcarlos y bajarlos
await click(btn('Marcar todos'), 350);
{
  const maestro = () => document.querySelector('thead input[type=checkbox]');
  const m = maestro();
  if (!m) console.log('check maestro'.padEnd(19) + 'NO ENCONTRADO');
  else {
    const antes = errores.length;
    const filasAntes = document.querySelectorAll('tbody tr').length;
    console.log('todos marcados'.padEnd(19) + 'maestro checked=' + m.checked + ' · filas=' + filasAntes);
    await click(m, 400);
    const h = document.getElementById('root').innerHTML;
    console.log('pulsar maestro'.padEnd(19) + (errores.length > antes ? 'ERROR'
      : 'bloque "Fuera del calculo": ' + h.includes('Fuera del c') + ' · tabla desaparece: ' + (document.querySelectorAll('tbody tr').length === 0)));
    const sueltos = [...document.querySelectorAll('input[type=checkbox]')].filter(c => !c.checked).length;
    console.log('desmarcados'.padEnd(19) + sueltos + ' checks sin marcar abajo');
    const uno = [...document.querySelectorAll('input[type=checkbox]')].find(c => !c.checked);
    if (uno) { await click(uno, 400); console.log('remarcar uno'.padEnd(19) + 'filas en tabla=' + document.querySelectorAll('tbody tr').length); }
    await click(btn('Marcar todos'), 350);
    console.log('volver a todos'.padEnd(19) + 'maestro checked=' + (maestro() && maestro().checked));
  }
}
await probar('fijar objetivos', 'Fijar el actual');
for (const e of ['Categoría', 'Tipo', 'Plataforma', 'Activo']) await probar('eje ' + e, e);
await probar('marcar todos', 'Marcar todos');

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
