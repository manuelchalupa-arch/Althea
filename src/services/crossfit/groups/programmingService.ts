import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import type { CfWod } from '../types'
import { currentUser } from '@/services/firebase/auth'
import { firebaseDb, isFirebaseConfigured } from '@/services/firebase/config'
import type {
  CfGroupWeekDraft,
  CfGroupWeekPointer,
  CfGroupWeekVersion,
  CfGroupProgramBlock,
  CfGroupProgramDay,
  CfGroupProgramSession,
} from './programmingTypes'
import { addDaysToLocalDate, isValidWeekStart, weekDays } from './programmingDates'

/**
 * Servicio de programación semanal compartida.
 *
 * Datos compartidos en Firestore, independientes de Dexie y del
 * sincronizador privado `users/{uid}`. La fuente de verdad y los permisos
 * son las reglas de Firestore.
 */

const GROUPS = 'cfGroups'
const VERSIONS = 'versions'

function firestore() {
  if (!isFirebaseConfigured()) {
    throw new Error('La programación necesita una cuenta de Althea con conexión.')
  }
  return firebaseDb()
}

function requireUser(): User {
  const user = currentUser()
  if (!user) { throw new Error('Iniciá sesión para programar.') }
  return user
}

export function programmingAvailable(): boolean {
  return isFirebaseConfigured() && !!currentUser()
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'permission-denied'
}

function nowIso(): string {
  return new Date().toISOString()
}

function draftPath(groupId: string, weekStart: string): string {
  return `cfGroups/${groupId}/weekDrafts/${weekStart}`
}

function weekPath(groupId: string, weekStart: string): string {
  return `cfGroups/${groupId}/programWeeks/${weekStart}`
}

function versionPath(groupId: string, weekStart: string, versionId: string): string {
  return `cfGroups/${groupId}/programWeeks/${weekStart}/versions/${versionId}`
}

function weeksPath(groupId: string): string {
  return `cfGroups/${groupId}/programWeeks`
}

function draftFromDoc(weekStart: string, data: Record<string, unknown>): CfGroupWeekDraft {
  const days = Array.isArray(data.days)
    ? data.days
      .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
      .map((d, i) => dayFromDoc(d, i))
    : []
  return {
    groupId: typeof data.groupId === 'string' ? data.groupId : '',
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    weekStart: typeof data.weekStart === 'string' ? data.weekStart : weekStart,
    days,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
  }
}

function blockFromDoc(b: Record<string, unknown>, index: number): CfGroupProgramBlock {
  const raw = b.wodSnapshot as Record<string, unknown> | undefined
  const wodSnapshot = raw && typeof raw === 'object' && raw !== null
    ? {
      snapshotId: typeof raw.snapshotId === 'string' ? raw.snapshotId : '',
      snapshotAt: typeof raw.snapshotAt === 'string' ? raw.snapshotAt : '',
      wod: (typeof raw.wod === 'object' && raw.wod !== null ? raw.wod : {}) as CfWod,
    }
    : undefined
  return {
    id: typeof b.id === 'string' && b.id ? b.id : `b${index}`,
    type: blockTypeOf(b.type),
    title: typeof b.title === 'string' ? b.title : '',
    content: typeof b.content === 'string' ? b.content : '',
    order: typeof b.order === 'number' ? b.order : index,
    ...(wodSnapshot ? { wodSnapshot } : {}),
  }
}

function blockTypeOf(value: unknown): 'warmup' | 'mobility' | 'skill' | 'strength' | 'wod' | 'cooldown' {
  const valid: ('warmup' | 'mobility' | 'skill' | 'strength' | 'wod' | 'cooldown')[] = [
    'warmup', 'mobility', 'skill', 'strength', 'wod', 'cooldown',
  ]
  const v = typeof value === 'string' ? value : ''
  return (valid.includes(v as (typeof valid)[number]) ? v : 'wod') as 'warmup' | 'mobility' | 'skill' | 'strength' | 'wod' | 'cooldown'
}

