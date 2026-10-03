/**
 * ALTHEA — Verificación de rutas de Firebase Hosting (staging).
 *
 * Comprueba contra el Hosting REAL que cada ruta directa de la SPA:
 *   - responde 200 (no 404);
 *   - devuelve el index.html de la app, no una página de error;
 *   - no depende de que el usuario haya navegado antes (fallback SPA);
 *   - los assets referenciados por ese HTML existen de verdad.
 *
 * No es un test de navegador: no ejecuta JS ni mide Core Web Vitals. La
 * validación de CSP en runtime y la actualización de la PWA requieren un
 * navegador real y se marcan aparte como NOT VALIDATED.
 *
 * Uso: node scripts/hosting-route-check.mjs <HOSTING_URL>
 * Salida: 0 = PASS · 1 = FAIL · 2 = BLOCKED (sin URL)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const base = (process.argv[2] || '').replace(/\/+$/, '')

if (!base) {
  console.error('uso: node scripts/hosting-route-check.mjs <HOSTING_URL>')
  console.error('  staging: https://<STAGING_PROJECT_ID>.web.app')
  process.exit(2)
}

/**
 * Las rutas se LEEN del router real (src/App.tsx), no de una lista escrita a
 * mano. Motivo: `/inicio` y `/historial` parecen rutas pero no lo son — Inicio
 * vive en `/` y no existe ruta de historial. Una lista escrita a mano
 * reportaría 404 falsos y daría por rota una app que funciona.
 */
function readRouterRoutes() {
  const appFile = path.join(process.cwd(), 'src', 'App.tsx')
  if (!fs.existsSync(appFile)) return null
  const src = fs.readFileSync(appFile, 'utf8')
  const routes = [...src.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
  return [...new Set(routes)]
}

const ROUTES = readRouterRoutes()

/** Rutas profundas: la prueba real del fallback SPA. */
const DEEP_ROUTES = [
  '/historial/2026-01-15',
  '/nutricion/registro',
  '/ruta/que/no/existe/deberia/caer-en-el-spa',
]

const failures = []
const passes = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }

console.log('=== HOSTING ROUTE CHECK ===')
console.log(`base = ${base}`)
console.log('-'.repeat(62))

/** Una respuesta de Hosting válido contiene el mount point de la app. */
function looksLikeApp(html) {
  return /<div[^>]+id=["']root["']|<script[^>]+type=["']module["']/i.test(html)
}

async function checkRoute(route) {
  let res
  try {
    res = await fetch(`${base}${route}`, { redirect: 'follow' })
  } catch (e) {
    bad(`${route} — fallo de red: ${e.message}`)
    return
  }

  if (res.status !== 200) {
    bad(`${route} — HTTP ${res.status} (se esperaba 200; sin fallback SPA)`)
    return
  }

  const html = await res.text()
  if (!looksLikeApp(html)) {
    bad(`${route} — 200 pero no devuelve el index.html de la app`)
    return
  }

  // Los assets con hash deben existir de verdad: un HTML correcto con un
  // bundle 404 es una rotura silenciosa.
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css|woff2?))"/g)].map((m) => m[1])
  const unique = [...new Set(assets)]
  let missing = []
  for (const a of unique.slice(0, 12)) {
    const ar = await fetch(`${base}${a}`, { method: 'GET' })
    if (!ar.ok) missing.push(`${a} (${ar.status})`)
  }
  if (missing.length) {
    bad(`${route} — assets inaccesibles: ${missing.join(', ')}`)
    return
  }

  ok(`${route} — 200, index.html de la app, ${unique.length} asset(s) accesible(s)`)
}

console.log('\n[1] Rutas declaradas en src/App.tsx')
if (!ROUTES || ROUTES.length === 0) {
  bad('no se pudieron leer las rutas del router desde src/App.tsx')
} else {
  console.log(`  (${ROUTES.length} rutas detectadas: ${ROUTES.join(', ')})`)
  for (const r of ROUTES) await checkRoute(r)
}

console.log('\n[2] Rutas profundas (fallback SPA real)')
for (const r of DEEP_ROUTES) await checkRoute(r)

console.log('\n[3] Cabeceras de seguridad en la respuesta real')
{
  const res = await fetch(`${base}/`, { redirect: 'follow' })
  const checks = [
    ['X-Content-Type-Options', (v) => v === 'nosniff'],
    ['Strict-Transport-Security', (v) => /max-age=\d+/.test(v)],
    ['Referrer-Policy', (v) => v === 'strict-origin-when-cross-origin'],
    ['Content-Security-Policy', (v) => v.length > 0],
  ]
  for (const [header, predicate] of checks) {
    const v = res.headers.get(header)
    if (v && predicate(v)) ok(`${header} activo`)
    else bad(`${header} ausente o inesperado (${v || 'null'})`)
  }

  const csp = res.headers.get('Content-Security-Policy') || ''
  const connect = (csp.match(/connect-src\s+([^;]+)/) || [, ''])[1]
  for (const host of ['wger.de', 'nutricion-api-arg.fly.dev', '*.workers.dev']) {
    if (connect.includes(host)) ok(`CSP connect-src incluye ${host}`)
    else bad(`CSP connect-src NO incluye ${host} — la app fallará en runtime`)
  }
  // Un comodín de subdominio (`*.googleapis.com`) es legítimo y necesario.
  // Lo peligroso es un token `*` desnudo, que permitiría cualquier origin.
  const connectTokens = connect.trim().split(/\s+/)
  if (connectTokens.includes('*')) bad('CSP connect-src con wildcard desnudo (*)')
  else ok('CSP connect-src sin wildcard desnudo')
}

console.log('\n[4] Artefactos de PWA')
for (const [path, label] of [
  ['/manifest.webmanifest', 'manifest'],
  ['/sw.js', 'service worker'],
]) {
  try {
    const res = await fetch(`${base}${path}`)
    if (res.ok) ok(`${label} accesible (${path})`)
    else bad(`${label} no accesible: ${path} → HTTP ${res.status}`)
  } catch (e) {
    bad(`${label} no accesible: ${e.message}`)
  }
}

console.log('\n' + '-'.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}`)
console.log('NOT VALIDATED (requiere navegador real, no este script):')
console.log('  - CSP evaluada por el navegador en tiempo de ejecución')
console.log('  - actualización del service worker entre dos versiones')
console.log('  - consola/red durante un smoke test de usuario')
console.log(`HOSTING ROUTE CHECK = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
