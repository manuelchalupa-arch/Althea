/**
 * ALTHEA — Aprobación atómica de grupos con Firebase Client SDK + emulador.
 *
 * Comprueba con el SDK real (runTransaction) que aprobar una solicitud y dar
 * de alta al integrante ocurren juntas, y que las escrituras separadas son
 * rechazadas por las reglas. Solo corre con E2E_EMULATOR=1 y project demo.
 */

import process from 'node:process'
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc, runTransaction } from 'firebase/firestore'

const E2E = process.env.E2E_EMULATOR === '1'
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-althea'
const apiKey = process.env.VITE_FIREBASE_API_KEY || 'demo-api-key'
const productionId = process.env.FIREBASE_PRODUCTION_PROJECT_ID

const passes = []
const failures = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }

console.log('=== GRUPOS CROSSFIT — APROBACIÓN ATÓMICA (CLIENT SDK + EMULADOR) ===')
console.log(`project = ${projectId}`)
if (!E2E || !projectId.startsWith('demo-') || projectId === productionId) {
  console.error('ABORT: requiere E2E_EMULATOR=1 y un project demo.')
  process.exit(1)
}

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts'
const DB = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`

async function signup(email, password) {
  const res = await fetch(`${AUTH}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.idToken) { throw new Error(`signup falló: ${JSON.stringify(data)}`) }
  return data
}

const fsValue = (value) => {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } }
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fsValue(v)])) } }
  return { nullValue: null }
}
const fields = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fsValue(v)]))

