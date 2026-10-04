/**
 * ALTHEA — Validador unificado de staging.
 *
 * Centraliza todas las comprobaciones que NO requieren autenticación ni
 * credenciales, y clasifica cada una con un estado honesto:
 *
 *   PASS      verificado contra el repo o contra un servicio real
 *   FAIL      defecto del repositorio — corregible aquí mismo
 *   NOT VALIDATED  requiere un servicio que aún no existe
 *   BLOCKED - OWNER ACTION REQUIRED  requiere cuenta/credencial del propietario
 *
 * Regla dura: un archivo que existe NO es lo mismo que un servicio validado.
 * Aquí no se marca nada como PASS sin evidencia comprobable.
 *
 * No imprime secretos. No despliega. No toca producción.
 *
 * Salida: 0 = sin FAIL · 1 = hay FAIL · 2 = sólo BLOCKED/NOT VALIDATED
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const results = []
const pass = (name, detail = '') => results.push({ name, status: 'PASS', detail })
const fail = (name, detail = '') => results.push({ name, status: 'FAIL', detail })
const blocked = (name, detail = '') => results.push({ name, status: 'BLOCKED - OWNER ACTION REQUIRED', detail })
const notValidated = (name, detail = '') => results.push({ name, status: 'NOT VALIDATED', detail })

const exists = (rel) => fs.existsSync(path.join(ROOT, rel))
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    return ''
  }
}
function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      timeout: 120_000,
    })
  } catch {
    return null
  }
}
/** Estado de un secreto: nunca el valor. */
const secretStatus = (v) => (v && String(v).trim() ? 'configured' : 'missing')

