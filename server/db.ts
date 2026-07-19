import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = process.env.ANCLA_DB_PATH || join(DATA_DIR, 'ancla.db')

export type Seed = {
  version: number
  profile: Record<string, unknown>
  slots: Record<string, unknown>
  meals: unknown[]
  planRules: string[]
  craving: Record<string, unknown>
  exerciseMedia: Record<string, unknown>
  workouts: Record<string, unknown>
  copy: Record<string, string>
}

let db: Database.Database

export function getDb() {
  if (!db) throw new Error('DB not initialized')
  return db
}

function loadSeedFile(): Seed {
  const privatePath = join(DATA_DIR, 'seed.private.json')
  const examplePath = join(DATA_DIR, 'seed.example.json')
  const path = existsSync(privatePath) ? privatePath : examplePath
  if (!existsSync(path)) {
    throw new Error('No seed found. Copy data/seed.example.json to data/seed.private.json')
  }
  console.log(`[ancla] loading seed: ${path.includes('private') ? 'PRIVATE' : 'example (public demo)'}`)
  return JSON.parse(readFileSync(path, 'utf8')) as Seed
}

export function initDb() {
  mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plan_blob (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS day_logs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, date)
    );
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start TEXT NOT NULL
    );
  `)

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
  if (userCount.c === 0) {
    seedFresh()
  }
  return db
}

function seedFresh() {
  const username = process.env.ANCLA_USERNAME
  const password = process.env.ANCLA_PASSWORD
  if (!username || !password) {
    throw new Error(
      'First boot requires ANCLA_USERNAME and ANCLA_PASSWORD in .env (never commit .env)',
    )
  }
  if (password.length < 8) {
    throw new Error('ANCLA_PASSWORD must be at least 8 characters')
  }

  const seed = loadSeedFile()
  const hash = bcrypt.hashSync(password, 12)
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(username, hash, now)
    const userId = Number(info.lastInsertRowid)
    db.prepare('INSERT INTO plan_blob (user_id, payload, updated_at) VALUES (?, ?, ?)').run(
      userId,
      JSON.stringify(seed),
      now,
    )
  })
  tx()
  console.log(`[ancla] seeded user "${username}" and plan blob`)
}

export function createSession(userId: number) {
  const id = randomBytes(32).toString('hex')
  const created = new Date()
  const expires = new Date(created.getTime() + 1000 * 60 * 60 * 24 * 14) // 14 days
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    expires.toISOString(),
    created.toISOString(),
  )
  return { id, expires }
}

export function destroySession(sessionId: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
}

export function getSessionUser(sessionId: string | undefined) {
  if (!sessionId) return null
  const row = db
    .prepare(
      `SELECT u.id, u.username, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as { id: number; username: string; expires_at: string } | undefined
  if (!row) return null
  if (new Date(row.expires_at) < new Date()) {
    destroySession(sessionId)
    return null
  }
  return { id: row.id, username: row.username }
}

export function verifyLogin(username: string, password: string) {
  const row = db
    .prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .get(username) as { id: number; password_hash: string } | undefined
  if (!row) return null
  if (!bcrypt.compareSync(password, row.password_hash)) return null
  return row.id
}

export function checkRateLimit(ip: string, max = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now()
  const row = db
    .prepare('SELECT count, window_start FROM login_attempts WHERE ip = ?')
    .get(ip) as { count: number; window_start: string } | undefined
  if (!row) {
    db.prepare('INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?)').run(
      ip,
      new Date(now).toISOString(),
    )
    return { ok: true, remaining: max - 1 }
  }
  const start = new Date(row.window_start).getTime()
  if (now - start > windowMs) {
    db.prepare('UPDATE login_attempts SET count = 1, window_start = ? WHERE ip = ?').run(
      new Date(now).toISOString(),
      ip,
    )
    return { ok: true, remaining: max - 1 }
  }
  if (row.count >= max) {
    return { ok: false, remaining: 0 }
  }
  db.prepare('UPDATE login_attempts SET count = count + 1 WHERE ip = ?').run(ip)
  return { ok: true, remaining: max - row.count - 1 }
}

export function clearRateLimit(ip: string) {
  db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip)
}

export function getPlan(userId: number): Seed {
  const row = db.prepare('SELECT payload FROM plan_blob WHERE user_id = ?').get(userId) as
    | { payload: string }
    | undefined
  if (!row) throw new Error('Plan not found')
  return JSON.parse(row.payload) as Seed
}

export function getDayLog(userId: number, date: string) {
  const row = db
    .prepare('SELECT payload FROM day_logs WHERE user_id = ? AND date = ?')
    .get(userId, date) as { payload: string } | undefined
  return row ? JSON.parse(row.payload) : null
}

export function upsertDayLog(userId: number, date: string, payload: unknown) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO day_logs (user_id, date, payload, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(userId, date, JSON.stringify(payload), now)
}

export function getWeekLogs(userId: number, dates: string[]) {
  const out: Record<string, unknown> = {}
  const stmt = db.prepare('SELECT date, payload FROM day_logs WHERE user_id = ? AND date = ?')
  for (const d of dates) {
    const row = stmt.get(userId, d) as { date: string; payload: string } | undefined
    if (row) out[d] = JSON.parse(row.payload)
  }
  return out
}
