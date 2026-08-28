import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync } from 'fs'

// En producción los ficheros de api/ los ejecuta Vercel como funciones serverless,
// pero el servidor de desarrollo de Vite no las conoce y las llamadas darían 404.
// Este plugin monta cada api/*.js en el dev server, adaptando el objeto res de Node
// a la API de Vercel (res.status().json()). Los ficheros con _ delante son código
// compartido, no endpoints, igual que en Vercel.
function apiDev() {
  return {
    name: 'api-dev',
    apply: 'serve',
    configureServer(server) {
      const rutas = readdirSync('api')
        .filter(f => f.endsWith('.js') && !f.startsWith('_'))
        .map(f => f.replace(/\.js$/, ''))
      for (const ruta of rutas) {
        server.middlewares.use('/api/' + ruta, async (req, res) => {
          res.status = c => { res.statusCode = c; return res }
          res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res }
          try {
            let raw = ''
            for await (const chunk of req) raw += chunk
            req.body = raw ? JSON.parse(raw) : {}
            const mod = await server.ssrLoadModule('/api/' + ruta + '.js')
            await mod.default(req, res)
          } catch (e) {
            server.config.logger.error('[api/' + ruta + '] ' + e.stack)
            if (!res.headersSent) res.status(500).json({ error: e.message })
          }
        })
      }
      server.config.logger.info('  api dev: ' + rutas.map(r => '/api/' + r).join(', '))
    },
  }
}

export default defineConfig({
  // strictPort: si el 5173 está ocupado se para en vez de saltar al 5174 en
  // silencio. Un servidor viejo colgado sirviendo código antiguo es peor que
  // un error claro.
  server: { port: 5173, strictPort: true },
  plugins: [react(), apiDev()],
})
