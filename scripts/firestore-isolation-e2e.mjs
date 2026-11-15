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
 * No se ejecuta nada en producción: EXIGE FIREBASE_STAGING_PROJECT_ID, comprueba
 * que VITE_FIREBASE_PROJECT_ID coincida con él y que ni él ni el build sean el
 * proyecto de producción. Sin la identidad declarada de staging, aborta.
 *
 * No imprime contraseñas ni tokens.
 *
 * Salida: 0 = PASS · 1 = FAIL (aislamiento roto) · 2 = BLOCKED (owner)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { checkFirestoreE2eTarget } from './lib/env-config.mjs'

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

// Modo emulador local (verificación sin proveedor Email/Password en staging).
const isEmu = process.env.E2E_EMULATOR === '1'

console.log('=== FIRESTORE ISOLATION E2E (staging) ===')
console.log(`project = ${projectId || '(sin definir)'}`)
if (isEmu) console.log('mode = EMULADOR LOCAL (auth 9099 / firestore 8080, mismas firestore.rules)')

// ── Guardas de ambiente ──────────────────────────────────────────────────────
// La lógica vive en scripts/lib/env-config.mjs (pura y con tests propios) para
// que no se pueda "aflojar" sin que un test lo detecte.
const guard = checkFirestoreE2eTarget({ projectId, apiKey, stagingId, productionId })
if (!guard.ok) {
  if (guard.level === 'abort') {
    console.error(`\nABORT: ${guard.message}`)
    process.exit(1)
  }
  block(guard.message)
  process.exit(2)
}

// ── Endpoints ────────────────────────────────────────────────────────────────
// Por defecto: Firestore REAL (staging). Con E2E_EMULATOR=1 apunta a los
// emuladores locales (Auth 9099 / Firestore 8080) — misma lógica, mismas
// reglas de firestore.rules, datos locales descartables. Usado para completar
// la verificación cuando el proveedor Email/Password aún no está habilitado.
const IDENTITY = isEmu
  ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts'
  : 'https://identitytoolkit.googleapis.com/v1/accounts'

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
const DB = isEmu
  ? 'http://127.0.0.1:8080/v1/projects'
  : 'https://firestore.googleapis.com/v1/projects'
const COLLECTION = '_isolation_probe'

function docPath(uid, docId, col = COLLECTION) {
  return `${DB}/${projectId}/databases/(default)/documents/users/${uid}/${col}/${docId}`
}

async function writeDoc(token, uid, docId, value, col) {
  return fetch(`${docPath(uid, docId, col)}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields: { marker: { stringValue: value } } }),
  })
}

async function updateDoc(token, uid, docId, value, col) {
  return fetch(docPath(uid, docId, col), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields: { marker: { stringValue: value } } }),
  })
}

async function readDoc(token, uid, docId, col) {
  return fetch(docPath(uid, docId, col), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function deleteDoc(token, uid, docId, col) {
  return fetch(docPath(uid, docId, col), {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function cleanup(uid, token) {
  for (const d of ['probeA', 'probeB']) {
    await deleteDoc(token, uid, d).catch(() => {})
  }
  await deleteDoc(token, uid, 'sess-1', 'activitySessions').catch(() => {})
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

console.log('\n[8] Round-trip de activitySessions: crear, leer, actualizar, borrar')
{
  const COL = 'activitySessions'
  const w = await writeDoc(tokenA, uidA, 'sess-1', 'v1', COL)
  if (w.ok) ok('activitySessions: creación permitida (A)')
  else bad(`activitySessions: creación denegada (${w.status})`)

  const r1 = await readDoc(tokenA, uidA, 'sess-1', COL)
  if (r1.ok && (await r1.text()).includes('v1')) ok('activitySessions: descarga permitida (A)')
  else bad(`activitySessions: descarga fallida (${r1.status})`)

  const u = await updateDoc(tokenA, uidA, 'sess-1', 'v2', COL)
  if (u.ok) ok('activitySessions: actualización permitida (A)')
  else bad(`activitySessions: actualización denegada (${u.status})`)

  const r2 = await readDoc(tokenA, uidA, 'sess-1', COL)
  if (r2.ok && (await r2.text()).includes('v2')) ok('activitySessions: la actualización se reflejó')
  else bad('activitySessions: la actualización no se reflejó en la descarga')

  // B intenta borrar el registro de A: debe fallar y NO alterar el dato.
  const d = await deleteDoc(tokenB, uidA, 'sess-1', COL)
  if (d.status === 403 || d.status === 404) ok(`borrado ajeno denegado (${d.status})`)
  else bad(`borrado ajeno: se esperaba 403/404, obtenido ${d.status}`)

  const r3 = await readDoc(tokenA, uidA, 'sess-1', COL)
  if (r3.ok && (await r3.text()).includes('v2')) ok('el borrado fallido no alteró el registro de A')
  else bad('el borrado fallido alteró o eliminó el registro de A')

  // BORRADO EXITOSO (A sobre su propio registro): traza de R1 limpia el
  // remoto solo tras confirmar esto.
  const dOk = await deleteDoc(tokenA, uidA, 'sess-1', COL)
  if (dOk.ok || dOk.status === 404) ok('borrado propio confirmado')
  else bad(`borrado propio: se esperaba 2xx/404, obtenido ${dOk.status}`)

  const r4 = await readDoc(tokenA, uidA, 'sess-1', COL)
  if (r4.status === 404) ok('el registro ya no existe tras el borrado (sin resurrección)')
  else bad(`post-borrado: se esperaba 404, obtenido ${r4.status}`)
}

console.log('\n[9] Limpieza')
await cleanup(uidA, tokenA)
await cleanup(uidB, tokenB)
console.log('  documentos de prueba eliminados')

console.log('\n' + '-'.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}  BLOCKED=${blocked.length}`)
console.log(`FIRESTORE ISOLATION E2E = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
