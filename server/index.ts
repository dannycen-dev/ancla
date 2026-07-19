import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { config as loadEnv } from './env'
import { initDb } from './db'
import { app } from './app'

loadEnv()
initDb()

const port = Number(process.env.PORT || 8787)

// Static assets from Vite build
app.use('/*', serveStatic({ root: './dist' }))
// SPA fallback for non-API routes (API already registered on `app`)
app.notFound(async (c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Not found' }, 404)
  }
  return serveStatic({ path: './dist/index.html' })(c, async () => undefined)
})

console.log(`[ancla] http://0.0.0.0:${port}`)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
