import { expect, test } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function loadEnvFile() {
  const path = join(process.cwd(), '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvFile()

const BASE = process.env.ANCLA_BASE_URL || 'http://127.0.0.1:5199'
const USER = process.env.ANCLA_USERNAME
const PASS = process.env.ANCLA_PASSWORD

test.describe('Ancla login', () => {
  test('API health is up', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:8787/api/health')
    expect(res.ok()).toBeTruthy()
  })

  test('can login with configured credentials via UI', async ({ page }) => {
    test.skip(!USER || !PASS, 'Set ANCLA_USERNAME/ANCLA_PASSWORD in .env')

    const apiLog: string[] = []
    page.on('response', (res) => {
      if (res.url().includes('/api/')) apiLog.push(`${res.status()} ${res.url()}`)
    })

    await page.goto(BASE)
    await expect(page.getByRole('heading', { name: /Ancla/i })).toBeVisible()

    await page.locator('input[autocomplete="username"]').fill(USER!)
    await page.locator('input[autocomplete="current-password"]').fill(PASS!)
    await page.getByRole('button', { name: /Entrar/i }).click()

    await expect(page.getByRole('button', { name: /Salir|Empezar/i })).toBeVisible({
      timeout: 15000,
    })

    expect(apiLog.some((l) => l.startsWith('200') && l.includes('/api/auth/login'))).toBeTruthy()
    expect(apiLog.some((l) => l.startsWith('200') && l.includes('/api/plan'))).toBeTruthy()
  })

  test('direct API login works', async ({ request }) => {
    test.skip(!USER || !PASS, 'Set ANCLA_USERNAME/ANCLA_PASSWORD in .env')
    const res = await request.post('http://127.0.0.1:8787/api/auth/login', {
      data: { username: USER, password: PASS },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBeTruthy()
  })
})
