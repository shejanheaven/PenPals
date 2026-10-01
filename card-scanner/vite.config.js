import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Runs the Vercel-style /api/*.js handlers inside the Vite dev server, so
// `npm run dev` works without the Vercel CLI.
function apiRoutes() {
  return {
    name: "local-api-routes",
    async configureServer(server) {
      if (process.env.MOCK_APIS === "1") await import("./test/mock-upstream.js");
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        const m = url.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          const handler = mod[req.method];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks = [];
          if (req.method !== "GET" && req.method !== "HEAD") for await (const c of req) chunks.push(c);
          const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]));
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Make server-side secrets from .env visible to the API handlers in dev.
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ""))) process.env[k] ??= v;
  return { plugins: [react(), apiRoutes()] };
});
