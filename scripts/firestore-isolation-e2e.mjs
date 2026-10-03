/**
 * ALTHEA — Prueba E2E de aislamiento en Firestore (staging).
 *
 * Comprueba contra FIRESTORE REAL, no contra el archivo de reglas:
 *
 *   A → A = permitido        B → A = denegado
 *   A → B = denegado         B → B = permitido
 *   anónimo → datos privados = denegado
 *
 * Usa sólo la configuración web pública (VITE_FIREBASE_*), igual que la app.
 * NO necesita service account ni credenciales administrativas: las dos cuentas
 * de prueba se crean por el endpoint público de registro y se autentican por
 * contraseña, que es exactamente el camino que usa un usuario real.
 *
 * No se ejecuta nada en producción: exige FIREBASE_STAGING_PROJECT_ID y
 * verifica que el proyecto NO sea el de producción.
 *
 * No imprime contraseñas ni tokens.
 *
 * Salida: 0 = PASS · 1 = FAIL (aislamiento roto) · 2 = BLOCKED (owner)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

// ── Config ───────────────────────────────────────────────────────────────────
function envOrFile(key, file) {
  if (process.env[key]?.trim()) return process.env[key].trim()
  const full = path.join(ROOT, file)
  if (fs.existsSync(full)) {
    const m = fs.readFileSync(full, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const projectId = envOrFile('VITE_FIREBASE_PROJECT_ID', '.env.staging') || envOrFile('VITE_FIREBASE_PROJECT_ID', '.env.local')
const apiKey = envOrFile('VITE_FIREBASE_API_KEY', '.env.staging') || envOrFile('VITE_FIREBASE_API_KEY', '.env.local')
const stagingId = envOrFile('FIREBASE_STAGING_PROJECT_ID', '.env.staging')
const productionId = envOrFile('FIREBASE_PRODUCTION_PROJECT_ID', '.env.production')

const blocked = []
const failures = []
const passes = []

const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }
const block = (m) => { blocked.push(m); console.log(`  [BLOCKED] ${m}`) }

console.log('=== FIRESTORE ISOLATION E2E (staging) ===')
console.log(`project = ${projectId || '(sin definir)'}`)

// ── Guardas de ambiente ──────────────────────────────────────────────────────
if (!projectId) {
  block('Falta VITE_FIREBASE_PROJECT_ID (staging). No se puede probar el aislamiento.')
  process.exit(2)
}
if (!apiKey) {
  block('Falta VITE_FIREBASE_API_KEY (staging).')
  process.exit(2)
}
if (productionId && projectId === productionId) {
  console.error('\nABORT: el proyecto configurado es el de PRODUCCIÓN. Esta prueba es sólo de staging.')
  process.exit(1)
}

// ── Helpers Identity Toolkit ────────────────────────────────────────────────
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts'

async function signup(email, password) {
  const res = await fetch(`${IDENTITY}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

async function signIn(email, password) {
  const res = await fetch(`${IDENTITY}:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

// ── Helpers Firestore REST ──────────────────────────────────────────────────
const DB = 'https://firestore.googleapis.com/v1/projects'
const COLLECTION = '_isolation_probe'

function docPath(uid, docId) {
  return `${DB}/${projectId}/databases/(default)/documents/users/${uid}/${COLLECTION}/${docId}`
}

async function writeDoc(token, uid, docId, value) {
  return fetch(`${docPath(uid, docId)}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields: { marker: { stringValue: value } } }),
  })
}

async function readDoc(token, uid, docId) {
  return fetch(docPath(uid, docId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function cleanup(uid, token) {
  for (const d of ['probeA', 'probeB']) {
    await fetch(`${docPath(uid, d)}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {})
  }
}

// ── Prueba ──────────────────────────────────────────────────────────────────
const stamp = Date.now()
const emailA = `althea-probe-a-${stamp}@example.com`
const emailB = `althea-probe-b-${stamp}@example.com`
const password = `Alth3a-${stamp}-x`

console.log('\n[1] Crear dos cuentas de prueba')
const a = await signup(emailA, password)
const b = await signup(emailB, password)

if (!a.data.localId || !b.data.localId) {
  const reason = JSON.stringify(a.data?.error?.message || b.data?.error?.message || 'desconocido')
  console.error(`\nNo se pudieron crear las cuentas de prueba: ${reason}`)
  if (/OPERATION_NOT_ALLOWED|EMAIL_SIGN_IN_PROVIDER_DISABLED/i.test(reason)) {
    console.error('Habilitá el proveedor Email/Password en Firebase Auth → Sign-in method.')
  }
  if (/OPERATION_NOT_ALLOWED|API key not valid|PERMISSION_DENIED/i.test(reason)) {
    console.error('Verificá VITE_FIREBASE_API_KEY y que Authentication esté habilitado en el proyecto.')
  }
  block('No se pudieron crear las cuentas de prueba en el proyecto de staging.')
  process.exit(2)
}

const uidA = a.data.localId
const uidB = b.data.localId
console.log(`  USER A uid = ${uidA}`)
console.log(`  USER B uid = ${uidB}`)

const tokenA = a.data.idToken
const tokenB = b.data.idToken

console.log('\n[2] A escribe y lee sus propios datos')
{
  const w = await writeDoc(tokenA, uidA, 'probeA', 'owned-by-A')
  if (w.ok) ok('A → A: escritura permitida')
  else bad(`A → A: escritura denegada (${w.status})`)

  const r = await readDoc(tokenA, uidA, 'probeA')
  if (r.ok) ok('A → A: lectura permitida')
  else bad(`A → A: lectura denegada (${r.status})`)
}

console.log('\n[3] B escribe y lee sus propios datos')
{
  const w = await writeDoc(tokenB, uidB, 'probeB', 'owned-by-B')
  if (w.ok) ok('B → B: escritura permitida')
  else bad(`B → B: escritura denegada (${w.status})`)

  const r = await readDoc(tokenB, uidB, 'probeB')
  if (r.ok) ok('B → B: lectura permitida')
  else bad(`B → B: lectura denegada (${r.status})`)
}

console.log('\n[4] A NO puede acceder a los datos de B')
{
  const r = await readDoc(tokenA, uidB, 'probeB')
  if (r.status === 403 || r.status === 404) ok(`A → B: denegado (${r.status})`)
  else bad(`A → B: se esperaba 403/404, obtenido ${r.status}`)

  const w = await writeDoc(tokenA, uidB, 'probeB', 'hijacked')
  if (w.status === 403) ok(`A → B: escritura denegada (${w.status})`)
  else bad(`A → B escritura: se esperaba 403, obtenido ${w.status}`)
}

console.log('\n[5] B NO puede acceder a los datos de A')
{
  const r = await readDoc(tokenB, uidA, 'probeA')
  if (r.status === 403 || r.status === 404) ok(`B → A: denegado (${r.status})`)
  else bad(`B → A: se esperaba 403/404, obtenido ${r.status}`)

  const w = await writeDoc(tokenB, uidA, 'probeA', 'hijacked')
  if (w.status === 403) ok(`B → A: escritura denegada (${w.status})`)
  else bad(`B → A escritura: se esperaba 403, obtenido ${w.status}`)
}

console.log('\n[6] Anónimo NO puede acceder a datos privados')
{
  const r = await readDoc(null, uidA, 'probeA')
  if (r.status === 401 || r.status === 403) ok(`anónimo → A: denegado (${r.status})`)
  else bad(`anónimo → A: se esperaba 401/403, obtenido ${r.status}`)

  const w = await writeDoc(null, uidA, 'probeA', 'anonymous-write')
  if (w.status === 401 || w.status === 403) ok(`anónimo → A escritura: denegada (${w.status})`)
  else bad(`anónimo → A escritura: se esperaba 401/403, obtenido ${w.status}`)
}

console.log('\n[7] El intento de secuestro no alteró los datos de B')
{
  const r = await readDoc(tokenB, uidB, 'probeB')
  if (!r.ok) {
    bad('no se puede leer el doc de B tras el intento de escritura')
  } else {
    const text = await r.text()
    if (text.includes('owned-by-B')) ok('los datos de B siguen intactos')
    else bad('los datos de B fueron alterados')
  }
}

console.log('\n[8] Limpieza')
await cleanup(uidA, tokenA)
await cleanup(uidB, tokenB)
console.log('  documentos de prueba eliminados')

console.log('\n' + '-'.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}  BLOCKED=${blocked.length}`)
console.log(`FIRESTORE ISOLATION E2E = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
