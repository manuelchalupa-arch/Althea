/**
 * ALTHEA — HTTP smoke contra staging.
 *
 * Valida contra el Hosting y el Worker REALES, sin necesitar credenciales:
 * que el sitio responde, que la CSP llega en la cabecera (no sólo en el
 * archivo), que cada ruta del router resuelve, que los assets existen, y que
 * el Worker responde y no refleja Origins arbitrarios.
 *
 * Rutas: se LEEN de `src/App.tsx`. No hay lista escrita a mano — `/inicio` y
 * `/historial` parecen rutas pero no lo son (Inicio vive en `/` y no existe
 * ruta de historial), y una lista fija reportaría 404 falsos.
 *
 * Uso:
 *   STAGING_URL=https://<proyecto>.web.app \
 *   STAGING_WORKER_URL=https://althea-proxy-staging.<user>.workers.dev \
 *   node scripts/staging/http-smoke.mjs
 *
 * No imprime secretos. No despliega.
 *
 * Salida: 0 = PASS · 1 = FAIL · 2 = BLOCKED (falta STAGING_URL)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const baseUrl = (process.env.STAGING_URL || '').replace(/\/+$/, '')
const workerUrl = (
  process.env.STAGING_WORKER_URL || process.env.VITE_GROQ_PROXY_URL || ''
).replace(/\/+$/, '')
/**
 * Origin que el Worker tiene permitido. Normally coincide con STAGING_URL,
 * pero puede no coincidir (p. ej. al validar en local, o si el sitio se sirve
 * en un host distinto del que está en la allowlist del Worker). Es
 * explícito para no reportar un falso FAIL por una diferencia conocida.
 */
const allowedOrigin = (process.env.STAGING_ALLOWED_ORIGIN || baseUrl).replace(/\/+$/, '')

if (!baseUrl) {
  console.error('=== ALTHEA STAGING HTTP SMOKE ===')
  console.error('BLOCKED - OWNER ACTION REQUIRED: falta STAGING_URL')
  console.error('  staging:    STAGING_URL=https://<STAGING_PROJECT_ID>.web.app')
  console.error('  worker:     STAGING_WORKER_URL=https://althea-proxy-staging.<user>.workers.dev')
  process.exit(2)
}

const failures = []
const notValidated = []
const passes = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }
const nv = (m, why) => { notValidated.push(m); console.log(`  [NOT VALIDATED] ${m} — ${why}`) }

