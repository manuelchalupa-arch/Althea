import { collection, doc, getDoc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore'
import { db } from '@/services/storage/db'
import { firebaseDb, isFirebaseConfigured } from '@/services/firebase/config'
import { currentUser } from '@/services/firebase/auth'
import {
  MAX_MESSAGE_LEN,
  MAX_SUBJECT_LEN,
  isFeedbackCategory,
  previewOf,
  type FeedbackCategory,
  type FeedbackInternalNote,
  type FeedbackLocalMessage,
  type FeedbackMessage,
  type FeedbackOutboxEntry,
  type FeedbackRole,
  type FeedbackStatus,
  type FeedbackSyncStatus,
  type FeedbackThread,
} from './feedbackTypes'

// Servicio Feedback usuario ↔ administrador.
//
// Transporte: Firestore (feedbackThreads/{id} + messages + internalNotes).
// Espejo local: Dexie (feedbackThreads / feedbackMessages / feedbackOutbox).
//
// Tres reglas que gobiernan todo el archivo:
//  1. NUNCA se informa un envío exitoso antes de que `commit()` resuelva.
//  2. Los ids de documento se generan en cliente: reintentar es sobrescribir
//     el mismo documento, nunca duplicar (outbox idempotente).
//  3. Sin conexión el mensaje se conserva localmente como "no enviado";
//     permission-denied u otros errores de negocio NO se reencolan a ciegas.

export type FeedbackDelivery = 'sent' | 'pending' | 'error'

export interface FeedbackSendResult {
  delivery: FeedbackDelivery
  threadId: string
  messageId: string
  /** Motivo legible cuando delivery === 'error'. */
  error?: string
  /** Cuando delivery === 'pending', por qué todavía no se envió. */
  reason?: string
}

export interface FeedbackFlushReport {
  sent: number
  pending: number
  errors: number
}

export type FeedbackErrorCode = 'no-session' | 'validation' | 'network' | 'permission' | 'unknown'

export class FeedbackError extends Error {
  code: FeedbackErrorCode
  constructor(code: FeedbackErrorCode, message: string) {
    super(message)
    this.name = 'FeedbackError'
    this.code = code
  }
}

/** Primer mensaje / respuestas: espejo de firestore.rules. */
export const MESSAGE_LIMIT_MSG = `Máximo ${MAX_MESSAGE_LEN} caracteres.`
export const SUBJECT_LIMIT_MSG = `Máximo ${MAX_SUBJECT_LEN} caracteres.`

const SEND_TIMEOUT_MS = 8000
const OUTBOX_ID = (kind: 'thread' | 'message', docId: string) => `${kind}:${docId}`

// ── utilidades ──────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined
    if (c && typeof c.randomUUID === 'function') { return c.randomUUID() }
  } catch { /* noop */ }
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Sin `navigator.onLine === false` no hay certeza de estar offline. */
function isOnline(): boolean {
  if (typeof navigator === 'undefined') { return true }
  return navigator.onLine !== false
}

export function requireSession(): { uid: string } {
  if (!isFirebaseConfigured()) {
    throw new FeedbackError('no-session', 'Feedback necesita una cuenta de Althea conectada.')
  }
  const u = currentUser()
  if (!u) {
    throw new FeedbackError('no-session', 'Iniciá sesión para usar Feedback.')
  }
  return { uid: u.uid }
}

function isFirebaseError(e: unknown): e is { code?: string; message?: string } {
  return !!e && typeof e === 'object' && 'code' in e
}

type FailureKind = 'permission' | 'retryable' | 'fatal'

function failureKind(e: unknown): FailureKind {
  const code = isFirebaseError(e) ? String(e.code || '') : ''
  if (code === 'permission-denied') { return 'permission' }
  if (
    code === 'unavailable' || code === 'deadline-exceeded' || code === 'failed-precondition' ||
    code === 'cancelled' || code === 'timeout' || code === 'offline' || code === ''
  ) {
    return 'retryable'
  }
  return 'fatal'
}

function messageFor(e: unknown, fallback: string): string {
  if (isFirebaseError(e) && e.message) { return String(e.message).slice(0, 300) }
  return fallback
}