function sessionFromDoc(s: Record<string, unknown>): CfGroupProgramSession {
  const blocks = Array.isArray(s.blocks)
    ? s.blocks.filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b, i) => blockFromDoc(b, i))
    : []
  return {
    title: typeof s.title === 'string' ? s.title : '',
    objective: typeof s.objective === 'string' ? s.objective : '',
    estimatedDurationMin: typeof s.estimatedDurationMin === 'number' ? s.estimatedDurationMin : 60,
    equipment: Array.isArray(s.equipment)
      ? s.equipment.filter((e): e is string => typeof e === 'string')
      : [],
    instructions: Array.isArray(s.instructions)
      ? s.instructions.filter((i): i is string => typeof i === 'string')
      : [],
    blocks,
  }
}

function dayFromDoc(d: Record<string, unknown>, index: number): CfGroupProgramDay {
  return {
    dayIndex: typeof d.dayIndex === 'number' ? d.dayIndex : index,
    date: typeof d.date === 'string' ? d.date : '',
    kind: dayKindOf(d.kind),
    session: d.session && typeof d.session === 'object' ? sessionFromDoc(d.session as Record<string, unknown>) : undefined,
  }
}

function dayKindOf(value: unknown): 'rest' | 'recovery' | 'session' {
  const valid: ('rest' | 'recovery' | 'session')[] = ['rest', 'recovery', 'session']
  const v = typeof value === 'string' ? value : ''
  return (valid.includes(v as (typeof valid)[number]) ? v : 'rest') as 'rest' | 'recovery' | 'session'
}

function versionFromDoc(weekStart: string, data: Record<string, unknown>): CfGroupWeekVersion {
  return {
    groupId: typeof data.groupId === 'string' ? data.groupId : '',
    weekStart: typeof data.weekStart === 'string' ? data.weekStart : weekStart,
    versionId: typeof data.versionId === 'string' ? data.versionId : '',
    versionNumber: typeof data.versionNumber === 'number' ? data.versionNumber : 1,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : nowIso(),
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : '',
    days: [],
  }
}

function pointerFromDoc(weekStart: string, data: Record<string, unknown>): CfGroupWeekPointer {
  return {
    weekStart: typeof data.weekStart === 'string' ? data.weekStart : weekStart,
    currentVersionId: typeof data.currentVersionId === 'string' ? data.currentVersionId : '',
    currentVersionNumber: typeof data.currentVersionNumber === 'number' ? data.currentVersionNumber : 1,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : nowIso(),
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : '',
  }
}

// ---------- Validación ----------

export function validateDraft(draft: CfGroupWeekDraft, weekStart: string): string | null {
  if (!isValidWeekStart(weekStart)) { return 'Semana inválida.' }
  if (draft.weekStart !== weekStart) { return 'La semana del borrador no coincide.' }
  if (!Array.isArray(draft.days) || draft.days.length !== 7) {
    return 'La semana debe tener exactamente siete días.'
  }
  const expected = weekDays(weekStart)
  for (let i = 0; i < 7; i++) {
    const day = draft.days[i]
    if (!day || typeof day !== 'object') { return `Día ${i + 1} inválido.` }
    if (day.dayIndex !== i) { return `El día ${i + 1} tiene índice incorrecto.` }
    if (day.date !== expected[i]) { return `La fecha del día ${i + 1} no corresponde a la semana.` }
    if (day.kind !== 'rest' && day.kind !== 'recovery' && day.kind !== 'session') {
      return `El tipo del día ${i + 1} no es válido.`
    }
    if (day.kind === 'session' && day.session) {
      const s = day.session
      if (!s.title || !s.title.trim()) { return `El día ${i + 1} necesita título de sesión.` }
      if (!Array.isArray(s.blocks) || s.blocks.length === 0) {
        return `El día ${i + 1} necesita al menos un bloque.`
      }
    }
  }
  return null
}

// ---------- Borrador ----------

