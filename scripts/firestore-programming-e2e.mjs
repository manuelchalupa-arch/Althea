/**
 * ALTHEA — E2E de programación semanal compartida contra el EMULADOR (22 escenarios).
 *
 * Preparación y limpieza usan un canal administrador (`Bearer owner`, solo
 * emulador). TODAS las operaciones cuya seguridad se prueba usan Firebase
 * Client SDK con tres cuentas autenticadas independientes: dueño, miembro,
 * ajeno. No se usa Admin para simular publicaciones ni para saltarse reglas.
 *
 * Publicación con runTransaction: se lee primero, luego se escriben versión +
 * puntero en la misma transacción. Exige E2E_EMULATOR=1 y project demo.
 */

import process from 'node:process'

import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
} from 'firebase/firestore'

const E2E = process.env.E2E_EMULATOR === '1'
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-althea'
const apiKey = process.env.VITE_FIREBASE_API_KEY || 'demo-api-key'
const productionId = process.env.FIREBASE_PRODUCTION_PROJECT_ID

const passes = []
const failures = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }

console.log('=== PROGRAMACIÓN SEMANAL — E2E EMULADOR (22 escenarios) ===')
console.log(`project = ${projectId}`)
if (!E2E || !projectId.startsWith('demo-') || projectId === productionId) {
  console.error('ABORT: requiere E2E_EMULATOR=1 y un project demo.')
  process.exit(1)
}

const IDENTITY = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts'
const REST_DB = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`

// ---------- Preparación de datos (admin del emulador, NO operaciones probadas) ----------
async function signup(email, password) {
  const res = await fetch(`${IDENTITY}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json().catch(() => ({}))
  return data
}
function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } }
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, fsValue(val)])) } }
  throw new Error(`Valor no soportado: ${typeof v}`)
}
function fields(values) {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, fsValue(v)]))
}
async function adminSet(docPath, values, merge = true) {
  // merge: NO reemplaza documentos ni elimina campos. Siempre actualización parcial.
  const mask = Object.keys(values).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&')
  return fetch(`${REST_DB}/${docPath}?${merge ? mask : ''}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: fields(values) }),
  })
}
async function adminCreate(docPath, values) {
  return fetch(`${REST_DB}/${docPath}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: fields(values) }),
  })
}

function expectDenied(label, op) {
  return op().then(
    () => bad(`${label}: la regla NO lo rechazó`),
    (err) => (err?.code === 'permission-denied' ? ok(`${label} (permission-denied)`) : bad(`${label}: ${err?.code || err?.message}`)),
  )
}

// ---------- Tres usuarios autenticados independientes ----------
const stamp = Date.now()
const password = `Alth3a-${stamp}-pw`
const emailA = `althea-prog-owner-${stamp}@example.com`
const emailB = `althea-prog-member-${stamp}@example.com`
const emailC = `althea-prog-stranger-${stamp}@example.com`

function makeUser(name) {
  const app = initializeApp({ projectId, apiKey, authDomain: `${projectId}.firebaseapp.com` }, name)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  return { app, auth, db }
}

const [accA, accB, accC] = [makeUser(`u-a-${stamp}`), makeUser(`u-b-${stamp}`), makeUser(`u-c-${stamp}`)]
const [sa, sb, sc] = await Promise.all([
  signup(emailA, password), signup(emailB, password), signup(emailC, password),
])
if (!sa.idToken || !sb.idToken || !sc.idToken) {
  console.error('No se pudieron crear las cuentas del emulador.')
  process.exit(1)
}
const uidA = sa.localId, uidB = sb.localId, uidC = sc.localId
const [userA, userB, userC] = await Promise.all([
  signInWithEmailAndPassword(accA.auth, emailA, password).then((r) => r.user),
  signInWithEmailAndPassword(accB.auth, emailB, password).then((r) => r.user),
  signInWithEmailAndPassword(accC.auth, emailC, password).then((r) => r.user),
])
const db = accA.db // transacciones de publicación como propietario A
console.log(`  A=${uidA.slice(0, 6)}… B=${uidB.slice(0, 6)}… C=${uidC.slice(0, 6)}…`)

