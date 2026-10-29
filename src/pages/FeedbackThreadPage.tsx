import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useFeedbackActor } from '@/hooks/useFeedbackActor'
import {
  getThread,
  listThreadMessages,
  markThreadRead,
  sendThreadMessage,
  setThreadStatus,
} from '@/services/feedback/feedbackService'
import type {
  FeedbackLocalMessage,
  FeedbackStatus,
  FeedbackThread,
} from '@/services/feedback/feedbackTypes'
import { CategoryBadge, StatusBadge, SyncChip } from '@/components/feedback/parts'
import { formatStamp } from '@/components/feedback/format'

function ownerLabel(t: FeedbackThread): string {
  return t.ownerName || t.ownerEmail || `${t.ownerId.slice(0, 8)}…`
}

/** Conversación completa de un hilo. El admin ve identidad + acciones de
 *  estado; el usuario normal solo lectura (su hilo). */
export default function FeedbackThreadPage() {
  const { id } = useParams<{ id: string }>()
  const { actor, loading: actorLoading } = useFeedbackActor()
  const [thread, setThread] = useState<FeedbackThread | null>(null)
  const [messages, setMessages] = useState<FeedbackLocalMessage[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const isAdmin = !!actor?.isAdmin
  const scope = isAdmin ? 'admin' : 'owner'

  useEffect(() => {
    if (actorLoading || !actor || !id) { return }
    let alive = true
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const [t, msgs] = await Promise.all([getThread(id), listThreadMessages(id, scope)])
        if (!alive) { return }
        setThread(t)
        setMessages(msgs)
        setLoading(false)
        // Lectura: cada lector solo baja sus propios contadores (reglas).
        const side = isAdmin ? 'admin' : 'owner'
        const unread = msgs
          .filter((m) => (isAdmin
            ? m.authorRole === 'user' && !m.readByAdmin
            : m.authorRole === 'admin' && !m.readByOwner))
          .map((m) => m.id)
        if (unread.length > 0) { void markThreadRead(id, side, unread) }
      } catch (e) {
        if (!alive) { return }
        setError((e as { message?: string })?.message || 'No se pudo cargar la conversación.')
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [id, actor, actorLoading, isAdmin, scope])

  const handleStatus = (status: FeedbackStatus) => {
    if (!id) { return }
    setThreadStatus(id, status)
      .then(() => setThread((t) => (t ? { ...t, status } : t)))
      .catch((e) => setError((e as { message?: string })?.message || 'No se pudo cambiar el estado.'))
  }

  /** Responder al hilo (rol según quién escribe: admin o dueño). */
  const handleReply = async () => {
    if (!thread || !reply.trim() || sending) { return }
    setSending(true)
    setError('')
    try {
      const res = await sendThreadMessage({ thread, text: reply.trim(), role: isAdmin ? 'admin' : 'user' })
      if (res.delivery === 'sent' || res.delivery === 'pending') {
        const local: FeedbackLocalMessage = {
          id: res.messageId, threadId: thread.id, ownerId: thread.ownerId,
          authorId: actor?.uid || '', authorRole: isAdmin ? 'admin' : 'user',
          text: reply.trim(), createdAt: new Date().toISOString(),
          readByOwner: !isAdmin, readByAdmin: isAdmin,
          syncStatus: res.delivery === 'sent' ? 'synced' : 'pending',
        }
        setMessages((ms) => [...ms, local])
        setReply('')
      } else {
        setError(res.error || 'No se pudo enviar la respuesta.')
      }
    } catch (e) {
      setError((e as { message?: string })?.message || 'No se pudo enviar la respuesta.')
    } finally {
      setSending(false)
    }
  }

  if (actorLoading) {
    return <p className="text-on-surface-variant py-8 text-center">Cargando…</p>
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-6 max-w-2xl">
        <Link to="/feedback" className="text-primary hover:underline text-sm">
          ← Volver
        </Link>

        {loading && <p className="text-on-surface-variant mt-4">Cargando conversación…</p>}

        {!loading && error && (
          <div className="mt-4">
            <p className="text-on-surface-variant">{error}</p>
          </div>
        )}

        {!loading && !error && thread && (
          <>
            <header className="mt-4 mb-5">
              <h1 className="text-xl font-semibold text-on-surface">{thread.subject || 'Sin asunto'}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <CategoryBadge category={thread.category} />
                <StatusBadge status={thread.status} />
              </div>
              {isAdmin && (
                <p className="text-on-surface-variant text-xs mt-2">
                  Usuario: {ownerLabel(thread)}
                </p>
              )}
            </header>

            <section className="space-y-3">
              {messages.map((m) => {
                const isMe = m.authorId === actor?.uid
                const label = isMe
                  ? 'Tú'
                  : m.authorRole === 'admin'
                    ? 'Administración'
                    : 'Usuario'
                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg bg-surface-container${m.authorRole === 'admin' ? ' border-l-4 border-primary' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-on-surface">{label}</span>
                      <span className="text-on-surface-variant text-xs">{formatStamp(m.createdAt)}</span>
                    </div>
                    <p className="text-on-surface text-sm whitespace-pre-wrap break-words">{m.text}</p>
                    {m.authorRole === 'user' && (
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        {m.readByAdmin ? '✓ Leído por la administración' : '· enviado'}
                      </p>
                    )}
                    <div className="mt-1">
                      <SyncChip status={m.syncStatus} />
                    </div>
                  </div>
                )
              })}
            </section>

            {/* Estado visible para el dueño: confirmación de trabajo sobre el problema. */}
            {!isAdmin && thread.status !== 'pendiente' && (
              <p className="mt-4 text-sm text-on-surface-variant bg-surface-container p-3 rounded-lg">
                {thread.status === 'en_curso'
                  ? '⚙︎ La administración está trabajando en tu consulta.'
                  : '✓ Tu consulta fue resuelta por la administración.'}
              </p>
            )}

            <section className="mt-6">
              <h2 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                Responder
              </h2>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={isAdmin ? 'Respuesta al usuario…' : 'Escribí tu respuesta…'}
                rows={3}
                maxLength={2000}
                className="w-full bg-surface-container border border-outline-variant rounded-lg p-3 text-sm text-on-surface"
              />
              <button
                onClick={() => { void handleReply() }}
                disabled={!reply.trim() || sending}
                className="mt-2 btn-primary disabled:opacity-40"
              >
                {sending ? 'Enviando…' : 'Enviar respuesta'}
              </button>
              {error && <p className="mt-2 text-sm text-error">{error}</p>}
            </section>

            {isAdmin && (
              <section className="mt-6">
                <h2 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider mb-2">
                  Resolver
                </h2>
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => handleStatus('pendiente')}
                    disabled={thread.status === 'pendiente'}
                    className="text-primary hover:underline text-sm disabled:opacity-40"
                  >
                    Pendiente
                  </button>
                  <button
                    onClick={() => handleStatus('en_curso')}
                    disabled={thread.status === 'en_curso'}
                    className="text-primary hover:underline text-sm disabled:opacity-40"
                  >
                    En curso
                  </button>
                  <button
                    onClick={() => handleStatus('resuelta')}
                    disabled={thread.status === 'resuelta'}
                    className="text-primary hover:underline text-sm disabled:opacity-40"
                  >
                    Resuelta
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
