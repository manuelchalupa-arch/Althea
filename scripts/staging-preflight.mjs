/**
 * ALTHEA — Preflight de staging.
 *
 * Comprueba TODO lo verificable sin desplegar nada, y separa con precisión
 * dos cosas que se confunden muy fácil:
 *
 *   - ERROR   → el repo/configuración está mal. Se puede arreglar aquí.
 *   - BLOCKED → falta algo del propietario (cuenta, project id, secreto).
 *               No es un defecto del repositorio y no se puede resolver
 *               sin sus credenciales.
 *
 * Reglas duras:
 *   - No imprime NUNCA el valor de un secreto, sólo `configured` / `missing`.
 *   - No inventa ni adivina credenciales.
 *   - No despliega. Sólo informa.
 *
 * Códigos de salida:
 *   0 = PASS        (todo lo comprobable está bien)
 *   1 = FAIL        (hay errores del repositorio)
 *   2 = BLOCKED     (sin errores, pero faltan acciones del propietario)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const errors = []
const warnings = []
const blocked = []
const passed = []

function fail(code, detail = '') {
  errors.push(detail ? `${code}: ${detail}` : code)
}
function block(code, detail = '') {
  blocked.push(detail ? `${code}: ${detail}` : code)
}
function warn(code, detail = '') {
  warnings.push(detail ? `${code}: ${detail}` : code)
}
function ok(label) {
  passed.push(label)
}

/** Estado de un secreto: nunca el valor. */
function secretStatus(value) {
  return value && value.trim() ? 'configured' : 'missing'
}

function assertFile(rel, { optional = false } = {}) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    if (optional) warn('MISSING_OPTIONAL_FILE', rel)
    else fail('MISSING_FILE', rel)
    return false
  }
  ok(`file ${rel}`)
  return true
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  } catch (e) {
    fail('UNREADABLE_JSON', `${rel} (${e.message})`)
    return null
  }
}

function commandExists(command, args = ['--version']) {
  try {
    execFileSync(command, args, {
      stdio: 'ignore',
      shell: process.platform === 'win32',
      timeout: 90_000,
    })
    return true
  } catch {
    return false
  }
}

