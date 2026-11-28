/**
 * ALTHEA — Prueba E2E de grupos privados de CrossFit contra el EMULADOR.
 *
 * No toca staging ni producción: exige E2E_EMULATOR=1 y un project id demo.
 * Usa el emulador de Auth (cuentas reales por email/password) y el de
 * Firestore con las MISMAS reglas de firestore.rules.
 *
 * Cubre: crear grupo, invitar, solicitar, aprobar, leer como miembro,
 * aislamiento de ajenos, roles, revocación, expiración, duplicados,
 * protección del propietario y pertenencia a varios grupos.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const isEmu = process.env.E2E_EMULATOR === '1'

function envOrFile(key, file) {
  if (process.env[key]?.trim()) return process.env[key].trim()
  const full = path.join(ROOT, file)
  if (fs.existsSync(full)) {
    const m = fs.readFileSync(full, 'utf8').match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const projectId = envOrFile('VITE_FIREBASE_PROJECT_ID', '.env.staging') || 'demo-althea'
const apiKey = envOrFile('VITE_FIREBASE_API_KEY', '.env.staging') || 'demo-api-key'
const productionId = envOrFile('FIREBASE_PRODUCTION_PROJECT_ID', '.env.production')

const passes = []
const failures = []
const ok = (m) => { passes.push(m); console.log(`  [PASS] ${m}`) }
const bad = (m) => { failures.push(m); console.log(`  [FAIL] ${m}`) }

console.log('=== GRUPOS CROSSFIT — E2E EMULADOR ===')
console.log(`project = ${projectId}`)

if (!isEmu) {
  console.error('\nABORT: esta prueba solo corre contra el emulador. Usá E2E_EMULATOR=1.')
  process.exit(1)
}
if (productionId && projectId === productionId) {
  console.error('\nABORT: el project id coincide con producción.')
  process.exit(1)
}
if (!projectId.startsWith('demo-')) {
  console.error('\nABORT: el project id del emulador debe empezar con "demo-".')
  process.exit(1)
}

const IDENTITY = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts'
const DB = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`

async function signup(email, password) {
  const res = await fetch(`${IDENTITY}:signUp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function fsValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } }
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fsValue(v)])) } }
  }
  throw new Error(`Valor Firestore no soportado: ${typeof value}`)
}

function fields(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fsValue(value)]))
}

async function createDoc(token, docPath, values) {
  return fetch(`${DB}/${docPath}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields: fields(values) }),
  })
}

async function updateDoc(token, docPath, values) {
  return fetch(`${DB}/${docPath}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields: fields(values) }),
  })
}

// Preparación de datos: el emulador acepta `Bearer owner` como administrador
// y omite las reglas SOLO aquí. Nunca se usa en las verificaciones: sirve para
// inyectar estados que un cliente no puede crear (p. ej. invitación vencida).
async function setupDoc(docPath, values) {
  return fetch(`${DB}/${docPath}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({ fields: fields(values) }),
  })
}

async function readDoc(token, docPath) {
  return fetch(`${DB}/${docPath}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function deleteDoc(token, docPath) {
  return fetch(`${DB}/${docPath}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function runQuery(token, parentPath, collectionId, whereClause) {
  const parent = parentPath ? `${DB}/${parentPath}` : DB
  const structuredQuery = { from: [{ collectionId }] }
  if (whereClause) {
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: whereClause.field },
        op: whereClause.op,
        value: fsValue(whereClause.value),
      },
    }
  }
  return fetch(`${parent}:runQuery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ structuredQuery }),
  })
}

async function queryDocs(res) {
  const data = await res.json().catch(() => [])
  if (!Array.isArray(data)) return []
  return data.filter((row) => row.document).map((row) => row.document)
}

function expectStatus(label, res, expected) {
  if (res.status === expected) { ok(`${label} (${res.status})`) }
  else { bad(`${label}: esperaba ${expected}, obtuve ${res.status}`) }
}

function expectOneOf(label, res, expected) {
  if (expected.includes(res.status)) { ok(`${label} (${res.status})`) }
  else { bad(`${label}: esperaba ${expected.join('/')}, obtuve ${res.status}`) }
}

const stamp = Date.now()
const password = `Alth3a-${stamp}-g`
const emailA = `althea-groups-a-${stamp}@example.com`
const emailB = `althea-groups-b-${stamp}@example.com`
const emailC = `althea-groups-c-${stamp}@example.com`
const emailD = `althea-groups-d-${stamp}@example.com`

console.log('\n[1] Crear cuatro cuentas de prueba')
const a = await signup(emailA, password)
const b = await signup(emailB, password)
const c = await signup(emailC, password)
const d = await signup(emailD, password)
if (!a.data.idToken || !b.data.idToken || !c.data.idToken || !d.data.idToken) {
  console.error('No se pudieron crear las cuentas del emulador.')
  console.error(JSON.stringify(a.data?.error || b.data?.error || c.data?.error || d.data?.error || {}, null, 2))
  process.exit(1)
}
const uidA = a.data.localId
const uidB = b.data.localId
const uidC = c.data.localId
const uidD = d.data.localId
const tokenA = a.data.idToken
const tokenB = b.data.idToken
const tokenC = c.data.idToken
const tokenD = d.data.idToken
console.log(`  A=${uidA.slice(0, 8)}… B=${uidB.slice(0, 8)}… C=${uidC.slice(0, 8)}… D=${uidD.slice(0, 8)}…`)

const now = new Date()
const iso = now.toISOString()
const inviteA = 'a'.repeat(64)
const inviteB = 'b'.repeat(64)
const inviteExpired = 'c'.repeat(64)
const inviteMissing = 'd'.repeat(64)
const groupA = 'grupo-a'
const groupB = 'grupo-b'

const groupADoc = {
  id: groupA,
  name: 'Grupo A',
  description: 'Turno mañana',
  schedule: 'Lunes y miércoles 19:00',
  ownerId: uidA,
  ownerName: 'Entrenadora A',
  memberIds: [uidA],
  memberNames: { [uidA]: 'Entrenadora A' },
  createdAt: iso,
  updatedAt: iso,
}

const groupBDoc = {
  id: groupB,
  name: 'Grupo B',
  description: '',
  schedule: '',
  ownerId: uidB,
  ownerName: 'Entrenador B',
  memberIds: [uidB],
  memberNames: { [uidB]: 'Entrenador B' },
  createdAt: iso,
  updatedAt: iso,
}

const inviteDoc = (token, groupId, groupName, createdBy, expiresAt) => ({
  groupId,
  groupName,
  createdBy,
  createdAt: iso,
  expiresAt,
  revoked: false,
})

const requestDoc = (uid, groupId, displayName, inviteToken) => ({
  uid,
  groupId,
  displayName,
  email: `${displayName.toLowerCase().replace(/\s+/g, '')}@example.com`,
  message: 'Quiero sumarme',
  status: 'pending',
  inviteToken,
  createdAt: iso,
  updatedAt: iso,
})

console.log('\n[2] A crea su grupo y B crea el suyo')
expectStatus('A crea cfGroups/grupo-a', await createDoc(tokenA, `cfGroups/${groupA}`, groupADoc), 200)
expectStatus('B crea cfGroups/grupo-b', await createDoc(tokenB, `cfGroups/${groupB}`, groupBDoc), 200)
expectStatus('A no puede leer el grupo privado de B', await readDoc(tokenA, `cfGroups/${groupB}`), 403)

console.log('\n[3] Invitaciones: solo el propietario las crea')
expectStatus(
  'A genera una invitación válida para grupo-a',
  await createDoc(tokenA, `cfInvites/${inviteA}`, inviteDoc(inviteA, groupA, 'Grupo A', uidA, new Date(now.getTime() + 7 * 86400000))),
  200,
)
expectStatus(
  'B no puede generar invitaciones para grupo-a',
  await createDoc(tokenB, `cfInvites/${'e'.repeat(64)}`, inviteDoc('e'.repeat(64), groupA, 'Grupo A', uidB, new Date(now.getTime() + 7 * 86400000))),
  403,
)
expectStatus('B no puede listar invitaciones ajenas', await runQuery(tokenB, '', 'cfInvites', { field: 'createdBy', op: 'EQUAL', value: uidA }), 403)
expectStatus('A puede listar sus invitaciones', await runQuery(tokenA, '', 'cfInvites', { field: 'createdBy', op: 'EQUAL', value: uidA }), 200)
expectStatus(
  'El token debe tener 64 hexadecimales en minúsculas',
  await createDoc(tokenA, `cfInvites/${'A'.repeat(64)}`, inviteDoc('A'.repeat(64), groupA, 'Grupo A', uidA, new Date(now.getTime() + 7 * 86400000))),
  403,
)
expectStatus(
  'El vencimiento no puede superar los 30 días',
  await createDoc(tokenA, `cfInvites/${'9'.repeat(64)}`, inviteDoc('9'.repeat(64), groupA, 'Grupo A', uidA, new Date(now.getTime() + 31 * 86400000))),
  403,
)
expectStatus(
  'El vencimiento no puede estar en el pasado',
  await createDoc(tokenA, `cfInvites/${inviteExpired}`, inviteDoc(inviteExpired, groupA, 'Grupo A', uidA, new Date(now.getTime() - 86400000))),
  403,
)

console.log('\n[4] Solicitud de ingreso de B')
expectStatus('B no puede leer grupo-a antes de ser miembro', await readDoc(tokenB, `cfGroups/${groupA}`), 403)
expectStatus('B no puede listar grupos sin filtro de pertenencia', await runQuery(tokenB, '', 'cfGroups'), 403)
expectStatus(
  'B solicita ingreso con la invitación válida',
  await createDoc(tokenB, `cfGroups/${groupA}/requests/${uidB}`, requestDoc(uidB, groupA, 'Atleta B', inviteA)),
  200,
)
expectOneOf(
  'No se permite una solicitud duplicada',
  await createDoc(tokenB, `cfGroups/${groupA}/requests/${uidB}`, requestDoc(uidB, groupA, 'Atleta B', inviteA)),
  [403, 409],
)
expectStatus('B lee su propia solicitud', await readDoc(tokenB, `cfGroups/${groupA}/requests/${uidB}`), 200)
expectStatus('C no puede leer la solicitud de B', await readDoc(tokenC, `cfGroups/${groupA}/requests/${uidB}`), 403)
expectStatus('B no puede listar las solicitudes del grupo', await runQuery(tokenB, `cfGroups/${groupA}`, 'requests'), 403)
expectStatus('A sí lista las solicitudes de su grupo', await runQuery(tokenA, `cfGroups/${groupA}`, 'requests'), 200)

console.log('\n[5] Aislamiento de un usuario ajeno')
expectStatus('C no puede leer grupo-a', await readDoc(tokenC, `cfGroups/${groupA}`), 403)
expectStatus('C no puede modificar grupo-a', await updateDoc(tokenC, `cfGroups/${groupA}`, { ...groupADoc, name: 'Secuestrado' }), 403)
expectStatus('C no puede generar invitaciones para grupo-a', await createDoc(tokenC, `cfInvites/${'f'.repeat(64)}`, inviteDoc('f'.repeat(64), groupA, 'Grupo A', uidC, new Date(now.getTime() + 86400000))), 403)
expectStatus('C no puede listar grupos ajenos', await runQuery(tokenC, '', 'cfGroups', { field: 'memberIds', op: 'ARRAY_CONTAINS', value: uidC }), 200)

console.log('\n[6] A aprueba la solicitud de B')
const approvedAt = new Date().toISOString()
expectStatus(
  'A actualiza la solicitud a aprobada',
  await updateDoc(tokenA, `cfGroups/${groupA}/requests/${uidB}`, {
    ...requestDoc(uidB, groupA, 'Atleta B', inviteA),
    status: 'approved',
    reviewedBy: uidA,
    reviewedAt: approvedAt,
    updatedAt: approvedAt,
  }),
  200,
)
expectStatus(
  'A agrega a B al grupo',
  await updateDoc(tokenA, `cfGroups/${groupA}`, {
    ...groupADoc,
    memberIds: [uidA, uidB],
    memberNames: { [uidA]: 'Entrenadora A', [uidB]: 'Atleta B' },
    updatedAt: approvedAt,
  }),
  200,
)
expectStatus('B ahora puede leer grupo-a', await readDoc(tokenB, `cfGroups/${groupA}`), 200)
{
  const res = await runQuery(tokenB, '', 'cfGroups', { field: 'memberIds', op: 'ARRAY_CONTAINS', value: uidB })
  const docs = await queryDocs(res)
  if (res.status === 200 && docs.length === 2) ok('B lista sus dos grupos (grupo-a y grupo-b)')
  else bad(`B debía listar 2 grupos; status=${res.status}, docs=${docs.length}`)
}
{
  const res = await runQuery(tokenC, '', 'cfGroups', { field: 'memberIds', op: 'ARRAY_CONTAINS', value: uidC })
  const docs = await queryDocs(res)
  if (res.status === 200 && docs.length === 0) ok('C no ve grupos ajenos en su consulta')
  else bad(`C no debía ver grupos; status=${res.status}, docs=${docs.length}`)
}

console.log('\n[7] Un miembro no administra')
expectStatus('B no puede cambiar el nombre del grupo', await updateDoc(tokenB, `cfGroups/${groupA}`, { ...groupADoc, memberIds: [uidA, uidB], name: 'Nombre de B' }), 403)
expectStatus('B no puede aprobar solicitudes', await updateDoc(tokenB, `cfGroups/${groupA}/requests/${uidB}`, { ...requestDoc(uidB, groupA, 'Atleta B', inviteA), status: 'approved', reviewedBy: uidB, reviewedAt: approvedAt, updatedAt: approvedAt }), 403)
expectStatus('B no puede crear invitaciones', await createDoc(tokenB, `cfInvites/${'1'.repeat(64)}`, inviteDoc('1'.repeat(64), groupA, 'Grupo A', uidB, new Date(now.getTime() + 86400000))), 403)
expectStatus('B no puede quitar integrantes', await updateDoc(tokenB, `cfGroups/${groupA}`, { ...groupADoc, memberIds: [uidA], memberNames: { [uidA]: 'Entrenadora A' } }), 403)

console.log('\n[7b] Edición del grupo: solo el propietario y con validación')
const groupAAfterB = {
  ...groupADoc,
  memberIds: [uidA, uidB],
  memberNames: { [uidA]: 'Entrenadora A', [uidB]: 'Atleta B' },
  updatedAt: approvedAt,
}
expectStatus(
  'A edita nombre, descripción y horario',
  await updateDoc(tokenA, `cfGroups/${groupA}`, {
    ...groupAAfterB,
    name: 'Grupo A editado',
    description: 'Descripción nueva',
    schedule: 'Martes 20:00',
  }),
  200,
)
{
  const res = await readDoc(tokenA, `cfGroups/${groupA}`)
  if (res.status === 200) {
    const data = (await res.json()).fields
    if (data.name?.stringValue === 'Grupo A editado' && data.schedule?.stringValue === 'Martes 20:00') {
      ok('La edición se refleja al leer el grupo')
    } else { bad('La edición no se refleja al leer el grupo') }
  } else { bad(`No se pudo verificar la edición: ${res.status}`) }
}
expectStatus(
  'B (atleta) no puede editar el grupo',
  await updateDoc(tokenB, `cfGroups/${groupA}`, { ...groupAAfterB, name: 'Nombre de B' }),
  403,
)
expectStatus(
  'El nombre no puede quedar vacío',
  await updateDoc(tokenA, `cfGroups/${groupA}`, { ...groupAAfterB, name: '' }),
  403,
)
expectStatus(
  'El nombre no puede superar 60 caracteres',
  await updateDoc(tokenA, `cfGroups/${groupA}`, { ...groupAAfterB, name: 'x'.repeat(61) }),
  403,
)

console.log('\n[8] Invitaciones revocadas e inválidas')
expectStatus('A revoca la invitación', await updateDoc(tokenA, `cfInvites/${inviteA}`, { ...inviteDoc(inviteA, groupA, 'Grupo A', uidA, new Date(now.getTime() + 7 * 86400000)), revoked: true, revokedAt: iso }), 200)
expectStatus('B no puede revocar una invitación ajena', await updateDoc(tokenB, `cfInvites/${inviteA}`, { ...inviteDoc(inviteA, groupA, 'Grupo A', uidA, new Date(now.getTime() + 7 * 86400000)), revoked: false }), 403)
expectStatus(
  'C no puede solicitar con una invitación revocada',
  await createDoc(tokenC, `cfGroups/${groupA}/requests/${uidC}`, requestDoc(uidC, groupA, 'Atleta C', inviteA)),
  403,
)
expectStatus(
  'C no puede solicitar con un token inexistente',
  await createDoc(tokenC, `cfGroups/${groupA}/requests/${uidC}`, requestDoc(uidC, groupA, 'Atleta C', inviteMissing)),
  403,
)
expectStatus(
  'Setup del emulador inyecta una invitación vencida (sin relajar reglas)',
  await setupDoc(`cfInvites/${inviteExpired}`, inviteDoc(inviteExpired, groupA, 'Grupo A', uidA, new Date(now.getTime() - 86400000))),
  200,
)
expectStatus(
  'C no puede solicitar con una invitación vencida',
  await createDoc(tokenC, `cfGroups/${groupA}/requests/${uidC}`, requestDoc(uidC, groupA, 'Atleta C', inviteExpired)),
  403,
)

console.log('\n[9] El propietario no puede quedar sin administración')
expectStatus(
  'A no puede eliminarse a sí mismo del grupo',
  await updateDoc(tokenA, `cfGroups/${groupA}`, { ...groupADoc, memberIds: [uidB], memberNames: { [uidB]: 'Atleta B' }, updatedAt: approvedAt }),
  403,
)
expectStatus('A no puede borrar el grupo', await deleteDoc(tokenA, `cfGroups/${groupA}`), 403)
expectStatus('A no puede borrar solicitudes', await deleteDoc(tokenA, `cfGroups/${groupA}/requests/${uidB}`), 403)
expectStatus('A no puede borrar invitaciones', await deleteDoc(tokenA, `cfInvites/${inviteA}`), 403)

console.log('\n[10] C solicita con una invitación nueva y A la aprueba')
expectStatus(
  'A genera una segunda invitación válida',
  await createDoc(tokenA, `cfInvites/${inviteB}`, inviteDoc(inviteB, groupA, 'Grupo A', uidA, new Date(now.getTime() + 7 * 86400000))),
  200,
)
expectStatus(
  'C solicita ingreso con la invitación nueva',
  await createDoc(tokenC, `cfGroups/${groupA}/requests/${uidC}`, requestDoc(uidC, groupA, 'Atleta C', inviteB)),
  200,
)
expectStatus(
  'B (miembro) no puede aprobar la solicitud de C',
  await updateDoc(tokenB, `cfGroups/${groupA}/requests/${uidC}`, { ...requestDoc(uidC, groupA, 'Atleta C', inviteB), status: 'approved', reviewedBy: uidB, reviewedAt: approvedAt, updatedAt: approvedAt }),
  403,
)
expectStatus(
  'A aprueba la solicitud de C',
  await updateDoc(tokenA, `cfGroups/${groupA}/requests/${uidC}`, { ...requestDoc(uidC, groupA, 'Atleta C', inviteB), status: 'approved', reviewedBy: uidA, reviewedAt: approvedAt, updatedAt: approvedAt }),
  200,
)
expectStatus(
  'A agrega a C al grupo',
  await updateDoc(tokenA, `cfGroups/${groupA}`, {
    ...groupADoc,
    memberIds: [uidA, uidB, uidC],
    memberNames: { [uidA]: 'Entrenadora A', [uidB]: 'Atleta B', [uidC]: 'Atleta C' },
    updatedAt: approvedAt,
  }),
  200,
)
expectStatus('C ahora puede leer grupo-a', await readDoc(tokenC, `cfGroups/${groupA}`), 200)

console.log('\n[11] Varios grupos y roles distintos por cuenta')
{
  const res = await runQuery(tokenB, '', 'cfGroups', { field: 'memberIds', op: 'ARRAY_CONTAINS', value: uidB })
  const docs = await queryDocs(res)
  const ids = docs.map((d) => d.name.split('/').pop())
  if (res.status === 200 && ids.includes(groupA) && ids.includes(groupB)) {
    ok('B es miembro de grupo-a y propietario de grupo-b a la vez')
  } else {
    bad(`B debía ver grupo-a y grupo-b; status=${res.status}, ids=${ids.join(',')}`)
  }
}

console.log('\n[12] Quitar integrantes')
expectStatus(
  'A quita a B del grupo',
  await updateDoc(tokenA, `cfGroups/${groupA}`, {
    ...groupADoc,
    memberIds: [uidA, uidC],
    memberNames: { [uidA]: 'Entrenadora A', [uidC]: 'Atleta C' },
    updatedAt: approvedAt,
  }),
  200,
)
expectStatus('B ya no puede leer grupo-a', await readDoc(tokenB, `cfGroups/${groupA}`), 403)
{
  const res = await runQuery(tokenB, '', 'cfGroups', { field: 'memberIds', op: 'ARRAY_CONTAINS', value: uidB })
  const docs = await queryDocs(res)
  if (res.status === 200 && docs.length === 1) ok('B solo conserva su propio grupo-b')
  else bad(`B debía conservar 1 grupo; status=${res.status}, docs=${docs.length}`)
}
expectStatus('B (ex miembro) no puede administrar grupo-a', await updateDoc(tokenB, `cfGroups/${groupA}`, { ...groupADoc, name: 'Otra vez B' }), 403)
expectStatus(
  'A marca como rechazada la solicitud del integrante quitado',
  await updateDoc(tokenA, `cfGroups/${groupA}/requests/${uidB}`, {
    ...requestDoc(uidB, groupA, 'Atleta B', inviteA),
    status: 'rejected',
    reviewedBy: uidA,
    reviewedAt: approvedAt,
    updatedAt: approvedAt,
  }),
  200,
)
expectStatus(
  'B puede volver a solicitar con una invitación válida',
  await updateDoc(tokenB, `cfGroups/${groupA}/requests/${uidB}`, {
    ...requestDoc(uidB, groupA, 'Atleta B', inviteB),
    status: 'pending',
    reviewedBy: uidA,
    reviewedAt: approvedAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  200,
)

console.log('\n[12b] Toda incorporación necesita una solicitud aprobada')
const inviteD = '7'.repeat(64)
const groupAAfterC = {
  ...groupADoc,
  memberIds: [uidA, uidC],
  memberNames: { [uidA]: 'Entrenadora A', [uidC]: 'Atleta C' },
  updatedAt: approvedAt,
}
expectStatus('A no puede agregar a D sin solicitud', await updateDoc(tokenA, `cfGroups/${groupA}`, {
  ...groupAAfterC,
  memberIds: [uidA, uidC, uidD],
  memberNames: { ...groupAAfterC.memberNames, [uidD]: 'Atleta D' },
}), 403)
expectStatus('D no puede leer grupo-a antes de la aprobación', await readDoc(tokenD, `cfGroups/${groupA}`), 403)
expectStatus('A genera una invitación para D', await createDoc(tokenA, `cfInvites/${inviteD}`, inviteDoc(inviteD, groupA, 'Grupo A', uidA, new Date(now.getTime() + 7 * 86400000))), 200)
expectStatus('D solicita ingreso', await createDoc(tokenD, `cfGroups/${groupA}/requests/${uidD}`, requestDoc(uidD, groupA, 'Atleta D', inviteD)), 200)
expectStatus('A no puede agregar a D con la solicitud pendiente', await updateDoc(tokenA, `cfGroups/${groupA}`, {
  ...groupAAfterC,
  memberIds: [uidA, uidC, uidD],
  memberNames: { ...groupAAfterC.memberNames, [uidD]: 'Atleta D' },
}), 403)
expectStatus('A aprueba la solicitud de D', await updateDoc(tokenA, `cfGroups/${groupA}/requests/${uidD}`, {
  ...requestDoc(uidD, groupA, 'Atleta D', inviteD),
  status: 'approved',
  reviewedBy: uidA,
  reviewedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}), 200)
expectStatus('A agrega a D con la solicitud aprobada', await updateDoc(tokenA, `cfGroups/${groupA}`, {
  ...groupAAfterC,
  memberIds: [uidA, uidC, uidD],
  memberNames: { ...groupAAfterC.memberNames, [uidD]: 'Atleta D' },
}), 200)
expectStatus('D ya puede leer grupo-a', await readDoc(tokenD, `cfGroups/${groupA}`), 200)
expectStatus('A quita a D (baja autorizada sin solicitud nueva)', await updateDoc(tokenA, `cfGroups/${groupA}`, groupAAfterC), 200)
expectStatus('D ya no puede leer grupo-a', await readDoc(tokenD, `cfGroups/${groupA}`), 403)

console.log('\n[13] Anónimo y borrados')
expectOneOf('Anónimo no lee grupo-a', await readDoc(null, `cfGroups/${groupA}`), [401, 403])
expectOneOf('Anónimo no lee invitaciones', await readDoc(null, `cfInvites/${inviteB}`), [401, 403])
expectOneOf('Anónimo no lista grupos', await runQuery(null, '', 'cfGroups'), [401, 403])

console.log('\n' + '-'.repeat(62))
console.log(`PASS=${passes.length}  FAIL=${failures.length}`)
console.log(`GRUPOS CROSSFIT E2E = ${failures.length === 0 ? 'PASS' : 'FAIL'}`)
process.exit(failures.length === 0 ? 0 : 1)
