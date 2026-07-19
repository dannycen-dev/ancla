import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  checkRateLimit,
  clearRateLimit,
  createSession,
  destroySession,
  getDayLog,
  getPlan,
  getSessionUser,
  getWeekLogs,
  upsertDayLog,
  verifyLogin,
} from './db'

type Vars = { userId: number; username: string }

export const app = new Hono<{ Variables: Vars }>()

const SESSION_COOKIE = 'ancla_session'
const isProd = process.env.NODE_ENV === 'production'

function clientIp(c: { req: { header: (n: string) => string | undefined } }) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'local'
  )
}

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/auth/me', (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ authenticated: false }, 401)
  return c.json({ authenticated: true, username: user.username })
})

app.post('/api/auth/login', async (c) => {
  const ip = clientIp(c)
  const limit = checkRateLimit(ip)
  if (!limit.ok) {
    return c.json({ error: 'Demasiados intentos. Espera 15 minutos.' }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'JSON invalido' }, 400)
  }

  const parsed = z
    .object({
      username: z.string().min(1).max(64),
      password: z.string().min(1).max(200),
    })
    .safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Credenciales invalidas' }, 400)
  }

  const userId = verifyLogin(parsed.data.username, parsed.data.password)
  if (!userId) {
    return c.json({ error: 'Usuario o contrasena incorrectos' }, 401)
  }

  clearRateLimit(ip)
  const session = createSession(userId)
  setCookie(c, SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: '/',
    expires: session.expires,
  })
  return c.json({ ok: true, username: parsed.data.username })
})

app.post('/api/auth/logout', (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  if (sid) destroySession(sid)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.use('/api/plan/*', async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  c.set('userId', user.id)
  c.set('username', user.username)
  await next()
})

app.use('/api/logs/*', async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  c.set('userId', user.id)
  c.set('username', user.username)
  await next()
})

app.get('/api/plan', (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  const plan = getPlan(user.id)
  return c.json({ plan })
})

app.get('/api/logs/:date', (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  const date = c.req.param('date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Fecha invalida' }, 400)
  return c.json({ log: getDayLog(user.id, date) })
})

app.put('/api/logs/:date', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  const date = c.req.param('date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Fecha invalida' }, 400)
  let payload: unknown
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'JSON invalido' }, 400)
  }
  upsertDayLog(user.id, date, payload)
  return c.json({ ok: true })
})

app.get('/api/logs', (c) => {
  const sid = getCookie(c, SESSION_COOKIE)
  const user = getSessionUser(sid)
  if (!user) return c.json({ error: 'No autenticado' }, 401)
  const from = c.req.query('from')
  const to = c.req.query('to')
  // simple: last 7 if not provided
  const dates: string[] = []
  if (from && to) {
    const d = new Date(from + 'T12:00:00')
    const end = new Date(to + 'T12:00:00')
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10))
      d.setDate(d.getDate() + 1)
    }
  } else {
    const d = new Date()
    for (let i = 6; i >= 0; i--) {
      const x = new Date(d)
      x.setDate(d.getDate() - i)
      dates.push(x.toISOString().slice(0, 10))
    }
  }
  return c.json({ logs: getWeekLogs(user.id, dates) })
})