/** El SDK de Firestore deja la promesa "colgada" si se corta la red: con timeout
 *  la envolvemos para poder informar "todavía no enviado" en vez de un spinner
 *  infinito. Si el commit termina después, el id fijo hace que sea inocuo. */
function withTimeout<T>(p: Promise<T>, ms = SEND_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = { code: 'timeout', message: 'Sin respuesta de la red.' }
      reject(err)
    }, ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

function validateText(text: string): string {
  const t = (text || '').trim()
  if (!t) { throw new FeedbackError('validation', 'Escribí un mensaje antes de enviarlo.') }
  if (t.length > MAX_MESSAGE_LEN) { throw new FeedbackError('validation', MESSAGE_LIMIT_MSG) }
  return t
}

function validateSubject(subject: string): string {
  const s = (subject || '').trim()
  if (s.length > MAX_SUBJECT_LEN) { throw new FeedbackError('validation', SUBJECT_LIMIT_MSG) }
  return s
}

// ── construcción de documentos ──────────────────────────────────────────────

function buildThread(params: {
  id: string
  ownerId: string
  ownerName: string
  ownerEmail: string
  category: FeedbackCategory
  subject: string
  firstText: string
}): FeedbackThread {
  const now = nowIso()
  return {
    id: params.id,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    ownerEmail: params.ownerEmail,
    category: params.category,
    subject: params.subject,
    status: 'pendiente',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
    lastMessagePreview: previewOf(params.firstText),
    lastMessageAuthorRole: 'user',
    messageCount: 1,
    unreadForOwner: 0,
    unreadForAdmin: 1,
  }
}

function buildMessage(params: {
  threadId: string
  ownerId: string
  authorId: string
  authorRole: FeedbackRole
  text: string
}): FeedbackMessage {
  return {
    id: newId(),
    threadId: params.threadId,
    ownerId: params.ownerId,
    authorId: params.authorId,
    authorRole: params.authorRole,
    text: params.text,
    createdAt: nowIso(),
    readByOwner: params.authorRole === 'user',
    readByAdmin: params.authorRole === 'admin',
  }
}

/** Metadatos del hilo tras escribir un mensaje nuevo. Valores planos (sin
 *  increment): se recalculan en cada flush sobre el snapshot vigente. */
function threadDeltaAfterMessage(thread: FeedbackThread, message: FeedbackMessage): Partial<FeedbackThread> {
  const fromUser = message.authorRole === 'user'
  return {
    lastMessagePreview: previewOf(message.text),
    lastMessageAuthorRole: message.authorRole,
    updatedAt: message.createdAt,
    lastActivityAt: message.createdAt,
    messageCount: (thread.messageCount || 0) + 1,
    // El emisor ya leyó lo suyo; el destinatario queda con aviso sin leer.
    unreadForOwner: fromUser ? 0 : (thread.unreadForOwner || 0) + 1,
    unreadForAdmin: fromUser ? (thread.unreadForAdmin || 0) + 1 : 0,
  }
}

// ── espejo local (Dexie) ────────────────────────────────────────────────────

async function putLocalThread(thread: FeedbackThread): Promise<void> {
  try { await db.feedbackThreads.put(thread) } catch { /* noop: lo local es espejo */ }
}

async function putLocalMessage(message: FeedbackMessage, status: FeedbackSyncStatus): Promise<void> {
  try { await db.feedbackMessages.put({ ...message, syncStatus: status }) } catch { /* noop */ }
}

async function setLocalMessageStatus(id: string, status: FeedbackSyncStatus): Promise<void> {
  try { await db.feedbackMessages.update(id, { syncStatus: status } as never) } catch { /* noop */ }
}

async function enqueue(entry: Omit<FeedbackOutboxEntry, 'attempts' | 'error'>): Promise<void> {
  const prev = await db.feedbackOutbox.get(entry.id).catch(() => null)
  await db.feedbackOutbox.put({
    ...entry,
    attempts: prev?.attempts ?? 0,
  })
}

async function updateOutbox(id: string, patch: Partial<FeedbackOutboxEntry>): Promise<void> {
  try { await db.feedbackOutbox.update(id, { ...patch, updatedAt: nowIso() } as never) } catch { /* noop */ }
}

async function removeOutbox(id: string): Promise<void> {
  try { await db.feedbackOutbox.delete(id) } catch { /* noop */ }
}

// ── autorización administrativa ─────────────────────────────────────────────

