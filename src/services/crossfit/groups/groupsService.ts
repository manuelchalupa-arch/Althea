import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { currentUser } from '@/services/firebase/auth'
import { firebaseDb, isFirebaseConfigured } from '@/services/firebase/config'
import { generateInviteToken, inviteExpiry, isValidInviteToken } from './invite'
import { validateGroupEdit } from './groupAccess'
import type { CfGroup, CfGroupInvite, CfJoinRequest } from './types'

/**
 * Servicio independiente de grupos privados.
 *
 * No reutiliza el sincronizador `users/{uid}` ni escribe en Dexie: la
 * pertenencia y las solicitudes son datos compartidos y la fuente de verdad
 * son las reglas de Firestore.
 */

const GROUPS = 'cfGroups'
const INVITES = 'cfInvites'
const REQUESTS = 'requests'

function firestore() {
  if (!isFirebaseConfigured()) {
    throw new Error('Los grupos necesitan una cuenta de Althea con conexión.')
  }
  return firebaseDb()
}

function requireUser(): User {
  const user = currentUser()
  if (!user) { throw new Error('Iniciá sesión para usar los grupos.') }
  return user
}

export function groupsAvailable(): boolean {
  return isFirebaseConfigured() && !!currentUser()
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'permission-denied'
}

function displayNameOf(user: User): string {
  const raw = user.displayName?.trim() || user.email?.split('@')[0]?.trim() || 'Atleta'
  return raw.slice(0, 80)
}

function isoOf(value: unknown): string {
  if (value instanceof Timestamp) { return value.toDate().toISOString() }
  return typeof value === 'string' ? value : ''
}

function groupFromDoc(id: string, data: Record<string, unknown>): CfGroup {
  const memberIds = Array.isArray(data.memberIds)
    ? data.memberIds.filter((value): value is string => typeof value === 'string')
    : []
  const rawNames = data.memberNames
  const memberNames = rawNames && typeof rawNames === 'object'
    ? Object.fromEntries(
      Object.entries(rawNames as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value as string]),
    )
    : {}
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    schedule: typeof data.schedule === 'string' ? data.schedule : '',
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    ownerName: typeof data.ownerName === 'string' ? data.ownerName : '',
    memberIds,
    memberNames,
    createdAt: isoOf(data.createdAt),
    updatedAt: isoOf(data.updatedAt),
  }
}

function inviteFromDoc(token: string, data: Record<string, unknown>): CfGroupInvite {
  return {
    token,
    groupId: typeof data.groupId === 'string' ? data.groupId : '',
    groupName: typeof data.groupName === 'string' ? data.groupName : '',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
    createdAt: isoOf(data.createdAt),
    expiresAt: isoOf(data.expiresAt),
    revoked: data.revoked === true,
    revokedAt: isoOf(data.revokedAt) || undefined,
  }
}

function requestFromDoc(uid: string, data: Record<string, unknown>): CfJoinRequest {
  return {
    uid,
    groupId: typeof data.groupId === 'string' ? data.groupId : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    email: typeof data.email === 'string' ? data.email : '',
    message: typeof data.message === 'string' ? data.message : '',
    status: data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending',
    inviteToken: typeof data.inviteToken === 'string' ? data.inviteToken : '',
    createdAt: isoOf(data.createdAt),
    updatedAt: isoOf(data.updatedAt),
    reviewedBy: typeof data.reviewedBy === 'string' ? data.reviewedBy : undefined,
    reviewedAt: isoOf(data.reviewedAt) || undefined,
  }
}

// ---------- Grupos ----------