async function restWrite(token, path, values, create = false) {
  return fetch(`${DB}/${path}${create ? '?currentDocument.exists=false' : ''}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: fields(values) }),
  })
}

async function restRead(token, path) {
  return fetch(`${DB}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
}

function expectStatus(label, res, expected) {
  if (res.status === expected) { ok(`${label} (${res.status})`) }
  else { bad(`${label}: esperaba ${expected}, obtuvo ${res.status}`) }
}

async function expectDenied(label, operation) {
  try {
    await operation()
    bad(`${label}: la regla NO lo rechazó`)
  } catch (error) {
    if (error?.code === 'permission-denied' || String(error?.message || '').includes('permission-denied')) {
      ok(`${label} (permission-denied)`)
    } else {
      bad(`${label}: error inesperado ${error?.code || error?.message}`)
    }
  }
}

const stamp = Date.now()
const password = `Alth3a-${stamp}-tx`
const emailA = `althea-tx-owner-${stamp}@example.com`
const emailB = `althea-tx-b-${stamp}@example.com`
const emailC = `althea-tx-c-${stamp}@example.com`
const [a, b, c] = await Promise.all([
  signup(emailA, password), signup(emailB, password), signup(emailC, password),
])
const uidA = a.localId, uidB = b.localId, uidC = c.localId
const now = new Date()
const iso = now.toISOString()
const groupId = `tx-grupo-${stamp}`
const randomToken = () => {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
const inviteB = randomToken()
const inviteC = randomToken()

const groupDoc = {
  id: groupId, name: 'Grupo transacción', description: '', schedule: '',
  ownerId: uidA, ownerName: 'Entrenadora', memberIds: [uidA],
  memberNames: { [uidA]: 'Entrenadora' }, createdAt: iso, updatedAt: iso,
}
const inviteDoc = (token) => ({
  groupId, groupName: groupDoc.name, createdBy: uidA, createdAt: iso,
  expiresAt: new Date(now.getTime() + 7 * 86400000), revoked: false,
})
const requestDoc = (uid, displayName, token) => ({
  uid, groupId, displayName, email: `${displayName}@example.com`, message: '',
  status: 'pending', inviteToken: token, createdAt: iso, updatedAt: iso,
})

console.log('\n[1] Preparar grupo, invitaciones y solicitudes')
expectStatus('A crea el grupo', await restWrite(a.idToken, `cfGroups/${groupId}`, groupDoc, true), 200)
expectStatus('A crea invitación para B', await restWrite(a.idToken, `cfInvites/${inviteB}`, inviteDoc(inviteB), true), 200)
expectStatus('A crea invitación para C', await restWrite(a.idToken, `cfInvites/${inviteC}`, inviteDoc(inviteC), true), 200)
expectStatus('B solicita ingreso', await restWrite(b.idToken, `cfGroups/${groupId}/requests/${uidB}`, requestDoc(uidB, 'Atleta B', inviteB), true), 200)
expectStatus('C solicita ingreso', await restWrite(c.idToken, `cfGroups/${groupId}/requests/${uidC}`, requestDoc(uidC, 'Atleta C', inviteC), true), 200)

const app = initializeApp({ projectId, apiKey, authDomain: `${projectId}.firebaseapp.com` })
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
const db = getFirestore(app)
connectFirestoreEmulator(db, '127.0.0.1', 8080)
await signInWithEmailAndPassword(auth, emailA, password)
console.log(`  SDK autenticado como ${auth.currentUser?.uid?.slice(0, 8)}…`)

const groupRef = doc(db, 'cfGroups', groupId)
const requestBRef = doc(db, 'cfGroups', groupId, 'requests', uidB)
const requestCRef = doc(db, 'cfGroups', groupId, 'requests', uidC)
const reviewedAt = new Date().toISOString()

console.log('\n[2] Aprobación transaccional con runTransaction')
try {
  await runTransaction(db, async (tx) => {
    const [groupSnap, requestSnap] = await Promise.all([tx.get(groupRef), tx.get(requestBRef)])
    if (!groupSnap.exists() || !requestSnap.exists() || requestSnap.data().status !== 'pending') {
      throw new Error('Estado previo inválido')
    }
    tx.update(requestBRef, {
      status: 'approved', reviewedBy: uidA, reviewedAt, updatedAt: reviewedAt,
    })
    tx.update(groupRef, {
      memberIds: [uidA, uidB],
      memberNames: { [uidA]: 'Entrenadora', [uidB]: 'Atleta B' },
      updatedAt: reviewedAt,
    })
  })
  ok('runTransaction aprueba e incorpora a B en una sola transacción')
} catch (error) {
  bad(`runTransaction falló: ${error?.code || error?.message}`)
}
expectStatus('B puede leer el grupo tras la transacción', await restRead(b.idToken, `cfGroups/${groupId}`), 200)

console.log('\n[3] Escrituras separadas son rechazadas')
await expectDenied('Aprobar C sin incorporarla al grupo', () => updateDoc(requestCRef, {
  status: 'approved', reviewedBy: uidA, reviewedAt, updatedAt: reviewedAt,
}))
await expectDenied('Incorporar a C sin aprobar su solicitud', () => updateDoc(groupRef, {
  memberIds: [uidA, uidB, uidC],
  memberNames: { [uidA]: 'Entrenadora', [uidB]: 'Atleta B', [uidC]: 'Atleta C' },
  updatedAt: reviewedAt,
}))
await expectDenied('Transacción que solo aprueba (sin tocar memberIds)', () => runTransaction(db, async (tx) => {
  tx.update(requestCRef, { status: 'approved', reviewedBy: uidA, reviewedAt, updatedAt: reviewedAt })
}))
{
  const snap = await getDoc(requestCRef)
  const group = await getDoc(groupRef)
  if (snap.data()?.status === 'pending' && group.data()?.memberIds.length === 2) {
    ok('Tras los rechazos, la solicitud sigue pending y el grupo intacto')
  } else { bad('Los rechazos alteraron el estado') }
}

console.log('\n[4] Rechazo standalone y baja autorizada')
try {
  await updateDoc(requestCRef, { status: 'rejected', reviewedBy: uidA, reviewedAt, updatedAt: reviewedAt })
  ok('El propietario puede rechazar una solicitud sin tocar el grupo')
} catch (error) { bad(`Rechazo standalone falló: ${error?.code || error?.message}`) }
try {
  await runTransaction(db, async (tx) => {
    tx.update(groupRef, {
      memberIds: [uidA], memberNames: { [uidA]: 'Entrenadora' }, updatedAt: reviewedAt,
    })
    tx.update(requestBRef, { status: 'rejected', reviewedBy: uidA, reviewedAt, updatedAt: reviewedAt })
  })
  ok('El propietario puede dar de baja a B en transacción')
} catch (error) { bad(`Baja autorizada falló: ${error?.code || error?.message}`) }
expectStatus('B ya no puede leer el grupo', await restRead(b.idToken, `cfGroups/${groupId}`), 403)
expectStatus('B puede volver a solicitar con invitación válida', await restWrite(b.idToken, `cfGroups/${groupId}/requests/${uidB}`, {
  ...requestDoc(uidB, 'Atleta B', inviteB),
  status: 'pending',
  reviewedBy: uidA,
  reviewedAt,
  updatedAt: new Date().toISOString(),
}), 200)

console.log('\n' + '-'.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}`)
console.log(`APROBACIÓN ATÓMICA = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
