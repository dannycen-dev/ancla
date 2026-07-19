import { serve } from '@hono/node-server'
import { config as loadEnv } from './env'
import { initDb } from './db'
import { app } from './app'

loadEnv()
initDb()

const port = Number(process.env.PORT || 8787)
console.log(`[ancla:dev-api] http://127.0.0.1:${port}`)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