async function request(url, options = {}) {
  try {
    const response = await fetch(url, { redirect: 'follow', ...options })
    const body = await response.text()
    return { ok: true, status: response.status, headers: response.headers, body }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Rutas reales del router. */
function routerRoutes() {
  const appFile = path.resolve(process.cwd(), 'src', 'App.tsx')
  if (!fs.existsSync(appFile)) return []
  const src = fs.readFileSync(appFile, 'utf8')
  return [...new Set([...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]))]
}

console.log('=== ALTHEA STAGING HTTP SMOKE ===')
console.log(`hosting = ${baseUrl}`)
console.log(`worker  = ${workerUrl || '(sin definir)'}`)
console.log('-'.repeat(66))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] Hosting alcanzable')
// ─────────────────────────────────────────────────────────────────────────────
const home = await request(`${baseUrl}/`)
if (!home.ok) {
  bad(`Hosting no alcanzable: ${home.error}`)
} else {
  ok(`Hosting responde ${home.status}`)
  if (home.status === 200) ok('home HTTP 200')
  else bad(`home devolvió HTTP ${home.status}`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] CSP REAL (cabecera, no archivo)')
// ─────────────────────────────────────────────────────────────────────────────
if (home.ok) {
  const csp = home.headers.get('content-security-policy')
  if (csp) {
    ok('Content-Security-Policy presente en la respuesta real')
    for (const host of ['wger.de']) {
      csp.includes(host) ? ok(`CSP connect-src incluye ${host}`) : bad(`CSP connect-src NO incluye ${host}`)
    }
    const connect = (csp.match(/connect-src\s+([^;]+)/) || [, ''])[1]
    connect.trim().split(/\s+/).includes('*')
      ? bad('CSP connect-src con wildcard desnudo')
      : ok('CSP connect-src sin wildcard desnudo')
  } else {
    bad('Content-Security-Policy ausente en la respuesta real')
  }
  for (const [h, probe] of [
    ['x-content-type-options', 'nosniff'],
    ['strict-transport-security', 'max-age='],
    ['referrer-policy', 'strict-origin'],
  ]) {
    const v = home.headers.get(h) || ''
    v.includes(probe) ? ok(`${h} activo`) : bad(`${h} ausente o inesperado`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3] Rutas del router + assets')
// ─────────────────────────────────────────────────────────────────────────────
const routes = routerRoutes()
if (routes.length === 0) {
  bad('no se pudieron leer las rutas de src/App.tsx')
} else {
  console.log(`  (${routes.length} rutas: ${routes.join(', ')})`)
  for (const route of routes) {
    const r = await request(`${baseUrl}${route}`)
    if (!r.ok) bad(`${route} — fallo de red: ${r.error}`)
    else if (r.status !== 200) bad(`${route} — HTTP ${r.status} (fallback SPA roto)`)
    else if (!/<div[^>]+id=["']root["']|<script[^>]+type=["']module["']/i.test(r.body)) {
      bad(`${route} — 200 pero no devuelve el index.html de la app`)
    } else ok(`${route} — 200 + index.html`)
  }

  // Rutas profundas: la prueba real del fallback SPA.
  for (const deep of ['/historial/2026-01-15', '/ruta/inexistente/debe/caer-en-el-spa']) {
    const r = await request(`${baseUrl}${deep}`)
    if (r.ok && r.status === 200) ok(`fallback SPA: ${deep} → 200`)
    else bad(`fallback SPA: ${deep} → ${r.ok ? r.status : r.error}`)
  }

  // Assets referenciados por el HTML de inicio.
  const assets = [...new Set([...home.body.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css|woff2?))"/g)].map((m) => m[1]))]
  let missing = []
  for (const a of assets.slice(0, 15)) {
    const r = await request(`${baseUrl}${a}`)
    if (!r.ok || r.status !== 200) missing.push(`${a} (${r.ok ? r.status : 'red'})`)
  }
  missing.length === 0
    ? ok(`los ${assets.length} assets iniciales responden`)
    : bad(`assets inaccesibles: ${missing.join(', ')}`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[4] Artefactos de PWA')
// ─────────────────────────────────────────────────────────────────────────────
for (const [p, label] of [
  ['/manifest.webmanifest', 'manifest'],
  ['/sw.js', 'service worker'],
]) {
  const r = await request(`${baseUrl}${p}`)
  if (r.ok && r.status === 200) ok(`${label} accesible (${p})`)
  else bad(`${label} no accesible: ${p} → ${r.ok ? r.status : r.error}`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[5] Worker: alcanzable y sin reflexión de Origin')
// ─────────────────────────────────────────────────────────────────────────────
if (workerUrl) {
  if (allowedOrigin !== baseUrl) {
    console.log(`  (validando CORS contra STAGING_ALLOWED_ORIGIN=${allowedOrigin})`)
  }
  const preflight = await request(workerUrl, { method: 'OPTIONS', headers: { Origin: allowedOrigin } })
  if (!preflight.ok) bad(`Worker no alcanzable: ${preflight.error}`)
  else {
    ok(`Worker OPTIONS → ${preflight.status}`)
    if (preflight.status === 204 || preflight.status === 200) ok('preflight CORS aceptado')
    else if (preflight.status === 403) {
      bad(`Worker rechaza ${allowedOrigin}; CORS_ORIGIN del Worker no coincide`)
    } else bad(`preflight inesperado: ${preflight.status}`)

    const allowOrigin = preflight.headers.get('access-control-allow-origin')
    if (allowOrigin === allowedOrigin) ok('ACAO refleja el Origin permitido (no *)')
    else if (allowOrigin === '*') bad('ACAO = * (el Worker no debe permitir wildcard)')
    else bad(`ACAO inesperado: ${allowOrigin}`)
  }

  const evil = await request(workerUrl, { method: 'OPTIONS', headers: { Origin: 'https://attacker.example' } })
  evil.status === 403 ? ok('Origin no permitido → 403') : bad(`Origin no permitido → ${evil.status} (esperado 403)`)

  const get = await request(workerUrl, { method: 'GET', headers: { Origin: allowedOrigin } })
  get.status === 405 ? ok('GET → 405') : bad(`GET → ${get.status} (esperado 405)`)
} else {
  bad('STAGING_WORKER_URL no definido')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[6] Lo que este script NO puede validar')
// ─────────────────────────────────────────────────────────────────────────────
nv('CSP aplicada por el navegador en runtime', 'hace falta un navegador real y DevTools')
nv('actualización del service worker entre 2 versiones', 'hace falta V1 y V2 desplegadas')
nv('consola/red durante el smoke test de usuario', 'hace falta navegador')
nv('Coach remoto E2E', 'hace falta GROQ_API_KEY en el Worker')
nv('aislamiento Firestore A/B', 'lo prueba `npm run staging:firestore:e2e`')
nv('smoke test funcional completo', 'hace falta un navegador y USER A/B')

console.log('\n' + '-'.repeat(66))
console.log(`PASS=${passes.length}  FAIL=${failures.length}  NOT VALIDATED=${notValidated.length}`)
console.log(`HTTP STAGING SMOKE = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
