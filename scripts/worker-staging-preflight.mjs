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

/** Estado de un secreto: nunca el valor. */
function secretStatus(value) {
  return value && String(value).trim() ? 'configured' : 'missing'
}

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

  // El secret jamás puede estar en el archivo.
  if (/^GROQ_API_KEY\s*=\s*"/m.test(toml)) {
    fail('GROQ_API_KEY_LITERAL_IN_TOML', 'el secret debe ir por `wrangler secret put`')
  } else {
    ok('GROQ_API_KEY no está en el archivo (se inyecta como secret)')
  }
}

// ── 2. El entorno puede o no traer el secret ────────────────────────────────
console.log('[2] Secret')
console.log(`  GROQ_API_KEY (entorno local) = ${secretStatus(process.env.GROQ_API_KEY)}`)
console.log('  nota: el secret real vive en Cloudflare, no en este entorno.')
ok('secret definido sólo server-side por diseño')

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

// ── 4. Secretos desplegados (sólo presencia, nunca valor) ──────────────────
console.log('[4] Secretos desplegados en el Worker de staging')
let secretList = null
if (fs.existsSync(STAGING_TOML)) {
  // El path del config es relativo al directorio de trabajo, y este script se
  // ejecuta desde la raíz del repo, no desde worker/. Sin el prefijo, wrangler
  // no encuentra el archivo y el comando falla aunque el Worker exista.
  secretList = wrangler(['secret', 'list', '--config', 'worker/wrangler.staging.toml'], {
    allowFail: true,
  })
}
if (secretList === null) {
  block('CANNOT_LIST_WORKER_SECRETS', 'requiere sesión de Cloudflare y Worker desplegado')
} else {
  const listed = /GROQ_API_KEY/.test(secretList)
  console.log(`  GROQ_API_KEY en el Worker = ${listed ? 'configured' : 'missing'}`)
  if (!listed) {
    block('GROQ_API_KEY_NOT_SET_ON_WORKER', 'npm run worker:secret:staging')
  } else {
    ok('GROQ_API_KEY configurado en el Worker de staging')
  }
}

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
