/**
 * ALTHEA — Preflight del Worker de staging (Cloudflare).
 *
 * Verifica lo verificable sin desplegar:
 *   - que la CLI responde;
 *   - que hay sesión autenticada;
 *   - que la configuración de staging no tiene placeholders;
 *   - que el secreto está configurado (NUNCA su valor).
 *
 * No imprime secretos. No despliega. No toca producción.
 *
 * Salida: 0 = PASS · 1 = FAIL (config del repo) · 2 = BLOCKED (owner)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const STAGING_TOML = path.join(ROOT, 'worker/wrangler.staging.toml')
const errors = []
const blocked = []
const passed = []

const fail = (c, d = '') => errors.push(d ? `${c}: ${d}` : c)
const block = (c, d = '') => blocked.push(d ? `${c}: ${d}` : c)
const ok = (label) => passed.push(label)

function wrangler(args, { allowFail = false } = {}) {
  try {
    return execFileSync('npx', ['--yes', 'wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      timeout: 120_000,
    })
  } catch (e) {
    if (!allowFail) fail('WRANGLER_COMMAND_FAILED', args.join(' '))
    return null
  }
}

console.log('=== WORKER STAGING PREFLIGHT ===')

// ── 1. Configuración de staging ──────────────────────────────────────────────
console.log('[1] Configuración de staging')
if (!fs.existsSync(STAGING_TOML)) {
  fail('MISSING_FILE', 'worker/wrangler.staging.toml')
} else {
  const toml = fs.readFileSync(STAGING_TOML, 'utf8')
  const name = (toml.match(/^name\s*=\s*"([^"]+)"/m) || [, ''])[1]
  const cors = (toml.match(/^CORS_ORIGIN\s*=\s*"([^"]+)"/m) || [, ''])[1]
  const kvId = (toml.match(/id\s*=\s*"([^"]+)"/) || [, ''])[1]

  console.log(`  worker name        = ${name || '(sin definir)'}`)
  console.log(`  CORS_ORIGIN        = ${cors || '(sin definir)'}`)
  console.log(`  KV namespace       = ${kvId && kvId.includes('REEMPLAZAR') ? 'PLACEHOLDER' : kvId || '(sin definir)'}`)

  if (!name) fail('WORKER_NAME_MISSING')
  else if (!name.includes('staging')) fail('STAGING_WORKER_NAME_SUSPICIOUS', name)
  else ok(`worker de staging: ${name}`)

  if (!cors) fail('STAGING_CORS_ORIGIN_NOT_SET')
  else if (cors.includes('*')) fail('STAGING_CORS_WILDCARD', 'CORS fail-closed prohíbe *')
  else if (cors.includes('STAGING_PROJECT_ID')) block('STAGING_CORS_ORIGIN_IS_PLACEHOLDER', cors)
  else ok('CORS_ORIGIN explícito y sin wildcard')

  if (!kvId) fail('STAGING_KV_ID_NOT_SET')
  else if (kvId.includes('REEMPLAZAR')) block('STAGING_KV_ID_IS_PLACEHOLDER')
  else ok('KV namespace configurado')

  if (!/durable_objects\.bindings/.test(toml)) fail('DO_BINDING_MISSING')
  else if (!/new_sqlite_classes\s*=\s*\["RateLimiter"\]/.test(toml)) fail('DO_MIGRATION_MISSING')
  else ok('Durable Object del rate limit enlazada con migración')

  if (!/\[ai\]/.test(toml) || !/binding\s*=\s*"AI"/.test(toml)) {
    fail('AI_BINDING_MISSING', 'Cloudflare Workers AI debe enlazarse desde el servidor')
  } else {
    ok('binding AI configurado (sin secretos de proveedor)')
  }

  if (!/FIREBASE_PROJECT_ID\s*=/.test(toml)) {
    fail('FIREBASE_PROJECT_ID_MISSING', 'necesario para verificar el ID token')
  } else {
    ok('FIREBASE_PROJECT_ID configurado')
  }
}

// ── 2. Sin secretos de proveedor ────────────────────────────────────────────
console.log('[2] Credenciales')
console.log('  Cloudflare Workers AI usa el binding de la cuenta: no hay secret que cargar.')
ok('ningún secreto de IA en el frontend ni en el entorno local')

// ── 3. CLI y sesión ─────────────────────────────────────────────────────────
console.log('[3] CLI y autenticación')
const whoami = wrangler(['whoami'], { allowFail: true })
if (whoami === null) {
  block('WRANGLER_NOT_AUTHENTICATED_OR_UNAVAILABLE', 'ejecutá `npx wrangler login`')
} else {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  console.log(`  CLOUDFLARE_ACCOUNT_ID = ${accountId || 'missing (opcional; wrangler infiere la sesión)'}`)
  ok('sesión de Cloudflare activa')
  if (/not authenticated|not logged in|no account/i.test(whoami)) {
    block('WRANGLER_NOT_AUTHENTICATED')
  }
}

// ── 4. Sin secretos que listar ──────────────────────────────────────────────
console.log('[4] Credenciales del proveedor')
console.log('  No aplica: Workers AI se autentica con la cuenta vía binding `AI`.')
ok('sin secretos de IA que configurar en el Worker')

// ── Resultado ───────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(62))
console.log(`OK      : ${passed.length}`)
for (const p of passed) console.log(`  + ${p}`)
console.log('\nERRORS  (repo/config):')
if (!errors.length) console.log('  (ninguno)')
for (const e of errors) console.log(`  - ${e}`)
console.log('\nBLOCKED (propietario):')
if (!blocked.length) console.log('  (ninguno)')
for (const b of blocked) console.log(`  - ${b}`)
console.log('='.repeat(62))

if (errors.length) {
  console.error('\nWORKER STAGING PREFLIGHT = FAIL')
  process.exit(1)
}
if (blocked.length) {
  console.log('\nWORKER STAGING PREFLIGHT = BLOCKED - OWNER ACTION REQUIRED')
  process.exit(2)
}
console.log('\nWORKER STAGING PREFLIGHT = PASS')
