/**
 * ALTHEA — Prueba E2E de Firebase Authentication (staging).
 *
 * Usa sólo la configuración web pública (VITE_FIREBASE_*), igual que la app.
 * NO necesita service account. Las cuentas se crean por el endpoint público de
 * registro y se autentican por contraseña: es el camino real de un usuario.
 *
 * Qué demuestra (y qué NO):
 *   registro, login, credenciales inválidas, usuario inexistente,
 *   persistencia de sesión vía refresh token, logout con revocación,
 *   y cambio real de UID entre dos cuentas.
 *
 * NO demuestra: comportamiento del SDK en el navegador, ni la integración de
 * la UI de login. Eso es smoke test con navegador.
 *
 * Aborta si el proyecto fuera el de producción.
 * No imprime contraseñas ni tokens.
 *
 * Salida: 0 = PASS · 1 = FAIL · 2 = BLOCKED
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

function envOrFile(key, file) {
  if (process.env[key]?.trim()) return process.env[key].trim()
  const full = path.join(ROOT, file)
  if (fs.existsSync(full)) {
    const m = fs.readFileSync(full, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const projectId =
  envOrFile('VITE_FIREBASE_PROJECT_ID', '.env.staging') || envOrFile('VITE_FIREBASE_PROJECT_ID', '.env.local')
const apiKey = envOrFile('VITE_FIREBASE_API_KEY', '.env.staging') || envOrFile('VITE_FIREBASE_API_KEY', '.env.local')
const stagingId = envOrFile('FIREBASE_STAGING_PROJECT_ID', '.env.staging')
const productionId = envOrFile('FIREBASE_PRODUCTION_PROJECT_ID', '.env.production')

const failures = []
const passes = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }

console.log('=== FIREBASE AUTH E2E (staging) ===')
console.log(`project = ${projectId || '(sin definir)'}`)

if (!projectId || !apiKey) {
  console.error('\nBLOCKED - OWNER ACTION REQUIRED: falta VITE_FIREBASE_PROJECT_ID / VITE_FIREBASE_API_KEY de staging.')
  process.exit(2)
}
if (productionId && projectId === productionId) {
  console.error('\nABORT: el proyecto configurado es el de PRODUCCIÓN.')
  process.exit(1)
}

const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts'

async function call(method, payload) {
  const res = await fetch(`${IDENTITY}:${method}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

const stamp = Date.now()
const emailA = `althea-auth-a-${stamp}@example.com`
const emailB = `althea-auth-b-${stamp}@example.com`
const password = `Alth3a-${stamp}-x`
const wrongPassword = `${password}-incorrecta`

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] Registro de dos cuentas')
const regA = await call('signUp', { email: emailA, password, returnSecureToken: true })
const regB = await call('signUp', { email: emailB, password, returnSecureToken: true })

if (!regA.data.localId || !regB.data.localId) {
  const reason = regA.data?.error?.message || regB.data?.error?.message || 'desconocido'
  console.error(`\nNo se pudieron crear las cuentas: ${reason}`)
  if (/EMAIL_SIGN_IN_PROVIDER_DISABLED|OPERATION_NOT_ALLOWED/i.test(reason)) {
    console.error('→ Activá el proveedor Email/Password en Firebase Auth → Sign-in method.')
  }
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(reason)) {
    console.error('→ Revisá VITE_FIREBASE_API_KEY y que Authentication esté habilitado.')
  }
  process.exit(2)
}

const uidA = regA.data.localId
const uidB = regB.data.localId
ok('USER A registrada')
ok('USER B registrada')
ok(`USER A y USER B tienen UID distinto (${uidA} / ${uidB})`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] Login válido')
{
  const r = await call('signInWithPassword', { email: emailA, password, returnSecureToken: true })
  if (r.data.localId === uidA && r.data.idToken && r.data.refreshToken) ok('A: login devuelve el mismo UID + idToken + refreshToken')
  else bad(`A: login inesperado (${r.data.error?.message || 'sin token'})`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3] Credenciales inválidas')
{
  const r = await call('signInWithPassword', { email: emailA, password: wrongPassword, returnSecureToken: true })
  const denied = !r.data.idToken && /INVALID_PASSWORD|CREDENTIALS_MISSING|INVALID_LOGIN_CREDENTIALS/i.test(r.data.error?.message || '')
  if (denied) ok(`A: password incorrecta rechazada (${r.data.error.message})`)
  else bad(`A: password incorrecta NO fue rechazada (${r.data.error?.message || 'devolvió token'})`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[4] Usuario inexistente')
{
  const r = await call('signInWithPassword', {
    email: `nadie-${stamp}@example.com`,
    password,
    returnSecureToken: true,
  })
  const denied = !r.data.idToken && /EMAIL_NOT_FOUND|USER_NOT_FOUND|INVALID_LOGIN_CREDENTIALS/i.test(r.data.error?.message || '')
  if (denied) ok(`usuario inexistente rechazado (${r.data.error.message})`)
  else bad(`usuario inexistente NO fue rechazado (${r.data.error?.message || 'devolvió token'})`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[5] Persistencia de sesión (refresh token)')
{
  const first = await call('signInWithPassword', { email: emailA, password, returnSecureToken: true })
  const refresh = first.data.refreshToken
  if (!refresh) {
    bad('A: sin refreshToken; no se puede probar persistencia')
  } else {
    const r = await call('signInWithRefreshToken', { refreshToken: refresh, returnSecureToken: true })
    if (r.data.localId === uidA && r.data.idToken) ok('A: refresh token renueva sesión con el mismo UID')
    else bad(`A: refresh falló (${r.data.error?.message || 'sin token'})`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[6] Cambio de usuario (B entra después de A)')
{
  const r = await call('signInWithPassword', { email: emailB, password, returnSecureToken: true })
  if (r.data.localId === uidB && r.data.localId !== uidA) ok('B: login devuelve un UID distinto al de A')
  else bad(`B: login inesperado (${r.data.localId})`)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[7] Logout con revocación')
{
  const login = await call('signInWithPassword', { email: emailA, password, returnSecureToken: true })
  const refresh = login.data.refreshToken
  if (!refresh) {
    bad('A: sin refreshToken para probar el logout')
  } else {
    const out = await call('signOut', { refreshToken: refresh })
    if (out.res.ok) ok('A: signOut aceptado')
    else bad(`A: signOut falló (${out.data.error?.message || out.res.status})`)

    // Tras revocar, ese refresh token ya no debe servir.
    const reuse = await call('signInWithRefreshToken', { refreshToken: refresh, returnSecureToken: true })
    const revoked = !reuse.data.idToken
    if (revoked) ok('A: el refresh token revocado ya no sirve (sesión realmente cerrada)')
    else bad('A: el refresh token revocado SIGUE funcionando; el logout no revocó')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[8] Verificación por email (protege cuentas de prueba)')
{
  const r = await call('sendOobCode', { requestType: 'VERIFY_EMAIL', email: emailA })
  if (r.res.ok) ok('A: correo de verificación enviado')
  else console.log(`  [WARN] no se pudo enviar verificación (${r.data.error?.message || 'ignorado'})`)
}

console.log('\nNOT VALIDATED aquí (requiere navegador real):')
console.log('  - login/logout desde la UI de la app')
console.log('  - persistencia de sesión tras cerrar el navegador')
console.log('  - wipe de datos locales al cambiar de cuenta')
console.log('  - onBoarding de A y B sobre el proyecto de staging')

console.log('\n' + '='.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}`)
console.log(`FIREBASE AUTH E2E = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
console.log('\nCuentas de prueba creadas (eliminarlas al terminar):')
console.log(`  ${emailA}`)
console.log(`  ${emailB}`)
process.exit(failures.length === 0 ? 0 : 1)