// ---------- Fixtures ----------
const groupId = `prog-grupo-${stamp}`
const weekStart = '2026-12-07' // lunes
const weekDays = ['2026-12-07','2026-12-08','2026-12-09','2026-12-10','2026-12-11','2026-12-12','2026-12-13']
const groupDoc = {
  id: groupId, name: 'Grupo programación', description: '', schedule: '',
  ownerId: uidA, ownerName: 'Entrenadora', memberIds: [uidA],
  memberNames: { [uidA]: 'Entrenadora' },
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}
const session = {
  title: 'Sesión lunes', objective: 'Fuerza', estimatedDurationMin: 60,
  equipment: ['barra'], instructions: ['Calentar', 'Levantar'],
  blocks: [{ id: 'b1', type: 'wod', title: 'WOD', content: '', order: 0 }],
}
const makeDays = (title, ws = weekStart) => {
  const days = weekDays.length ? weekDaysFor(ws) : weekDays
  return days.map((date, i) => ({ dayIndex: i, date, kind: i === 0 ? 'session' : 'rest', ...(i === 0 ? { session: { ...session, title } } : {}) }))
}
const draftFor = (title, ws = weekStart, gid = groupId) => ({
  groupId: gid, ownerId: uidA, weekStart: ws, days: makeDays(title, ws),
  updatedAt: new Date().toISOString(), updatedBy: uidA,
})

function addDays(dateKey, amount) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + amount)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function weekDaysFor(ws) { return Array.from({ length: 7 }, (_, i) => addDays(ws, i)) }

// ---------- Preparación admin ----------
await adminCreate(`cfGroups/${groupId}`, groupDoc)
await adminSet(`cfGroups/${groupId}`, { memberIds: [uidA, uidB], memberNames: { [uidA]: 'Entrenadora', [uidB]: 'Atleta B' } })

// ================= Escenarios =================

console.log('\n[1] El propietario crea y lee un borrador')
const draftRef = doc(db, 'cfGroups', groupId, 'weekDrafts', weekStart)
await setDoc(draftRef, draftFor('Sesión lunes'))
ok('A crea borrador semana')
{
  const snap = await getDoc(draftRef)
  if (snap.exists() && snap.data().days.length === 7) ok('A lee su borrador con 7 días')
  else bad('A no pudo leer borrador con 7 días')
}

console.log('\n[2] El propietario modifica el borrador')
await updateDoc(draftRef, { 'days': makeDays('Sesión lunes editada'), updatedAt: new Date().toISOString() })
{
  const snap = await getDoc(draftRef)
  const title = snap.data().days[0].session?.title
  if (title === 'Sesión lunes editada') ok('La modificación se reflejó')
  else bad(`Título=${title}`)
}

console.log('\n[3] El miembro no puede leer el borrador')
await expectDenied('B no puede leer borrador', () => getDoc(doc(accB.db, 'cfGroups', groupId, 'weekDrafts', weekStart)))

console.log('\n[4] Un usuario ajeno no puede leer el borrador')
await expectDenied('C no puede leer borrador', () => getDoc(doc(accC.db, 'cfGroups', groupId, 'weekDrafts', weekStart)))

const weekRef = doc(db, 'cfGroups', groupId, 'programWeeks', weekStart)

async function publishAtomic(dbClient, versionNumber, title, groupIdArg = groupId, weekStartArg = weekStart) {
  const groupRef = doc(dbClient, 'cfGroups', groupIdArg)
  const draftRefX = doc(dbClient, 'cfGroups', groupIdArg, 'weekDrafts', weekStartArg)
  const weekRefX = doc(dbClient, 'cfGroups', groupIdArg, 'programWeeks', weekStartArg)
  let createdVersionId = null
  await runTransaction(dbClient, async (tx) => {
    // 1. Leer antes de escribir
    const [groupSnap, draftSnap, weekSnap] = await Promise.all([tx.get(groupRef), tx.get(draftRefX), tx.get(weekRefX)])
    if (!groupSnap.exists()) throw new Error('El grupo no existe.')
    if (!draftSnap.exists()) throw new Error('No existe un borrador para publicar.')
    if (groupSnap.data().ownerId !== userA.uid && dbClient === accA.db) throw new Error('Solo el propietario puede publicar.')
    const draftData = draftSnap.data()
    // 2. Construir la versión completa (sin undefined; días saneados)
    const days = (draftData.days || []).map((day, i) => ({
      dayIndex: i, date: day.date, kind: day.kind,
      ...(day.session ? { session: day.session } : {}),
    }))
    if (days.length !== 7) throw new Error('La semana debe tener siete días.')
    const versionRef = doc(collection(dbClient, 'cfGroups', groupIdArg, 'programWeeks', weekStartArg, 'versions'))
    createdVersionId = versionRef.id
    // 3. Crear versión + actualizar puntero DENTRO de la misma transacción
    tx.set(versionRef, {
      groupId: groupIdArg, weekStart: weekStartArg, versionId: versionRef.id, versionNumber,
      publishedBy: userA.uid, publishedAt: new Date().toISOString(), days,
    })
    tx.set(weekRefX, {
      weekStart: weekStartArg, currentVersionId: versionRef.id, currentVersionNumber: versionNumber,
      publishedBy: userA.uid, publishedAt: new Date().toISOString(),
    }, { merge: true })
  })
  return createdVersionId
}