export async function getWeekDraft(
  groupId: string,
  weekStart: string,
): Promise<CfGroupWeekDraft | null> {
  if (!isValidWeekStart(weekStart)) { return null }
  try {
    const snap = await getDoc(doc(firestore(), draftPath(groupId, weekStart)))
    return snap.exists() ? draftFromDoc(weekStart, snap.data()) : null
  } catch (error) {
    if (isPermissionDenied(error)) { return null }
    throw error
  }
}

export async function saveWeekDraft(draft: CfGroupWeekDraft): Promise<void> {
  const user = requireUser()
  const invalid = validateDraft(draft, draft.weekStart)
  if (invalid) { throw new Error(invalid) }
  if (draft.ownerId !== user.uid) { throw new Error('Solo el dueño puede editar el borrador.') }
  const now = nowIso()
  await setDoc(doc(firestore(), draftPath(draft.groupId, draft.weekStart)), {
    ...draft,
    updatedAt: now,
    updatedBy: user.uid,
  })
}

// ---------- Publicación ----------

export async function publishWeekDraft(
  groupId: string,
  weekStart: string,
): Promise<CfGroupWeekVersion> {
  const user = requireUser()
  if (!isValidWeekStart(weekStart)) { throw new Error('Semana inválida.') }
  const db = firestore()
  const groupRef = doc(db, GROUPS, groupId)
  const draftRef = doc(db, draftPath(groupId, weekStart))
  const weekRef = doc(db, weekPath(groupId, weekStart))
  const versionsCol = collection(db, weekPath(groupId, weekStart), VERSIONS)

  await runTransaction(db, async (tx) => {
    const [groupSnap, draftSnap, weekSnap] = await Promise.all([
      tx.get(groupRef),
      tx.get(draftRef),
      tx.get(weekRef),
    ])
    if (!groupSnap.exists()) { throw new Error('El grupo ya no existe.') }
    if (!draftSnap.exists()) { throw new Error('No existe un borrador para publicar.') }
    const group = groupSnap.data() as Record<string, unknown>
    if (typeof group.ownerId !== 'string' || group.ownerId !== user.uid) {
      throw new Error('Solo el propietario puede publicar.')
    }
    const draft = draftFromDoc(weekStart, draftSnap.data())
    const invalid = validateDraft(draft, weekStart)
    if (invalid) { throw new Error(invalid) }

    const nextVersion = weekSnap.exists()
      ? ((weekSnap.data() as Record<string, unknown>).currentVersionNumber as number) + 1
      : 1
    const versionRef = doc(versionsCol)
    const publishedAt = nowIso()

    const daysForVersion = draft.days.map((day) => ({
      dayIndex: day.dayIndex,
      date: day.date,
      kind: day.kind,
      session: day.session ? {
        title: day.session.title,
        objective: day.session.objective,
        estimatedDurationMin: day.session.estimatedDurationMin,
        equipment: [...day.session.equipment],
        instructions: [...day.session.instructions],
        blocks: day.session.blocks.map((b) => ({
          id: b.id,
          type: b.type,
          title: b.title,
          content: b.content,
          order: b.order,
          ...(b.wodSnapshot ? { wodSnapshot: { ...b.wodSnapshot } } : {}),
        })),
      } : undefined,
    }))

    tx.set(versionRef, {
      groupId,
      weekStart,
      versionId: versionRef.id,
      versionNumber: nextVersion,
      publishedBy: user.uid,
      publishedAt,
      days: daysForVersion,
    })
    tx.set(weekRef, {
      weekStart,
      currentVersionId: versionRef.id,
      currentVersionNumber: nextVersion,
      publishedBy: user.uid,
      publishedAt,
    }, { merge: true })
  })

  const version = await getPublishedWeek(groupId, weekStart)
  if (!version) { throw new Error('No se pudo leer la versión publicada.') }
  return version
}

// ---------- Lectura publicada ----------