let adminCache: { uid: string; value: boolean; at: number } | null = null
const ADMIN_TTL_MS = 60_000

/**
 * ¿Es este usuario administrador? El rol lo decide Firestore (005): este
 * método solo hace una SONDA que las reglas permiten exclusivamente a la
 * administración —listar feedbackThreads sin filtro— y traduce la respuesta:
 * éxito ⇒ admin, permission-denied ⇒ no admin, red/caída ⇒ sin decidir.
 * No existe ninguna variable de frontend ni ruta que otorgue el rol.
 */
export async function fetchIsFeedbackAdmin(force = false): Promise<boolean> {
  let uid = ''
  try {
    uid = requireSession().uid
  } catch {
    return false
  }
  if (!force && adminCache && adminCache.uid === uid && Date.now() - adminCache.at < ADMIN_TTL_MS) {
    return adminCache.value
  }
  try {
    await withTimeout(getDocs(query(collection(firebaseDb(), 'feedbackThreads'), limit(1))))
    adminCache = { uid, value: true, at: Date.now() }
    return true
  } catch (e) {
    if (failureKind(e) === 'permission') {
      adminCache = { uid, value: false, at: Date.now() }
      return false
    }
    // Red/timeout: no es un "no" definitivo, no se cachea (reintenta al
    // próximo montaje del hook).
    return false
  }
}

export function resetFeedbackAdminCache(): void {
  adminCache = null
}

// ── outbox idempotente ──────────────────────────────────────────────────────

async function flushEntry(entry: FeedbackOutboxEntry): Promise<FeedbackDelivery> {
  const message = entry.payload.message
  if (!message) {
    await updateOutbox(entry.id, { status: 'error', error: 'Entrada de cola incompleta' })
    return 'error'
  }
  const fsdb = firebaseDb()
  const threadRef = doc(fsdb, 'feedbackThreads', entry.threadId)
  const messageRef = doc(fsdb, 'feedbackThreads', entry.threadId, 'messages', message.id)

  // Chequeo de idempotencia: si el mensaje ya está en el servidor, la escritura
  // anterior se confirmó (el batch es atómico) y solo falta limpiar la cola.
  const existing = await withTimeout(getDoc(messageRef))
  if (existing.exists()) {
    await setLocalMessageStatus(message.id, 'synced')
    await removeOutbox(entry.id)
    return 'sent'
  }

  const batch = writeBatch(fsdb)
  if (entry.kind === 'thread') {
    const thread = entry.payload.thread
    if (!thread) {
      await updateOutbox(entry.id, { status: 'error', error: 'Entrada de cola incompleta' })
      return 'error'
    }
    batch.set(threadRef, thread as unknown as Record<string, unknown>)
  } else {
    const threadSnap = await withTimeout(getDoc(threadRef))
    if (!threadSnap.exists()) {
      // El hilo aún no se creó: la entrada vuelve a la cola sin marcar error.
      return 'pending'
    }
    const thread = { id: entry.threadId, ...(threadSnap.data() as Omit<FeedbackThread, 'id'>) } as FeedbackThread
    batch.update(threadRef, threadDeltaAfterMessage(thread, message) as unknown as Record<string, unknown>)
  }
  batch.set(messageRef, message as unknown as Record<string, unknown>)

  await withTimeout(batch.commit())

  await setLocalMessageStatus(message.id, 'synced')
  await removeOutbox(entry.id)
  if (entry.kind === 'thread' && entry.payload.thread) {
    await putLocalThread(entry.payload.thread)
  }
  return 'sent'
}

async function resolveSendFailure(
  entry: FeedbackOutboxEntry,
  e: unknown,
  messageId: string,
): Promise<FeedbackSendResult> {
  const kind = failureKind(e)
  if (kind === 'retryable') {
    await updateOutbox(entry.id, {
      status: 'pending',
      attempts: (entry.attempts || 0) + 1,
      error: messageFor(e, 'Sin conexión.'),
    })
    await setLocalMessageStatus(messageId, 'pending')
    return {
      delivery: 'pending',
      threadId: entry.threadId,
      messageId,
      reason: 'Sin conexión: el mensaje quedó guardado y todavía no fue enviado.',
    }
  }
  // permission-denied u otro error de negocio: error real, sin reintento ciego.
  const text = kind === 'permission'
    ? 'No tenés permiso para esta operación. Revisá tu cuenta e intentá de nuevo.'
    : messageFor(e, 'No se pudo enviar el mensaje.')
  await updateOutbox(entry.id, { status: 'error', attempts: (entry.attempts || 0) + 1, error: text })
  await setLocalMessageStatus(messageId, 'error')
  return { delivery: 'error', threadId: entry.threadId, messageId, error: text }
}