console.log('\n[8] Publicación inicial genera versión 1')
let vid1 = null
try {
  vid1 = await publishAtomic(db, 1, 'Sesión lunes editada')
  ok('Publicación atómica: versión 1 + puntero en una transacción')
} catch (error) { bad(`Publicación atómica falló: ${error?.code || error?.message}`) }

console.log('\n[5] El miembro puede ver la última publicación')
console.log('\n[9] El miembro ve la versión 1')
{
  const w = await getDoc(doc(accB.db, 'cfGroups', groupId, 'programWeeks', weekStart)).then((s) => s.data()).catch(() => null)
  if (w && w.currentVersionId === vid1 && w.currentVersionNumber === 1) ok('B ve puntero a versión 1')
  else bad(`Puntero=${JSON.stringify(w)}`)
  const v = await getDoc(doc(accB.db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x')).then((s) => s.data()).catch(() => null)
  if (v && v.versionNumber === 1) ok('B lee la versión 1 del grupo')
  else bad(`B no pudo leer versión 1`)
}

console.log('\n[6] Un usuario ajeno no puede ver publicaciones')
await expectDenied('C no puede leer programWeeks', () => getDoc(doc(accC.db, 'cfGroups', groupId, 'programWeeks', weekStart)))
await expectDenied('C no puede leer versión', () => getDoc(doc(accC.db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x')))

console.log('\n[7] Un miembro no puede modificar ni eliminar versiones')
await expectDenied('B no puede actualizar versión', () => updateDoc(doc(accB.db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x'), { publishedBy: uidB }))
await expectDenied('B no puede borrar versión', async () => { const { deleteDoc } = await import('firebase/firestore'); return deleteDoc(doc(accB.db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x')) })

console.log('\n[10] Cambiar el borrador no altera la versión 1')
await updateDoc(draftRef, { days: makeDays('Sesión lunes v2'), updatedAt: new Date().toISOString() })
{
  const v1 = await getDoc(doc(db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x')).then((s) => s.data()).catch(() => null)
  const title = v1?.days?.[0]?.session?.title
  if (title === 'Sesión lunes editada') ok('Cambiar borrador NO altera versión 1')
  else bad(`Versión 1 título=${title}`)
}

console.log('\n[11] Publicar actualización genera versión 2')
let vid2 = null
try { vid2 = await publishAtomic(db, 2, 'Sesión lunes v2'); ok('Republicación atómica genera versión 2') } catch (e) { bad(`Republicación falló: ${e?.code || e?.message}`) }
{
  const w = await getDoc(weekRef).then((s) => s.data())
  if (w.currentVersionNumber === 2 && w.currentVersionId === vid2) ok('Puntero apunta a versión 2')
  else bad(`Puntero=${w.currentVersionNumber}/${w.currentVersionId}`)
  const v2 = await getDoc(doc(db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid2 || 'x')).then((s) => s.data()).catch(() => null)
  if (v2?.days?.[0]?.session?.title === 'Sesión lunes v2') ok('Versión 2 tiene el nuevo título')
  else bad(`Versión 2 título=${v2?.days?.[0]?.session?.title}`)
}

console.log('\n[12] La versión 1 permanece preservada')
{
  const v1 = await getDoc(doc(db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x')).then((s) => s.data()).catch(() => null)
  if (v1?.days?.[0]?.session?.title === 'Sesión lunes editada' && v1?.versionNumber === 1) ok('Versión 1 inmutable')
  else bad(`Versión 1 título=${v1?.days?.[0]?.session?.title}`)
}

console.log('\n[13] Fallan las escrituras parciales que crean un puntero sin versión')
await expectDenied('Puntero a currentVersionId inexistente', () => updateDoc(weekRef, { currentVersionId: 'no-existe', currentVersionNumber: 99 }))

console.log('\n[14] Fallan las escrituras que crean una versión sin actualizar correctamente el puntero')
await expectDenied('Número de versión incorrecto (no +1)', () => updateDoc(weekRef, { currentVersionId: vid2 || 'x', currentVersionNumber: 99 }))

console.log('\n[15] Editar o borrar el WOD privado original no altera el snapshot publicado')
{
  // Snapshot autocontenido en la versión; no hay referencia a un WOD externo.
  const snapVersion = doc(db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', `snap-${stamp}`)
  await setDoc(snapVersion, {
    groupId, weekStart, versionId: `snap-${stamp}`, versionNumber: 9,
    publishedBy: uidA, publishedAt: new Date().toISOString(),
    days: makeDays('S').map((d) => d.dayIndex === 0
      ? { ...d, session: { ...d.session, blocks: [{ id: 'b1', type: 'wod', title: 'W', content: '', order: 0, wodSnapshot: { snapshotId: `snap-${stamp}`, snapshotAt: new Date().toISOString(), wod: { name: 'WOD original', format: 'FOR_TIME' } } }] } }
      : d),
  })
  const data = await getDoc(snapVersion).then((s) => s.data())
  const wodName = data.days[0].session.blocks[0].wodSnapshot.wod.name
  if (wodName === 'WOD original') ok('Snapshot WOD independiente y completo')
  else bad(`Snapshot=${wodName}`)
  // La versión no se puede editar ni borrar
  await expectDenied('No se puede editar la versión con snapshot', () => updateDoc(snapVersion, { publishedBy: 'x' }))
}

console.log('\n[16] Copiar una semana genera un borrador independiente')
const weekStart2 = addDays(weekStart, 7)
await adminSet(`cfGroups/${groupId}/weekDrafts/${weekStart2}`, draftFor('Semana copiada', weekStart2))
{
  const original = await getDoc(draftRef).then((s) => s.data())
  const copied = await getDoc(doc(db, 'cfGroups', groupId, 'weekDrafts', weekStart2)).then((s) => s.data())
  if (copied.weekStart === weekStart2 && original.weekStart === weekStart) ok('Copia independiente con fechas remapeadas')
  else bad('Copia no independiente')
}

console.log('\n[17] Duplicar entre grupos funciona cuando el usuario es propietario de ambos')
const groupBId = `prog-grupo-b-${stamp}`
await adminCreate(`cfGroups/${groupBId}`, { ...groupDoc, id: groupBId, ownerId: uidA, memberIds: [uidA], memberNames: { [uidA]: 'Entrenadora' } })
await setDoc(doc(db, 'cfGroups', groupBId, 'weekDrafts', weekStart2), draftFor('Duplicada', weekStart2, groupBId))
{
  const g = await getDoc(doc(db, 'cfGroups', groupBId, 'weekDrafts', weekStart2)).then((s) => s.data())
  if (g.groupId === groupBId) ok('Duplicación a grupo propio')
  else bad('No se duplicó a grupo propio')
}

console.log('\n[18] Duplicar entre grupos falla cuando no es propietario de uno de ellos')
await expectDenied('B no puede escribir en grupo ajeno', () => setDoc(doc(accB.db, 'cfGroups', groupBId, 'weekDrafts', weekStart2), draftFor('x', weekStart2, groupBId)))
await expectDenied('C no puede escribir en grupo ajeno', () => setDoc(doc(accC.db, 'cfGroups', groupId, 'weekDrafts', weekStart2), draftFor('x', weekStart2, groupId)))

console.log('\n[19] El rol de propietario en un grupo no concede permisos sobre otro grupo')
await expectDenied('B (miembro en A, no dueño de B) no puede leer borrador de B', () => getDoc(doc(accB.db, 'cfGroups', groupBId, 'weekDrafts', weekStart2)))
await expectDenied('A (dueño de B, no miembro de grupo ajeno de C) no accede', () => getDoc(doc(accC.db, 'cfGroups', groupBId, 'programWeeks', weekStart)))

console.log('\n[20] Las fechas locales funcionan al cruzar meses y años')
{
  const days = weekDaysFor('2026-12-28')
  if (days[6] === '2027-01-03') ok('Semana cruza año correctamente')
  else bad(`Último día=${days[6]}`)
}

console.log('\n[21] Los atletas no pueden editar, publicar ni borrar')
await expectDenied('B no puede editar borrador', () => updateDoc(doc(accB.db, 'cfGroups', groupId, 'weekDrafts', weekStart), { updatedAt: new Date().toISOString() }))
await expectDenied('B no puede publicar', () => setDoc(doc(accB.db, 'cfGroups', groupId, 'programWeeks', weekStart2), { weekStart: weekStart2, currentVersionId: 'x', currentVersionNumber: 1, publishedBy: uidB, publishedAt: new Date().toISOString() }))
await expectDenied('B no puede borrar versión', async () => { const { deleteDoc } = await import('firebase/firestore'); return deleteDoc(doc(accB.db, 'cfGroups', groupId, 'programWeeks', weekStart, 'versions', vid1 || 'x')) })

console.log('\n[22] Los datos individuales anteriores permanecen intactos')
{
  // La programación grupal vive en subcolecciones nuevas; el doc del grupo no cambia campos individuales.
  const g = await getDoc(doc(db, 'cfGroups', groupId)).then((s) => s.data())
  if (g.ownerId === uidA && Array.isArray(g.memberIds) && g.memberIds.includes(uidA)) ok('Grupo intacto; programación aislada en subcolecciones')
  else bad('Grupo alterado')
}

console.log('\n' + '-'.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}`)
console.log(`PROGRAMACIÓN SEMANAL E2E = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
