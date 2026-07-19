import { existsSync } from 'node:fs'
import { join } from 'node:path'

const privateSeed = join(process.cwd(), 'data/seed.private.json')
const example = join(process.cwd(), 'data/seed.example.json')

if (existsSync(privateSeed)) {
  console.log('OK: data/seed.private.json present (will be loaded into SQLite on first boot)')
} else if (existsSync(example)) {
  console.warn('WARN: using data/seed.example.json (demo). Copy to seed.private.json for real plan.')
} else {
  console.error('Missing seed files')
  process.exit(1)
}

if (!process.env.ANCLA_USERNAME || !process.env.ANCLA_PASSWORD) {
  console.warn('WARN: set ANCLA_USERNAME / ANCLA_PASSWORD in .env before first boot')
} else {
  console.log('OK: auth env vars detected')
}