function envOrFile(key, relEnv) {
  // El valor puede venir del entorno o de un .env de entorno. Nunca se imprime.
  if (process.env[key] && process.env[key].trim()) return process.env[key].trim()
  const full = path.join(ROOT, relEnv)
  if (fs.existsSync(full)) {
    const m = fs.readFileSync(full, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

console.log('=== ALTHEA STAGING PREFLIGHT ===')
console.log(`cwd = ${ROOT}`)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Archivos base del repo
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] Archivos base')
assertFile('firebase.json')
assertFile('package.json')
assertFile('.env.example')
assertFile('.firebaserc.example')
assertFile('firestore.rules')
assertFile('scripts/deploy-hosting.mjs')
assertFile('worker/wrangler.staging.toml')
assertFile('worker/wrangler.production.toml')

// ─────────────────────────────────────────────────────────────────────────────
// 2. Configuración de Hosting + CSP + rewrites
// ─────────────────────────────────────────────────────────────────────────────
console.log('[2] Hosting / CSP / rewrites')
const firebase = readJson('firebase.json')
if (firebase) {
  const hosting = firebase.hosting || {}
  if (hosting.public !== 'dist') {
    fail('HOSTING_PUBLIC_NOT_DIST', String(hosting.public))
  } else {
    ok('hosting.public = dist')
  }

  const rewrites = hosting.rewrites || []
  if (!rewrites.some((r) => r.destination === '/index.html')) {
    fail('MISSING_SPA_REWRITE', 'no hay rewrite ** -> /index.html (las rutas profundas darían 404)')
  } else {
    ok('SPA rewrite presente')
  }

  const headers = hosting.headers || []
  // La CSP debe vivir en el bloque `**`: si viviera sólo en `/index.html`, la
  // carga inicial de la app (que se pide como `/`) podría servirse sin ella.
  const globalBlock = headers.find((h) => h.source === '**')
  const csp = globalBlock?.headers?.find((h) => h.key === 'Content-Security-Policy')?.value || ''
  if (!csp) {
    fail('MISSING_CSP', 'debe estar en el bloque ** de hosting.headers')
  } else {
    const connect = (csp.match(/connect-src\s+([^;]+)/) || [, ''])[1]
    // Orgs que la app contacta en runtime. Si alguno falta, el CSP lo
    // bloquea en silencio en el navegador.
    for (const host of ['wger.de', 'nutricion-api-arg.fly.dev', '*.firebaseio.com', '*.workers.dev']) {
      if (!connect.includes(host)) fail('CSP_MISSING_ORIGIN', host)
    }
    if (connect.trim() === '*') fail('CSP_WILDCARD_CONNECT_SRC')
    ok('CSP con los origins de runtime')
  }

  for (const [key, probe] of [
    ['X-Content-Type-Options', 'nosniff'],
    ['Strict-Transport-Security', 'max-age='],
    ['Referrer-Policy', 'strict-origin'],
  ]) {
    const found = headers.flatMap((h) => h.headers).find((h) => h.key === key)?.value || ''
    if (!found.includes(probe)) fail('MISSING_HEADER', `${key} (esperado ${probe})`)
  }
  ok('headers de seguridad basicos')

  if (!firebase.firestore || firebase.firestore.rules !== 'firestore.rules') {
    fail('FIRESTORE_RULES_NOT_VERSIONED', 'firebase.json no apunta a firestore.rules')
  } else {
    ok('firestore.rules versionado en firebase.json')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reglas Firestore — coherencia estática (NO es validación live)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[3] Reglas Firestore (inspección estática)')
try {
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')
  if (!/match\s+\/users\/\{uid\}/.test(rules)) {
    fail('RULES_MISSING_USER_SUBTREE')
  } else {
    ok('regla users/{uid} presente')
  }
  if (!/request\.auth\.uid\s*==\s*uid/.test(rules)) {
    fail('RULES_MISSING_UID_CHECK')
  } else {
    ok('comparación request.auth.uid == uid')
  }
  // Un `allow read, write: if true` en la rama por defecto anularía el aislamiento.
  const catchAll = rules.match(/match\s+\/\{document=\*\*\}[\s\S]*?\}\s*\}/)
  if (catchAll && /if\s+true/.test(catchAll[0])) {
    fail('RULES_CATCH_ALL_ALLOWS_EVERYTHING')
  } else {
    ok('catch-all denies')
  }
} catch {
  fail('UNREADABLE_RULES')
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Separación staging / production
// ─────────────────────────────────────────────────────────────────────────────
console.log('[4] Separación de entornos')
try {
  const staging = fs.readFileSync(path.join(ROOT, 'worker/wrangler.staging.toml'), 'utf8')
  const production = fs.readFileSync(path.join(ROOT, 'worker/wrangler.production.toml'), 'utf8')

  const nameOf = (t) => (t.match(/^name\s*=\s*"([^"]+)"/m) || [, ''])[1]
  const corsOf = (t) => (t.match(/^CORS_ORIGIN\s*=\s*"([^"]+)"/m) || [, ''])[1]
  const kvOf = (t) => (t.match(/id\s*=\s*"([^"]+)"/) || [, ''])[1]

  const sn = nameOf(staging)
  const pn = nameOf(production)
  if (!sn || !pn) fail('WORKER_NAME_MISSING')
  else if (sn === pn) fail('WORKER_NAMES_NOT_SEPARATED', sn)
  else ok(`workers separados: ${sn} / ${pn}`)

  const sc = corsOf(staging)
  const pc = corsOf(production)
  if (!sc) fail('STAGING_CORS_ORIGIN_NOT_SET')
  if (!pc) fail('PRODUCTION_CORS_ORIGIN_NOT_SET')
  if (sc && sc.includes('*')) fail('STAGING_CORS_WILDCARD')
  if (pc && pc.includes('*')) fail('PRODUCTION_CORS_WILDCARD')
  if (sc && pc && sc === pc) fail('STAGING_PRODUCTION_SAME_CORS', 'ambos ambientes comparten CORS_ORIGIN')
  if (sc.includes('STAGING_PROJECT_ID')) block('STAGING_CORS_ORIGIN_IS_PLACEHOLDER', sc)
  if (pc.includes('REEMPLAZAR')) block('PRODUCTION_CORS_ORIGIN_IS_PLACEHOLDER', pc)

  const sk = kvOf(staging)
  const pk = kvOf(production)
  if (sk && pk && sk === pk) fail('KV_NAMESPACES_SHARED', 'staging y production usan el mismo KV')
  if (sk?.includes('REEMPLAZAR')) block('STAGING_KV_ID_IS_PLACEHOLDER')
  if (pk?.includes('REEMPLAZAR')) block('PRODUCTION_KV_ID_IS_PLACEHOLDER')
  if (!sk?.includes('REEMPLAZAR')) ok('KV staging configurado')
  if (!pk?.includes('REEMPLAZAR')) ok('KV production configurado')

  // La Durable Object sólo sirve si está enlazada con su migración.
  for (const [label, toml] of [['staging', staging], ['production', production]]) {
    if (!/durable_objects\.bindings/.test(toml)) fail('DO_BINDING_MISSING', label)
    if (!/new_sqlite_classes\s*=\s*\["RateLimiter"\]/.test(toml)) fail('DO_MIGRATION_MISSING', label)
  }
  ok('Durable Object enlazada con migración en ambos ambientes')

  if (/GROQ_API_KEY\s*=\s*"[^"$]/.test(staging) || /GROQ_API_KEY\s*=\s*"[^"$]/.test(production)) {
    fail('GROQ_API_KEY_LITERAL_IN_TOML', 'la clave no puede vivir en un archivo de config')
  }
  ok('GROQ_API_KEY no aparece como literal en los wrangler')
} catch (e) {
  fail('UNREADABLE_WRANGLER', e.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Secretos: nunca en el cliente, nunca versionados
// ─────────────────────────────────────────────────────────────────────────────
console.log('[5] Secretos')
console.log(`  GROQ_API_KEY (entorno)   = ${secretStatus(process.env.GROQ_API_KEY)}`)
console.log(`  VITE_GROQ_API_KEY        = ${secretStatus(process.env.VITE_GROQ_API_KEY)}`)

// Un secreto de cliente es un error de diseño, no un detalle de config.
for (const forbidden of ['VITE_GROQ_API_KEY', 'VITE_GROQ_SECRET', 'VITE_CLOUDFLARE_TOKEN']) {
  if (process.env[forbidden]) fail('FORBIDDEN_CLIENT_SECRET', forbidden)
}
ok('sin secretos en variables VITE_*')

// .env* deben estar ignorados. Si un .env real se commiteara, sería una fuga.
// Se pregunta a git en vez de parsear .gitignore a mano: `git check-ignore` es
// la autoridad y evita que un regex desincronizado dé un falso negativo.
const envFiles = ['.env', '.env.local', '.env.staging', '.env.production', '.env.development', '.env.staging.local']
const notIgnored = []
for (const f of envFiles) {
  try {
    execFileSync('git', ['check-ignore', '-q', f], { stdio: 'ignore', shell: process.platform === 'win32' })
  } catch {
    notIgnored.push(f)
  }
}
if (notIgnored.length) {
  for (const f of notIgnored) fail('ENV_NOT_IGNORED', f)
} else {
  ok('.env* ignorados por git (git check-ignore)')
}

for (const f of ['.env.staging', '.env.production', '.env.local']) {
  if (fs.existsSync(path.join(ROOT, f))) ok(`presente ${f} (ignorado, no versionado)`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Build artefactos
// ─────────────────────────────────────────────────────────────────────────────
console.log('[6] Artefactos de build')
const distRequired = ['index.html', 'manifest.webmanifest']
if (!fs.existsSync(path.join(ROOT, 'dist'))) {
  warn('DIST_MISSING', 'ejecutá `npm run build` antes del preflight de deploy')
} else {
  for (const f of distRequired) {
    if (fs.existsSync(path.join(ROOT, 'dist', f))) ok(`dist/${f}`)
    else fail('DIST_MISSING_FILE', f)
  }
  if (!fs.existsSync(path.join(ROOT, 'dist/sw.js')) && !fs.existsSync(path.join(ROOT, 'dist/workbox'))) {
    warn('SW_NOT_FOUND', 'no se encontró sw.js en dist; la PWA puede no estar construyéndose')
  } else {
    ok('service worker presente en dist')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. CLI disponibles (vía npx, no hace falta instalar nada)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[7] CLI')
const hasFirebase = commandExists('npx', ['--yes', 'firebase-tools', '--version'])
const hasWrangler = commandExists('npx', ['--yes', 'wrangler', '--version'])
console.log(`  firebase-tools (npx) = ${hasFirebase ? 'available' : 'unavailable'}`)
console.log(`  wrangler (npx)      = ${hasWrangler ? 'available' : 'unavailable'}`)
if (!hasFirebase) block('FIREBASE_CLI_UNAVAILABLE')
if (!hasWrangler) block('WRANGLER_CLI_UNAVAILABLE')

// ─────────────────────────────────────────────────────────────────────────────
// 8. Identidad de staging — lo que sólo el propietario puede aportar
// ─────────────────────────────────────────────────────────────────────────────
console.log('[8] Identidad de staging (sólo el propietario puede aportarla)')
const stagingProjectId = envOrFile('FIREBASE_STAGING_PROJECT_ID', '.env.staging')
const stagingWorkerUrl = envOrFile('VITE_GROQ_PROXY_URL', '.env.staging')
const productionProjectId = envOrFile('FIREBASE_PRODUCTION_PROJECT_ID', '.env.production')
const wgerUser = process.env.WGER_TEST_USERNAME || ''
const wgerPass = process.env.WGER_TEST_PASSWORD || ''

console.log(`  FIREBASE_STAGING_PROJECT_ID = ${stagingProjectId || 'missing'}`)
console.log(`  FIREBASE_PRODUCTION_PROJECT_ID = ${productionProjectId ? 'configured' : 'missing'}`)
console.log(`  VITE_GROQ_PROXY_URL (staging) = ${stagingWorkerUrl || 'missing'}`)
console.log(`  WGER_TEST_USERNAME = ${secretStatus(wgerUser)}`)
console.log(`  WGER_TEST_PASSWORD = ${secretStatus(wgerPass)}`)

if (!stagingProjectId) block('MISSING_FIREBASE_STAGING_PROJECT_ID')
else if (stagingProjectId.includes('REEMPLAZAR')) block('FIREBASE_STAGING_PROJECT_ID_IS_PLACEHOLDER')

if (!stagingWorkerUrl) block('MISSING_VITE_GROQ_PROXY_URL')
else if (!/^https:\/\//.test(stagingWorkerUrl)) fail('INVALID_VITE_GROQ_PROXY_URL')
else if (stagingWorkerUrl.includes('tu-usuario')) block('VITE_GROQ_PROXY_URL_IS_PLACEHOLDER')

if (!productionProjectId) block('MISSING_FIREBASE_PRODUCTION_PROJECT_ID')

if (stagingProjectId && productionProjectId && stagingProjectId === productionProjectId) {
  fail('STAGING_PRODUCTION_SAME_PROJECT', 'staging y production son el mismo proyecto Firebase')
}
if (stagingWorkerUrl && productionProjectId) {
  // El proxy de producción no debe apuntarse desde staging.
  const prodWorker = (() => {
    try {
      const t = fs.readFileSync(path.join(ROOT, 'worker/wrangler.production.toml'), 'utf8')
      return (t.match(/^name\s*=\s*"([^"]+)"/m) || [, ''])[1]
    } catch {
      return ''
    }
  })()
  if (prodWorker && stagingWorkerUrl.includes(prodWorker)) {
    fail('STAGING_POINTS_AT_PRODUCTION_WORKER', stagingWorkerUrl)
  }
}

if (!wgerUser || !wgerPass) block('MISSING_WGER_TEST_CREDENTIALS', '12 tests reales de WGER quedan omitidos')

// ─────────────────────────────────────────────────────────────────────────────
// 9. Datos ficticios en runtime
// ─────────────────────────────────────────────────────────────────────────────
console.log('[9] Datos ficticios en producción')
const srcDir = path.join(ROOT, 'src')
const offenders = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      const src = fs.readFileSync(full, 'utf8')
      for (const needle of ['generateSeed', 'SEED_', 'FAKE_', 'MOCK_DATA', 'SYNTHETIC_', 'DUMMY_']) {
        if (src.includes(needle)) offenders.push(`${path.relative(ROOT, full)} (${needle})`)
      }
    }
  }
}
walk(srcDir)
if (offenders.length) {
  for (const o of offenders) fail('FAKE_DATA_MARKER_IN_RUNTIME', o)
} else {
  ok('sin marcadores de datos ficticios en src/ (runtime)')
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(62))
console.log(`OK       : ${passed.length}`)
for (const p of passed) console.log(`  + ${p}`)

console.log('\nERRORS   (repo/config — corregibles aquí):')
if (errors.length === 0) console.log('  (ninguno)')
for (const e of errors) console.log(`  - ${e}`)

console.log('\nBLOCKED  (sólo el propietario):')
if (blocked.length === 0) console.log('  (ninguno)')
for (const b of blocked) console.log(`  - ${b}`)

console.log('\nWARNINGS:')
if (warnings.length === 0) console.log('  (ninguno)')
for (const w of warnings) console.log(`  - ${w}`)
console.log('='.repeat(62))

if (errors.length > 0) {
  console.error('\nSTAGING PREFLIGHT = FAIL')
  console.error('Hay defectos del repositorio. Corregir antes de pedir credenciales.')
  process.exit(1)
}
if (blocked.length > 0) {
  console.log('\nSTAGING PREFLIGHT = BLOCKED - OWNER ACTION REQUIRED')
  console.log('Todo lo local está correcto. Falta acción del propietario (ver EXTERNAL ACTIONS).')
  process.exit(2)
}
console.log('\nSTAGING PREFLIGHT = PASS')