/** Reintenta una entrada marcada como error (acción explícita del usuario). */
async function retryEntry(entry: FeedbackOutboxEntry): Promise<FeedbackSendResult> {
  await updateOutbox(entry.id, { status: 'pending' })
  const fresh = (await db.feedbackOutbox.get(entry.id)) as FeedbackOutboxEntry | undefined
  return attemptSend(fresh ?? { ...entry, status: 'pending' })
}

/** Intenta enviar una entrada de cola. Devuelve el resultado CONFIRMADO. */
async function attemptSend(entry: FeedbackOutboxEntry): Promise<FeedbackSendResult> {
  const messageId = entry.payload.message?.id ?? ''
  if (!isOnline()) {
    await updateOutbox(entry.id, { status: 'pending' })
    await setLocalMessageStatus(messageId, 'pending')
    return {
      delivery: 'pending',
      threadId: entry.threadId,
      messageId,
      reason: 'Sin conexión: el mensaje quedó guardado y todavía no fue enviado.',
    }
  }
  try {
    const delivery = await flushEntry(entry)
    if (delivery === 'sent') {
      return { delivery: 'sent', threadId: entry.threadId, messageId }
    }
    await updateOutbox(entry.id, { status: 'pending', attempts: (entry.attempts || 0) + 1 })
    await setLocalMessageStatus(messageId, 'pending')
    return {
      delivery: 'pending',
      threadId: entry.threadId,
      messageId,
      reason: 'Sin confirmación del servidor: el mensaje todavía no fue enviado.',
    }
  } catch (e) {
    return resolveSendFailure(entry, e, messageId)
  }
}

/**
 * Envía todas las entradas pendientes de la cola, en orden. Idempotente:
 * repetirlo nunca duplica documentos (ids fijos + chequeo previo).
 * Las entradas en estado 'error' solo salen con `includeErrors` (reintento
 * explícito del usuario), nunca de forma automática.
 */
export async function flushOutbox(options: { includeErrors?: boolean } = {}): Promise<FeedbackFlushReport> {
  const report: FeedbackFlushReport = { sent: 0, pending: 0, errors: 0 }
  try {
    if (!isFirebaseConfigured() || !currentUser()) { return report }
    const all = (await db.feedbackOutbox.toArray().catch(() => [])) as FeedbackOutboxEntry[]
    const queue = all
      .filter((e) => e && (e.status === 'pending' || (options.includeErrors && e.status === 'error')))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    for (const entry of queue) {
      const res = await attemptSend(entry)
      if (res.delivery === 'sent') { report.sent += 1 }
      else if (res.delivery === 'pending') { report.pending += 1 }
      else { report.errors += 1 }
    }
  } catch { /* noop: lo pendiente se conserva en la cola */ }
  return report
}

export async function pendingOutboxCount(): Promise<number> {
  try {
    const all = (await db.feedbackOutbox.toArray()) as FeedbackOutboxEntry[]
    return all.filter((e) => e && e.status !== undefined).length
  } catch { return 0 }
}

export { retryEntry as retryFeedbackEntry }

// ── altas y envíos ──────────────────────────────────────────────────────────

export interface CreateThreadInput {
  category: FeedbackCategory
  subject: string
  text: string
}

