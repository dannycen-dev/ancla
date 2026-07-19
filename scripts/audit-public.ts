/**
 * Fails if sensitive personal content would be published.
 * Markers are base64-encoded so the public tree does not advertise them.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data'])
const ALLOW_FILES = new Set([
  'scripts/audit-public.ts',
  'README.md',
  '.env.example',
  'data/seed.example.json',
])

function decode(list: string[]) {
  return list.map((b64) => Buffer.from(b64, 'base64').toString('utf8'))
}

const MARKERS = decode([
  'VERBSA==',
  'cnVwdHVyYQ==',
  'RGFubnkgQ2Vu',
  'ZGFubnljZW4=',
  'UGxhbmkgTWVzIDEuMA==',
  'YW5zaWVkYWQgcG9yIGxhIHJ1cHR1cmE='
])

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const errors: string[] = []

const example = join(ROOT, 'data/seed.example.json')
if (existsSync(example)) {
  const text = readFileSync(example, 'utf8')
  for (const m of MARKERS) {
    if (text.toLowerCase().includes(m.toLowerCase())) {
      errors.push('data/seed.example.json contains blocked marker')
    }
  }
}

const files = walk(ROOT).filter((f) => {
  const rel = relative(ROOT, f)
  if (ALLOW_FILES.has(rel)) return false
  return /\.(tsx?|jsx?|json|md|css|html|svg)$/.test(f)
})

for (const file of files) {
  const rel = relative(ROOT, file)
  const text = readFileSync(file, 'utf8')
  for (const m of MARKERS) {
    if (text.toLowerCase().includes(m.toLowerCase())) {
      errors.push(`${rel} contains blocked marker`)
    }
  }
}

if (errors.length) {
  console.error('AUDIT FAILED — personal/sensitive content would be published:\n')
  for (const e of [...new Set(errors)]) console.error(' -', e)
  process.exit(1)
}

console.log('AUDIT OK — no forbidden personal markers in publishable files')
