import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Runs the /api functions locally during `npm run dev`, the same way Vercel
// runs them in production (Web-standard Request -> Response handlers).
function apiDevServer() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()
        const name = req.url.slice(5).split('?')[0].replace(/[^a-z0-9-]/gi, '')
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          const handler = mod[req.method]
          if (!handler) { res.statusCode = 405; return res.end() }
          const chunks = []
          for await (const c of req) chunks.push(c)
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
          })
          const response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          if (/Failed to load url|does not exist/i.test(e.message)) { res.statusCode = 404; return res.end() }
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make server-side keys from .env (ANTHROPIC_API_KEY, FINNHUB_KEY, ...) visible to /api in dev.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), apiDevServer()] }
})