/** Crea el hilo + primer mensaje. Local primero, después servidor. */
export async function createThread(input: CreateThreadInput): Promise<FeedbackSendResult> {
  const { uid } = requireSession()
  if (!isFeedbackCategory(input.category)) {
    throw new FeedbackError('validation', 'Elegí una categoría válida.')
  }
  const text = validateText(input.text)
  const subject = validateSubject(input.subject)

  const threadId = newId()
  // Identidad denormalizada para la bandeja admin: el perfil local es la
  // fuente, Auth el fallback. Si ambos fallan van vacíos (UID como último recurso).
  const profile = await db.userProfile.get('me').catch(() => null)
  const authUser = currentUser()
  const thread = buildThread({
    id: threadId,
    ownerId: uid,
    ownerName: profile?.displayName || authUser?.displayName || '',
    ownerEmail: profile?.email || authUser?.email || '',
    category: input.category,
    subject,
    firstText: text,
  })
  const message = buildMessage({ threadId, ownerId: uid, authorId: uid, authorRole: 'user', text })

  await putLocalThread(thread)
  await putLocalMessage(message, 'pending')
  const entry: FeedbackOutboxEntry = {
    id: OUTBOX_ID('thread', threadId),
    kind: 'thread',
    docId: threadId,
    threadId,
    payload: { thread, message },
    status: 'pending',
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  await enqueue(entry)
  const stored = ((await db.feedbackOutbox.get(entry.id)) ?? entry) as FeedbackOutboxEntry
  return attemptSend(stored)
}

export interface SendMessageInput {
  thread: FeedbackThread
  text: string
  role: FeedbackRole
}

/** Envía un mensaje a un hilo existente (rol 'user' o 'admin'). */
export async function sendThreadMessage(input: SendMessageInput): Promise<FeedbackSendResult> {
  const { uid } = requireSession()
  const text = validateText(input.text)
  const thread = input.thread
  if (!thread?.id) { throw new FeedbackError('validation', 'Conversación inválida.') }

  if (input.role === 'user' && thread.ownerId !== uid) {
    throw new FeedbackError('permission', 'Solo podés escribir en tus propias conversaciones.')
  }

  const message = buildMessage({
    threadId: thread.id,
    ownerId: thread.ownerId,
    authorId: uid,
    authorRole: input.role,
    text,
  })

  await putLocalMessage(message, 'pending')
  const entry: FeedbackOutboxEntry = {
    id: OUTBOX_ID('message', message.id),
    kind: 'message',
    docId: message.id,
    threadId: thread.id,
    payload: { message },
    status: 'pending',
    attempts: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  await enqueue(entry)

  // Espejo local inmediato: la UI puede mostrar el mensaje como "no enviado"
  // sin esperar al servidor.
  const optimistic: FeedbackThread = {
    ...thread,
    lastMessagePreview: previewOf(text),
    lastMessageAuthorRole: input.role,
    updatedAt: message.createdAt,
    lastActivityAt: message.createdAt,
    messageCount: (thread.messageCount || 0) + 1,
    unreadForOwner: input.role === 'user' ? 0 : (thread.unreadForOwner || 0) + 1,
    unreadForAdmin: input.role === 'user' ? (thread.unreadForAdmin || 0) + 1 : 0,
  }
  await putLocalThread(optimistic)

  const stored = ((await db.feedbackOutbox.get(entry.id)) ?? entry) as FeedbackOutboxEntry
  return attemptSend(stored)
}

// ── lecturas ────────────────────────────────────────────────────────────────

function sortByActivity(threads: FeedbackThread[]): FeedbackThread[] {
  return [...threads].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : a.lastActivityAt > b.lastActivityAt ? -1 : 0))
}

export interface ThreadListResult {
  threads: FeedbackThread[]
  source: 'remote' | 'local'
}

/**
 * Conversaciones del usuario actual. La consulta SIEMPRE filtra por
 * `ownerId == uid` (requisito de las reglas de list) y se ordena en cliente
 * para no depender de índices compuestos que aún no existen en el proyecto.
 */
export async function listMyThreads(): Promise<ThreadListResult> {
  const { uid } = requireSession()
  const local = ((await db.feedbackThreads.toArray().catch(() => [])) as FeedbackThread[])
    .filter((t) => t && t.ownerId === uid)

  if (!isOnline()) {
    return { threads: sortByActivity(local), source: 'local' }
  }
  try {
    const col = collection(firebaseDb(), 'feedbackThreads')
    const snap = await withTimeout(getDocs(query(col, where('ownerId', '==', uid))))
    const remote: FeedbackThread[] = snap.docs.map((d) => ({
      ...(d.data() as Omit<FeedbackThread, 'id'>),
      id: d.id,
    }))
    // Merge: lo remoto manda; lo local solo aporta hilos aún no confirmados.
    const byId = new Map<string, FeedbackThread>(remote.map((t) => [t.id, t]))
    for (const t of local) { if (!byId.has(t.id)) { byId.set(t.id, t) } }
    const merged = [...byId.values()]
    await db.feedbackThreads.bulkPut(merged).catch(() => {})
    return { threads: sortByActivity(merged), source: 'remote' }
  } catch (e) {
    if (failureKind(e) === 'retryable') {
      return { threads: sortByActivity(local), source: 'local' }
    }
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'No podés leer estas conversaciones.')
    }
    return { threads: sortByActivity(local), source: 'local' }
  }
}

