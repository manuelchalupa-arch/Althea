// Modelo de datos de Feedback (usuario ↔ administrador).
// Estructura Firestore: feedbackThreads/{threadId}
//   ├── messages/{messageId}
//   └── internalNotes/{noteId}   (solo admin)
// La autorización real vive en firestore.rules; estos tipos y límites se
// replican allí y se validan también en cliente (validación temprana, no
// seguridad).

export type FeedbackCategory = 'error' | 'duda' | 'propuesta' | 'otro'

export type FeedbackStatus = 'pendiente' | 'en_curso' | 'resuelta'

export type FeedbackRole = 'user' | 'admin'

export type FeedbackSyncStatus = 'synced' | 'pending' | 'error'

export interface FeedbackThread {
  id: string
  ownerId: string
  category: FeedbackCategory
  subject: string
  status: FeedbackStatus
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  lastMessagePreview: string
  lastMessageAuthorRole: FeedbackRole | null
  messageCount: number
  unreadForOwner: number
  unreadForAdmin: number
}

export interface FeedbackMessage {
  id: string
  threadId: string
  /** Denormalizado del hilo: permite probar propiedad en reglas de list sin get(). */
  ownerId: string
  authorId: string
  authorRole: FeedbackRole
  text: string
  createdAt: string
  readByOwner: boolean
  readByAdmin: boolean
}

export interface FeedbackInternalNote {
  id: string
  threadId: string
  authorId: string
  text: string
  createdAt: string
}

/** Fila local (espejo Dexie) de un mensaje del usuario. */
export interface FeedbackLocalMessage extends FeedbackMessage {
  syncStatus: FeedbackSyncStatus
}

/** Entrada de la cola local de salida (idempotente: id fijo por documento). */
export interface FeedbackOutboxEntry {
  /** `${kind}:${docId}` — determinista, reencolar no duplica. */
  id: string
  kind: 'thread' | 'message'
  /** Id de documento Firestore (hilo o mensaje); fijo, generado en cliente. */
  docId: string
  threadId: string
  /** Documento(s) a escribir; para kind='thread' incluye hilo y primer mensaje. */
  payload: {
    thread?: FeedbackThread
    message?: FeedbackMessage
  }
  status: 'pending' | 'error'
  attempts: number
  error?: string
  createdAt: string
  updatedAt: string
}

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'error', label: 'Error' },
  { value: 'duda', label: 'Duda de funcionamiento' },
  { value: 'propuesta', label: 'Propuesta de mejora' },
  { value: 'otro', label: 'Otro' },
]

export const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'resuelta', label: 'Resuelta' },
]

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  error: 'Error',
  duda: 'Duda de funcionamiento',
  propuesta: 'Propuesta de mejora',
  otro: 'Otro',
}

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  resuelta: 'Resuelta',
}

// Límites espejo de firestore.rules (deben coincidir).
export const MAX_MESSAGE_LEN = 2000
export const MAX_SUBJECT_LEN = 120
export const PREVIEW_LEN = 140

export function isFeedbackCategory(v: unknown): v is FeedbackCategory {
  return v === 'error' || v === 'duda' || v === 'propuesta' || v === 'otro'
}

export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return v === 'pendiente' || v === 'en_curso' || v === 'resuelta'
}

export function previewOf(text: string): string {
  const t = text.trim()
  return t.length > PREVIEW_LEN ? `${t.slice(0, PREVIEW_LEN - 1)}…` : t
}