export async function listMyGroups(uid: string): Promise<CfGroup[]> {
  const snap = await getDocs(query(
    collection(firestore(), GROUPS),
    where('memberIds', 'array-contains', uid),
  ))
  return snap.docs
    .map((d) => groupFromDoc(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export async function getGroup(groupId: string): Promise<CfGroup | null> {
  const snap = await getDoc(doc(firestore(), GROUPS, groupId))
  return snap.exists() ? groupFromDoc(snap.id, snap.data()) : null
}

export async function createGroup(input: { name: string; description?: string; schedule?: string }): Promise<CfGroup> {
  const user = requireUser()
  const invalid = validateGroupEdit(input)
  if (invalid) { throw new Error(invalid) }
  const name = input.name.trim()
  const ref = doc(collection(firestore(), GROUPS))
  const now = new Date().toISOString()
  const group: CfGroup = {
    id: ref.id,
    name,
    description: (input.description ?? '').trim().slice(0, 300),
    schedule: (input.schedule ?? '').trim().slice(0, 80),
    ownerId: user.uid,
    ownerName: displayNameOf(user),
    memberIds: [user.uid],
    memberNames: { [user.uid]: displayNameOf(user) },
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(ref, group)
  return group
}

/** Solo cambia los campos editables; propiedad y pertenencia quedan intactas. */
export async function updateGroupDetails(
  groupId: string,
  input: { name: string; description?: string; schedule?: string },
): Promise<void> {
  const user = requireUser()
  const invalid = validateGroupEdit(input)
  if (invalid) { throw new Error(invalid) }
  const group = await getGroup(groupId)
  if (!group) { throw new Error('No tenés acceso a este grupo.') }
  if (group.ownerId !== user.uid) { throw new Error('Solo el entrenador puede editar el grupo.') }
  await updateDoc(doc(firestore(), GROUPS, groupId), {
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    schedule: (input.schedule ?? '').trim(),
    updatedAt: new Date().toISOString(),
  })
}

// ---------- Invitaciones ----------

export async function listGroupInvites(groupId: string): Promise<CfGroupInvite[]> {
  const user = requireUser()
  // La regla de list exige createdBy == auth.uid; el filtro por grupo se hace
  // en memoria para no depender de un índice compuesto nuevo.
  const snap = await getDocs(query(
    collection(firestore(), INVITES),
    where('createdBy', '==', user.uid),
  ))
  return snap.docs
    .map((d) => inviteFromDoc(d.id, d.data()))
    .filter((invite) => invite.groupId === groupId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getInvite(token: string): Promise<CfGroupInvite | null> {
  if (!isValidInviteToken(token)) { return null }
  try {
    const snap = await getDoc(doc(firestore(), INVITES, token))
    return snap.exists() ? inviteFromDoc(snap.id, snap.data()) : null
  } catch (error) {
    if (isPermissionDenied(error)) { return null }
    throw error
  }
}

export async function createInvite(group: Pick<CfGroup, 'id' | 'name' | 'ownerId'>): Promise<CfGroupInvite> {
  const user = requireUser()
  if (group.ownerId !== user.uid) { throw new Error('Solo el entrenador del grupo puede generar invitaciones.') }
  const token = generateInviteToken()
  const now = new Date()
  const expiresAt = inviteExpiry(now)
  const invite: CfGroupInvite = {
    token,
    groupId: group.id,
    groupName: group.name,
    createdBy: user.uid,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revoked: false,
  }
  await setDoc(doc(firestore(), INVITES, token), {
    groupId: invite.groupId,
    groupName: invite.groupName,
    createdBy: invite.createdBy,
    createdAt: invite.createdAt,
    expiresAt: Timestamp.fromDate(expiresAt),
    revoked: false,
  })
  return invite
}

export async function revokeInvite(token: string): Promise<void> {
  await updateDoc(doc(firestore(), INVITES, token), {
    revoked: true,
    revokedAt: new Date().toISOString(),
  })
}

// ---------- Solicitudes ----------

export async function getMyRequest(groupId: string, uid: string): Promise<CfJoinRequest | null> {
  try {
    const snap = await getDoc(doc(firestore(), GROUPS, groupId, REQUESTS, uid))
    return snap.exists() ? requestFromDoc(snap.id, snap.data()) : null
  } catch (error) {
    if (isPermissionDenied(error)) { return null }
    throw error
  }
}

export async function listRequests(groupId: string): Promise<CfJoinRequest[]> {
  const snap = await getDocs(collection(firestore(), GROUPS, groupId, REQUESTS))
  return snap.docs
    .map((d) => requestFromDoc(d.id, d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createJoinRequest(input: {
  invite: CfGroupInvite
  displayName: string
  email: string
  message?: string
}): Promise<CfJoinRequest> {
  const user = requireUser()
  const displayName = input.displayName.trim()
  if (!displayName) { throw new Error('Escribí tu nombre para que el entrenador te reconozca.') }
  const now = new Date().toISOString()
  const request: CfJoinRequest = {
    uid: user.uid,
    groupId: input.invite.groupId,
    displayName: displayName.slice(0, 80),
    email: input.email.trim().slice(0, 160),
    message: (input.message ?? '').trim().slice(0, 300),
    status: 'pending',
    inviteToken: input.invite.token,
    createdAt: now,
    updatedAt: now,
  }
  // merge: si la solicitud anterior fue rechazada, la regla permite volver a
  // 'pending' sin borrar la auditoría de la revisión.
  await setDoc(doc(firestore(), GROUPS, request.groupId, REQUESTS, user.uid), request, { merge: true })
  return request
}

export async function approveRequest(groupId: string, requestUid: string): Promise<void> {
  const user = requireUser()
  const db = firestore()
  const groupRef = doc(db, GROUPS, groupId)
  const requestRef = doc(db, GROUPS, groupId, REQUESTS, requestUid)

  await runTransaction(db, async (tx) => {
    const [groupSnap, requestSnap] = await Promise.all([tx.get(groupRef), tx.get(requestRef)])
    if (!groupSnap.exists()) { throw new Error('El grupo ya no existe.') }
    if (!requestSnap.exists()) { throw new Error('La solicitud ya no existe.') }
    const group = groupFromDoc(groupSnap.id, groupSnap.data())
    const request = requestFromDoc(requestSnap.id, requestSnap.data())
    if (group.ownerId !== user.uid) { throw new Error('Solo el entrenador puede aprobar solicitudes.') }
    if (request.status !== 'pending') { throw new Error('Esta solicitud ya fue revisada.') }

    const now = new Date().toISOString()
    const memberIds = [...new Set([...group.memberIds, request.uid])]
    tx.update(groupRef, {
      memberIds,
      memberNames: { ...group.memberNames, [request.uid]: request.displayName || request.email || 'Atleta' },
      updatedAt: now,
    })
    tx.update(requestRef, {
      status: 'approved',
      reviewedBy: user.uid,
      reviewedAt: now,
      updatedAt: now,
    })
  })
}

export async function rejectRequest(groupId: string, requestUid: string): Promise<void> {
  const user = requireUser()
  const now = new Date().toISOString()
  await updateDoc(doc(firestore(), GROUPS, groupId, REQUESTS, requestUid), {
    status: 'rejected',
    reviewedBy: user.uid,
    reviewedAt: now,
    updatedAt: now,
  })
}

export async function removeMember(groupId: string, memberUid: string): Promise<void> {
  const user = requireUser()
  if (memberUid === user.uid) { throw new Error('No podés quitarte a vos mismo del grupo.') }
  const db = firestore()
  const groupRef = doc(db, GROUPS, groupId)
  const requestRef = doc(db, GROUPS, groupId, REQUESTS, memberUid)

  await runTransaction(db, async (tx) => {
    const [snap, requestSnap] = await Promise.all([tx.get(groupRef), tx.get(requestRef)])
    if (!snap.exists()) { throw new Error('El grupo ya no existe.') }
    const group = groupFromDoc(snap.id, snap.data())
    if (group.ownerId !== user.uid) { throw new Error('Solo el entrenador puede quitar integrantes.') }
    if (memberUid === group.ownerId) { throw new Error('El propietario no puede salir del grupo.') }
    const now = new Date().toISOString()
    const memberNames = { ...group.memberNames }
    delete memberNames[memberUid]
    tx.update(groupRef, {
      memberIds: group.memberIds.filter((uid) => uid !== memberUid),
      memberNames,
      updatedAt: now,
    })
    // La solicitud queda rechazada: si la persona recibe una invitación nueva
    // puede volver a pedir ingreso, y su enlace ya no dice "aprobado".
    if (requestSnap.exists()) {
      tx.update(requestRef, {
        status: 'rejected',
        reviewedBy: user.uid,
        reviewedAt: now,
        updatedAt: now,
      })
    }
  })
}