/** Un hilo por id. Reglas: solo el dueño o la administración pueden leerlo. */
export async function getThread(threadId: string): Promise<FeedbackThread> {
  requireSession()
  const local = await db.feedbackThreads.get(threadId).catch(() => null)
  if (!isOnline()) {
    if (local) { return local }
    throw new FeedbackError('network', 'Sin conexión: no se pudo cargar la conversación.')
  }
  try {
    const snap = await withTimeout(getDoc(doc(firebaseDb(), 'feedbackThreads', threadId)))
    if (!snap.exists()) {
      throw new FeedbackError('permission', 'No encontrás esta conversación.')
    }
    const thread = { ...(snap.data() as Omit<FeedbackThread, 'id'>), id: threadId }
    await db.feedbackThreads.put(thread).catch(() => {})
    return thread
  } catch (e) {
    if (e instanceof FeedbackError) { throw e }
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'No podés leer esta conversación.')
    }
    if (local) { return local }
    throw new FeedbackError('network', 'No se pudo cargar la conversación.')
  }
}

/** Bandeja completa: exclusiva del administrador autorizado. */
export async function listAllThreads(): Promise<FeedbackThread[]> {
  requireSession()
  if (!isOnline()) {
    throw new FeedbackError('network', 'La bandeja necesita conexión.')
  }
  try {
    const snap = await withTimeout(getDocs(collection(firebaseDb(), 'feedbackThreads')))
    const threads = snap.docs.map((d) => ({ ...(d.data() as Omit<FeedbackThread, 'id'>), id: d.id }))
    return sortByActivity(threads)
  } catch (e) {
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'No estás autorizado para ver la bandeja.')
    }
    throw new FeedbackError('network', 'No se pudo leer la bandeja. Revisá tu conexión.')
  }
}

export type MessageScope = 'owner' | 'admin'

/** Mensajes de un hilo. El dueño consulta con ownerId (requisito de reglas);
 *  el admin sin ese filtro. Se fusiona con los mensajes locales no confirmados. */
export async function listThreadMessages(threadId: string, scope: MessageScope): Promise<FeedbackLocalMessage[]> {
  const { uid } = requireSession()
  const local = ((await db.feedbackMessages.toArray().catch(() => [])) as FeedbackLocalMessage[])
    .filter((m) => m && m.threadId === threadId && (scope === 'admin' || m.ownerId === uid))

  if (!isOnline()) {
    return [...local].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  }
  let remote: FeedbackLocalMessage[] = []
  try {
    const col = collection(firebaseDb(), 'feedbackThreads', threadId, 'messages')
    const constraints = scope === 'admin'
      ? [where('threadId', '==', threadId)]
      : [where('threadId', '==', threadId), where('ownerId', '==', uid)]
    const snap = await withTimeout(getDocs(query(col, ...constraints)))
    remote = snap.docs.map((d) => ({
      ...(d.data() as Omit<FeedbackMessage, 'id'>),
      id: d.id,
      syncStatus: 'synced' as FeedbackSyncStatus,
    }))
    await db.feedbackMessages.bulkPut(remote).catch(() => {})
  } catch (e) {
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'No podés leer estos mensajes.')
    }
    // Red caída: se sirve el espejo local (offline-first).
  }
  const byId = new Map<string, FeedbackLocalMessage>(remote.map((m) => [m.id, m]))
  for (const m of local) { if (!byId.has(m.id)) { byId.set(m.id, m) } }
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
}