export async function getPublishedWeek(
  groupId: string,
  weekStart: string,
): Promise<CfGroupWeekVersion | null> {
  try {
    const weekSnap = await getDoc(doc(firestore(), weekPath(groupId, weekStart)))
    if (!weekSnap.exists()) { return null }
    const pointer = pointerFromDoc(weekStart, weekSnap.data())
    if (!pointer.currentVersionId) { return null }
    const versionSnap = await getDoc(doc(firestore(), versionPath(groupId, weekStart, pointer.currentVersionId)))
    if (!versionSnap.exists()) { return null }
    return versionFromDoc(weekStart, versionSnap.data())
  } catch (error) {
    if (isPermissionDenied(error)) { return null }
    throw error
  }
}

export async function listPublishedWeeks(groupId: string): Promise<CfGroupWeekPointer[]> {
  const snap = await getDocs(collection(firestore(), weeksPath(groupId)))
  return snap.docs
    .map((d) => pointerFromDoc(d.id, d.data()))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

// ---------- Copia / duplicación ----------

export async function copyWeekToDraft(input: {
  sourceGroupId: string
  sourceWeekStart: string
  targetGroupId: string
  targetWeekStart: string
}): Promise<void> {
  const user = requireUser()
  if (!isValidWeekStart(input.targetWeekStart)) { throw new Error('Semana de destino inválida.') }
  if (!isValidWeekStart(input.sourceWeekStart)) { throw new Error('Semana de origen inválida.') }

  // Origen: preferir borrador, si no existe usar la última publicación.
  let sourceDraft = await getWeekDraft(input.sourceGroupId, input.sourceWeekStart)
  if (!sourceDraft) {
    const published = await getPublishedWeek(input.sourceGroupId, input.sourceWeekStart)
    if (!published) { throw new Error('No hay programación de origen para copiar.') }
    sourceDraft = {
      groupId: input.sourceGroupId,
      ownerId: user.uid,
      weekStart: input.sourceWeekStart,
      days: published.days.map((d, i) => ({
        dayIndex: i,
        date: addDaysToLocalDate(input.sourceWeekStart, i),
        kind: d.kind,
        session: d.session,
      })),
      updatedAt: nowIso(),
      updatedBy: user.uid,
    }
  }
  if (sourceDraft.ownerId !== user.uid) {
    throw new Error('No sos dueño de la programación de origen.')
  }
  if (input.targetGroupId !== input.sourceGroupId) {
    const targetGroup = await getGroupEx(input.targetGroupId)
    if (!targetGroup || targetGroup.ownerId !== user.uid) {
      throw new Error('No sos dueño del grupo de destino.')
    }
  }

  const targetDraft: CfGroupWeekDraft = {
    groupId: input.targetGroupId,
    ownerId: user.uid,
    weekStart: input.targetWeekStart,
    days: sourceDraft.days.map((d, i) => ({
      dayIndex: i,
      date: addDaysToLocalDate(input.targetWeekStart, i),
      kind: d.kind,
      session: d.session ? {
        title: d.session.title,
        objective: d.session.objective,
        estimatedDurationMin: d.session.estimatedDurationMin,
        equipment: [...d.session.equipment],
        instructions: [...d.session.instructions],
        blocks: d.session.blocks.map((b) => ({
          id: b.id,
          type: b.type,
          title: b.title,
          content: b.content,
          order: b.order,
          ...(b.wodSnapshot ? { wodSnapshot: { ...b.wodSnapshot } } : {}),
        })),
      } : undefined,
    })),
    updatedAt: nowIso(),
    updatedBy: user.uid,
  }
  await saveWeekDraft(targetDraft)
}

async function getGroupEx(groupId: string): Promise<{ ownerId: string } | null> {
  const snap = await getDoc(doc(firestore(), GROUPS, groupId))
  if (!snap.exists()) { return null }
  const data = snap.data() as Record<string, unknown>
  return { ownerId: typeof data.ownerId === 'string' ? data.ownerId : '' }
}