console.log('=== ALTHEA STAGING VALIDATOR ===')
console.log(`cwd = ${ROOT}\n`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('[1] Artefactos del repositorio')
// ─────────────────────────────────────────────────────────────────────────────
for (const f of [
  'firebase.json',
  'package.json',
  'firestore.rules',
  '.firebaserc.example',
  '.env.example',
  'scripts/deploy-hosting.mjs',
  'worker/wrangler.staging.toml',
  'worker/wrangler.production.toml',
  'worker/src/index.js',
  'worker/src/rate-limiter.js',
]) {
  exists(f) ? pass(`archivo:${f}`) : fail(`archivo:${f}`, 'ausente')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[2] Build')
// ─────────────────────────────────────────────────────────────────────────────
/** Registra PASS o FAIL según una condición. Evita if/else de una línea. */
function check(name, condition, okDetail = '', failDetail = '') {
  condition ? pass(name, okDetail) : fail(name, failDetail)
  return condition
}

if (exists('dist/index.html')) pass('dist', 'build presente'); else fail('dist', 'ejecutá npm run build')
if (exists('dist/manifest.webmanifest')) pass('manifest', 'dist/manifest.webmanifest'); else fail('manifest', 'ausente')
{
  const sw = ['sw.js', 'service-worker.js'].some((f) => exists(`dist/${f}`))
  if (sw) pass('service-worker', 'presente en dist')
  else fail('service-worker', 'ausente en dist')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[3] Hosting: CSP, rewrites, cabeceras')
// ─────────────────────────────────────────────────────────────────────────────
try {
  const fb = JSON.parse(read('firebase.json'))
  const hosting = fb.hosting || {}
  hosting.public === 'dist' ? pass('hosting.public') : fail('hosting.public', String(hosting.public))

  const rewrites = hosting.rewrites || []
  rewrites.some((r) => r.destination === '/index.html')
    ? pass('spa-rewrite')
    : fail('spa-rewrite', 'sin rewrite ** -> /index.html las rutas profundas darían 404')

  const globalBlock = (hosting.headers || []).find((h) => h.source === '**')
  const csp = globalBlock?.headers?.find((h) => h.key === 'Content-Security-Policy')?.value || ''
  if (!csp) {
    fail('csp', 'debe estar en el bloque ** de hosting.headers')
  } else {
    pass('csp', 'declarada en **')
    const connect = (csp.match(/connect-src\s+([^;]+)/) || [, ''])[1]
    for (const host of ['wger.de', '*.firebaseio.com', '*.workers.dev']) {
      connect.includes(host)
        ? pass(`csp-origin:${host}`)
        : fail(`csp-origin:${host}`, 'ausente de connect-src')
    }
    // Wildcard desnudo prohibido; comodín de subdominio sí.
    connect.trim().split(/\s+/).includes('*')
      ? fail('csp-wildcard', 'connect-src con * desnudo')
      : pass('csp-wildcard', 'sin * desnudo')
    for (const d of ['object-src', 'base-uri', 'frame-ancestors']) {
      const m = csp.match(new RegExp(`${d}\\s+([^;]+)`))
      m && m[1].trim() === "'self'" ? pass(`csp-${d}`) : m ? pass(`csp-${d}`, m[1].trim()) : fail(`csp-${d}`, 'ausente')
    }
  }

  const allHeaders = (hosting.headers || []).flatMap((h) => h.headers)
  for (const [key, probe] of [
    ['X-Content-Type-Options', 'nosniff'],
    ['Strict-Transport-Security', 'max-age='],
    ['Referrer-Policy', 'strict-origin'],
    ['X-Frame-Options', 'SAMEORIGIN'],
  ]) {
    const v = allHeaders.find((h) => h.key === key)?.value || ''
    v.includes(probe) ? pass(`header:${key}`) : fail(`header:${key}`, `esperado ${probe}`)
  }

  const idx = (hosting.headers || []).find((h) => h.source === '/index.html')
  const cc = idx?.headers?.find((h) => h.key === 'Cache-Control')?.value || ''
  cc.includes('no-store') ? pass('cache:index-html', 'no-store (necesario para update PWA)') : fail('cache:index-html', 'sin no-store')

  const assets = (hosting.headers || []).find((h) => h.source === '/assets/**')
  const acc = assets?.headers?.find((h) => h.key === 'Cache-Control')?.value || ''
  acc.includes('immutable') ? pass('cache:assets', 'immutable') : fail('cache:assets', 'sin immutable')

  fb.firestore?.rules === 'firestore.rules' ? pass('firestore-rules-versioned') : fail('firestore-rules-versioned')
} catch (e) {
  fail('firebase.json', `ilegible: ${e.message}`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[4] Reglas Firestore (inspección estática — NO es validación live)')
// ─────────────────────────────────────────────────────────────────────────────
{
  const rules = read('firestore.rules')
  if (!rules) {
    fail('firestore.rules', 'ilegible')
  } else {
    const hasUidSubtree = /match\s+\/users\/\{uid\}/.test(rules)
    const hasUidCheck = /request\.auth\.uid\s*==\s*uid/.test(rules)
    const catchAll = rules.match(/match\s+\/\{document=\*\*\}[\s\S]*?\}\s*\}/)
    const catchAllAllowsAll = Boolean(catchAll && /if\s+true/.test(catchAll[0]))

    check('rules:subtree-users-uid', hasUidSubtree, 'match /users/{uid} presente')
    check('rules:uid-comparison', hasUidCheck, 'request.auth.uid == uid')
    check(
      'rules:catch-all',
      !catchAllAllowsAll,
      'deniega',
      'el catch-all permite todo',
    )
    pass('rules-alcance', 'esto es CODE-VERIFIED; el aislamiento real lo prueba staging:firestore:e2e')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[5] Separación staging / production')
// ─────────────────────────────────────────────────────────────────────────────
try {
  const st = read('worker/wrangler.staging.toml')
  const pr = read('worker/wrangler.production.toml')
  const nameOf = (t) => (t.match(/^name\s*=\s*"([^"]+)"/m) || [, ''])[1]
  const corsOf = (t) => (t.match(/^CORS_ORIGIN\s*=\s*"([^"]+)"/m) || [, ''])[1]
  const kvOf = (t) => (t.match(/^\s*id\s*=\s*"([^"]+)"/m) || [, ''])[1]

  const sn = nameOf(st)
  const pn = nameOf(pr)
  sn && pn && sn !== pn ? pass('workers-separados', `${sn} / ${pn}`) : fail('workers-separados', 'mismo nombre o ausente')

  const sc = corsOf(st)
  const pc = corsOf(pr)
  sc && !sc.includes('*') ? pass('cors-staging', sc) : fail('cors-staging', 'ausente o con wildcard')
  pc && !pc.includes('*') ? pass('cors-production', pc) : fail('cors-production', 'ausente o con wildcard')
  sc && pc && sc !== pc ? pass('cors-distintos') : fail('cors-distintos', 'staging y production comparten CORS_ORIGIN')
  sc?.includes('STAGING_PROJECT_ID') ? blocked('cors-staging-real', 'sigue siendo un placeholder') : null

  const sk = kvOf(st)
  const pk = kvOf(pr)
  sk && pk && sk !== pk ? pass('kv-separados', `${sk} / ${pk}`) : fail('kv-separados', 'compartido o ausente')
  sk?.includes('REEMPLAZAR') ? blocked('kv-staging-real', 'placeholder') : null
  pk?.includes('REEMPLAZAR') ? blocked('kv-production-real', 'placeholder') : null

  for (const [label, t] of [['staging', st], ['production', pr]]) {
    /durable_objects\.bindings/.test(t) && /new_sqlite_classes\s*=\s*\["RateLimiter"\]/.test(t)
      ? pass(`durable-object:${label}`)
      : fail(`durable-object:${label}`, 'binding o migración ausente')
  }
  /^GROQ_API_KEY\s*=\s*"/m.test(st) || /^GROQ_API_KEY\s*=\s*"/m.test(pr)
    ? fail('groq-secret-en-archivo', 'la clave no puede vivir en un archivo')
    : pass('groq-secret-en-archivo', 'sólo como secret')
} catch (e) {
  fail('wrangler-configs', e.message)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[6] Secretos y .env')
// ─────────────────────────────────────────────────────────────────────────────
for (const forbidden of ['VITE_GROQ_API_KEY', 'VITE_GROQ_SECRET', 'VITE_CLOUDFLARE_TOKEN']) {
  process.env[forbidden] ? fail(`secreto-en-cliente:${forbidden}`, 'no puede ser VITE_*') : pass(`secreto-en-cliente:${forbidden}`, 'ausente')
}
{
  const notIgnored = []
  for (const f of ['.env', '.env.local', '.env.staging', '.env.production', '.env.development']) {
    try {
      execFileSync('git', ['check-ignore', '-q', f], { stdio: 'ignore', shell: process.platform === 'win32' })
    } catch {
      notIgnored.push(f)
    }
  }
  notIgnored.length === 0 ? pass('env-ignorados', '.env* correctamente ignorados') : fail('env-ignorados', notIgnored.join(', '))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[7] Datos ficticios en runtime')
// ─────────────────────────────────────────────────────────────────────────────
{
  const offenders = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
        const src = fs.readFileSync(full, 'utf8')
        for (const needle of ['generateSeed', 'SEED_', 'FAKE_', 'MOCK_DATA', 'SYNTHETIC_', 'DUMMY_']) {
          if (src.includes(needle)) offenders.push(`${path.relative(ROOT, full)} (${needle})`)
        }
      }
    }
  }
  walk(path.join(ROOT, 'src'))
  offenders.length === 0 ? pass('sin-datos-ficticios', 'runtime limpio') : fail('sin-datos-ficticios', offenders.join(', '))
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('[8] CLI disponibles')
// ─────────────────────────────────────────────────────────────────────────────
run('npx', ['--yes', 'firebase-tools', '--version']) ? pass('firebase-cli') : notValidated('firebase-cli', 'no disponible por npx')
run('npx', ['--yes', 'wrangler', '--version']) ? pass('wrangler-cli') : notValidated('wrangler-cli', 'no disponible por npx')

// ─────────────────────────────────────────────────────────────────────────────
console.log('[9] Lo que sólo el propietario puede aportar')
// ─────────────────────────────────────────────────────────────────────────────
function envOrFile(key, file) {
  if (process.env[key]?.trim()) return process.env[key].trim()
  const full = path.join(ROOT, file)
  if (fs.existsSync(full)) {
    const m = fs.readFileSync(full, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const stagingProject = envOrFile('FIREBASE_STAGING_PROJECT_ID', '.env.staging')
const productionProject = envOrFile('FIREBASE_PRODUCTION_PROJECT_ID', '.env.production')
const stagingWorker = envOrFile('VITE_GROQ_PROXY_URL', '.env.staging')

stagingProject ? pass('firebase-staging-project', stagingProject) : blocked('firebase-staging-project', 'falta FIREBASE_STAGING_PROJECT_ID')
productionProject ? pass('firebase-production-project', 'configured') : blocked('firebase-production-project', 'falta FIREBASE_PRODUCTION_PROJECT_ID')
stagingWorker ? pass('staging-worker-url', stagingWorker) : blocked('staging-worker-url', 'falta VITE_GROQ_PROXY_URL')

if (stagingProject && productionProject && stagingProject === productionProject) {
  fail('staging-vs-production', 'son el mismo proyecto Firebase')
}

if (process.env.WGER_TEST_USERNAME && process.env.WGER_TEST_PASSWORD) {
  pass('wger-credentials', 'configured')
} else {
  blocked('wger-credentials', '12 tests reales de WGER siguen omitidos')
}

console.log(`  (informativo) GROQ_API_KEY en este entorno = ${secretStatus(process.env.GROQ_API_KEY)}`)
console.log('  el secret real vive en el Worker, no aquí. Estado real: `npx wrangler secret list -c worker/wrangler.staging.toml`')

// ─────────────────────────────────────────────────────────────────────────────
console.log('[10] Validaciones que dependen de un entorno desplegado')
// ─────────────────────────────────────────────────────────────────────────────
notValidated('auth-real', 'requiere proyecto Firebase staging y cuentas A/B')
notValidated('firestore-aislamiento-real', 'lo prueba `npm run staging:firestore:e2e`')
notValidated('hosting-real', 'lo prueba `npm run staging:hosting:check -- <URL>` tras el deploy')
notValidated('coach-e2e', 'requiere GROQ_API_KEY en el Worker')
notValidated('csp-live', 'requiere Hosting desplegado; lo prueba http-smoke')
notValidated('pwa-update', 'requiere dos versiones desplegadas')
notValidated('smoke-test-consola-red', 'requiere navegador y staging')

// ─────────────────────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70))
const byStatus = (s) => results.filter((r) => r.status === s)
for (const s of ['PASS', 'FAIL', 'BLOCKED - OWNER ACTION REQUIRED', 'NOT VALIDATED']) {
  const list = byStatus(s)
  console.log(`\n${s} (${list.length}):`)
  if (!list.length) console.log('  (ninguno)')
  for (const r of list) console.log(`  - ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
}
console.log('\n' + '='.repeat(70))

const fails = byStatus('FAIL').length
const blocks = byStatus('BLOCKED - OWNER ACTION REQUIRED').length
const nvs = byStatus('NOT VALIDATED').length

if (fails > 0) {
  console.error(`\nSTAGING LOCAL VALIDATION = FAIL (${fails})`)
  console.error('Hay defectos del repositorio. Corregir antes de pedir credenciales.')
  process.exit(1)
}
console.log(`\nSTAGING LOCAL VALIDATION = COMPLETE`)
console.log(`  PASS=${byStatus('PASS').length}  BLOCKED=${blocks}  NOT VALIDATED=${nvs}`)
console.log('  Todo lo comprobable sin credenciales está correcto.')
console.log('  Lo que sigue necesita al propietario o un entorno desplegado.')
if (blocks > 0 || nvs > 0) process.exit(2)