export async function listInternalNotes(threadId: string): Promise<FeedbackInternalNote[]> {
  requireSession()
  try {
    const snap = await withTimeout(getDocs(collection(firebaseDb(), 'feedbackThreads', threadId, 'internalNotes')))
    return snap.docs
      .map((d) => ({ ...(d.data() as Omit<FeedbackInternalNote, 'id'>), id: d.id }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  } catch {
    // Una cuenta normal recibe permission-denied: no hay notas que mostrar.
    return []
  }
}

export async function addInternalNote(threadId: string, text: string): Promise<void> {
  const { uid } = requireSession()
  const t = (text || '').trim()
  if (!t) { throw new FeedbackError('validation', 'La nota no puede estar vacía.') }
  if (t.length > MAX_MESSAGE_LEN) { throw new FeedbackError('validation', MESSAGE_LIMIT_MSG) }
  if (!isOnline()) { throw new FeedbackError('network', 'Sin conexión: no se pudo guardar la nota.') }
  const fsdb = firebaseDb()
  const ref = doc(collection(fsdb, 'feedbackThreads', threadId, 'internalNotes'))
  const note: FeedbackInternalNote = { id: ref.id, threadId, authorId: uid, text: t, createdAt: nowIso() }
  const batch = writeBatch(fsdb)
  batch.set(ref, note as unknown as Record<string, unknown>)
  try {
    await withTimeout(batch.commit())
  } catch (e) {
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'Solo la administración puede escribir notas internas.')
    }
    throw new FeedbackError('network', messageFor(e, 'No se pudo guardar la nota.'))
  }
}

// ── acciones sobre el hilo ──────────────────────────────────────────────────

/** Cambio de estado: exclusivo del administrador (lo garantiza firestore.rules). */
export async function setThreadStatus(threadId: string, status: FeedbackStatus): Promise<void> {
  requireSession()
  if (!isOnline()) { throw new FeedbackError('network', 'Sin conexión: no se pudo cambiar el estado.') }
  try {
    const batch = writeBatch(firebaseDb())
    batch.update(doc(firebaseDb(), 'feedbackThreads', threadId), { status, updatedAt: nowIso() })
    await withTimeout(batch.commit())
  } catch (e) {
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'Solo la administración puede cambiar el estado.')
    }
    throw new FeedbackError('network', messageFor(e, 'No se pudo cambiar el estado.'))
  }
}

/** Marca mensajes como leídos por el lector indicado y baja el contador del hilo.
 *  Cada lector solo toca su propio flag (reglas: readByOwner / readByAdmin). */
export async function markThreadRead(
  threadId: string,
  side: 'owner' | 'admin',
  messageIds: string[],
): Promise<void> {
  if (!isOnline()) { return }
  if (messageIds.length === 0) { return }
  try {
    const fsdb = firebaseDb()
    const batch = writeBatch(fsdb)
    for (const id of messageIds) {
      const ref = doc(fsdb, 'feedbackThreads', threadId, 'messages', id)
      batch.update(ref, side === 'owner' ? { readByOwner: true } : { readByAdmin: true })
    }
    batch.update(doc(fsdb, 'feedbackThreads', threadId), side === 'owner'
      ? { unreadForOwner: 0 }
      : { unreadForAdmin: 0 })
    await withTimeout(batch.commit())
    // El espejo local refleja la lectura para que la UI no parpadee.
    for (const id of messageIds) {
      try {
        await db.feedbackMessages.update(id, side === 'owner'
          ? ({ readByOwner: true } as never)
          : ({ readByAdmin: true } as never))
      } catch { /* noop */ }
    }
  } catch { /* la lectura es best-effort: nunca bloquea la UI */ }
}

/** Borra un mensaje: solo la administración (reglas). */
export async function deleteMessage(threadId: string, messageId: string): Promise<void> {
  requireSession()
  if (!isOnline()) { throw new FeedbackError('network', 'Sin conexión: no se pudo borrar el mensaje.') }
  const fsdb = firebaseDb()
  const batch = writeBatch(fsdb)
  batch.delete(doc(fsdb, 'feedbackThreads', threadId, 'messages', messageId))
  try {
    await withTimeout(batch.commit())
  } catch (e) {
    if (failureKind(e) === 'permission') {
      throw new FeedbackError('permission', 'Solo la administración puede borrar mensajes.')
    }
    throw new FeedbackError('network', messageFor(e, 'No se pudo borrar el mensaje.'))
  }
  try { await db.feedbackMessages.delete(messageId) } catch { /* noop */ }
}
