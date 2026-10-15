import { isFeedbackStatus, type FeedbackInternalNote, type FeedbackMessage, type FeedbackRole, type FeedbackStatus, type FeedbackThread } from './feedbackTypes'

// Modelo puro de permisos de Feedback.
//
// IMPORTANTE: la seguridad real vive en `firestore.rules`. Estas funciones son
// (a) la fuente de verdad de la lógica que las reglas replican y (b) el gate
// de UI (defensa en profundidad). Se testean contra el modelo y contra el
// contenido del archivo de reglas, pero NO equivalen a una validación en
// Firebase real.

export interface FeedbackActor {
  uid: string
  isAdmin: boolean
}

export function isAdminActor(actor: FeedbackActor | null): boolean {
  return !!actor && actor.isAdmin
}

export function isThreadOwner(actor: FeedbackActor | null, thread: Pick<FeedbackThread, 'ownerId'> | null): boolean {
  return !!actor && !!thread && thread.ownerId === actor.uid
}

/** Leer el hilo (metadatos). El dueño solo lo propio; el admin, todos. */
export function canReadThread(actor: FeedbackActor | null, thread: Pick<FeedbackThread, 'ownerId'> | null): boolean {
  if (!actor) { return false }
  return actor.isAdmin || isThreadOwner(actor, thread)
}

/** Listar hilos: el admin lista todos; el usuario solo los suyos (filtrado por consulta). */
export function canListThreadsAs(actor: FeedbackActor | null, scope: 'own' | 'all'): boolean {
  if (!actor) { return false }
  if (scope === 'all') { return actor.isAdmin }
  return true
}

/**
 * Crear un hilo: solo un usuario autenticado puede crear un hilo propio,
 * siempre en estado 'pendiente' y con un primer mensaje.
 */
export function canCreateThread(actor: FeedbackActor | null, draft: { ownerId: string; status: string }): boolean {
  if (!actor) { return false }
  return draft.ownerId === actor.uid && draft.status === 'pendiente'
}

/**
 * Cambiar estado del hilo: solo el administrador.
 * El dueño jamás cambia estados (ni tampoco puede borrar el hilo).
 */
export function canChangeThreadStatus(actor: FeedbackActor | null, next: FeedbackStatus): boolean {
  return !!actor && actor.isAdmin && isFeedbackStatus(next)
}

/** El dueño puede actualizar solo metadatos de actividad, nunca estado ni propiedad. */
export function canOwnerUpdateThread(actor: FeedbackActor | null, thread: Pick<FeedbackThread, 'ownerId'>, changedKeys: string[]): boolean {
  if (!isThreadOwner(actor, thread)) { return false }
  const allowed = new Set([
    'updatedAt', 'lastActivityAt', 'lastMessagePreview',
    'lastMessageAuthorRole', 'messageCount', 'unreadForAdmin',
  ])
  return changedKeys.every(k => allowed.has(k))
}

/**
 * Crear mensaje: el dueño solo en su hilo y con rol 'user';
 * el admin en cualquier hilo con rol 'admin'.
 */
export function canCreateMessage(
  actor: FeedbackActor | null,
  msg: Pick<FeedbackMessage, 'authorId' | 'authorRole'>,
  thread: Pick<FeedbackThread, 'ownerId'> | null,
): boolean {
  if (!actor || !thread) { return false }
  if (msg.authorId !== actor.uid) { return false }
  if (msg.authorRole === 'admin') { return actor.isAdmin }
  return msg.authorRole === 'user' && isThreadOwner(actor, thread)
}

/** Marcar lectura: cada lector solo toca su propio flag. */
export function canMarkMessageRead(
  actor: FeedbackActor | null,
  side: 'owner' | 'admin',
  thread: Pick<FeedbackThread, 'ownerId'> | null,
): boolean {
  if (!actor) { return false }
  if (side === 'admin') { return actor.isAdmin }
  return isThreadOwner(actor, thread)
}

/** Notas internas: solo admin (leer, escribir, modificar). */
export function canAccessInternalNotes(actor: FeedbackActor | null): boolean {
  return isAdminActor(actor)
}

export function canWriteInternalNote(actor: FeedbackActor | null, note: Pick<FeedbackInternalNote, 'authorId'>): boolean {
  return isAdminActor(actor) && !!actor && note.authorId === actor.uid
}

/** La bandeja completa solo para admin autorizado. */
export function canAccessAdminInbox(actor: FeedbackActor | null): boolean {
  return isAdminActor(actor)
}

/** Autor de un mensaje para mostrar en UI. */
export function messageAuthorRoleFor(actor: FeedbackActor | null, msg: Pick<FeedbackMessage, 'authorId' | 'authorRole'>): FeedbackRole {
  if (actor && msg.authorId === actor.uid && !actor.isAdmin) { return 'user' }
  return msg.authorRole
}
