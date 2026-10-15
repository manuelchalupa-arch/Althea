import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeedbackActor } from '@/hooks/useFeedbackActor'
import {
  listAllThreads,
  setThreadStatus,
  markThreadRead,
  deleteMessage,
} from '@/services/feedback/feedbackService'
import {
  FeedbackThread,
  FeedbackCategory,
  FeedbackStatus,
  FEEDBACK_CATEGORIES,
} from '@/services/feedback/feedbackTypes'
import { StatusBadge } from '@/components/feedback/parts'
import { formatActivity } from '@/components/feedback/format'

export default function AdminFeedback() {
  const { actor } = useFeedbackActor()
  const navigate = useNavigate()
  const [threads, setThreads] = useState<Array<FeedbackThread>>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  useEffect(() => {
    if (!actor?.isAdmin) {
      return
    }
    listAllThreads().then(setThreads).catch(() => setThreads([]))
  }, [actor])

  const handleSetStatus = (threadId: string, status: FeedbackStatus) => {
    setThreadStatus(threadId, status).then(() => {
      listAllThreads().then(setThreads).catch(() => {})
    })
  }

  const handleMarkRead = (threadId: string) => {
    markThreadRead(threadId, 'admin', []).then(() => {
      listAllThreads().then(setThreads).catch(() => {})
    })
  }

  const handleDeleteMessage = (threadId: string, messageId: string) => {
    deleteMessage(threadId, messageId).then(() => {
      listAllThreads().then(setThreads).catch(() => {})
    })
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-on-surface">Bandeja de feedback</h1>
          <p className="text-on-surface-variant">Administración de hilos y mensajes</p>
        </header>

        <section className="mb-4">
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En curso</option>
              <option value="resuelta">Resuelta</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Todas las categorías</option>
              {FEEDBACK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {threads.length === 0 && (
          <p className="text-on-surface-variant mt-4">No hay hilos con los filtros aplicados.</p>
        )}

        <section>
          <h2 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider mb-3">
            Hilos ({threads.length})
          </h2>
          <div className="space-y-3">
            {threads.map((thread) => {
              const statusMatch =
                filterStatus === 'all' || thread.status === (filterStatus as FeedbackStatus)
              const categoryMatch =
                filterCategory === 'all' || thread.category === (filterCategory as FeedbackCategory)
              if (!statusMatch || !categoryMatch) { return null }

              const threadAny = thread as any
              return (
                <div key={thread.id} className="p-3 rounded bg-surface-container">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-on-surface">
                      {thread.subject || 'Sin asunto'}
                    </span>
                    <StatusBadge status={thread.status} />
                  </div>
                  <p className="text-on-surface-variant text-sm line-clamp-2">
                    {thread.lastMessagePreview || '—'}
                  </p>
                  <div className="text-on-surface-variant text-xs">
                    {formatActivity(thread.updatedAt)} ·
                    {thread.unreadForOwner > 0 ? '(sin leer para usuario)' : ''}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => handleSetStatus(thread.id, 'en_curso')}
                      className="text-primary hover:underline text-xs"
                    >
                      Marcar en curso
                    </button>
                    <button
                      onClick={() => handleSetStatus(thread.id, 'resuelta')}
                      className="text-primary hover:underline text-xs"
                    >
                      Marcar resuelta
                    </button>
                    {actor?.isAdmin && (
                      <>
                        <button
                          onClick={() => handleMarkRead(thread.id)}
                          className="text-primary hover:underline text-xs"
                        >
                          Marcar leído
                        </button>
                        {thread.messageCount && (
                          <button
                            onClick={() => handleDeleteMessage(thread.id, threadAny.messages?.[0]?.id || '')}
                            className="text-danger hover:underline text-xs"
                          >
                            Eliminar mensaje
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {actor?.isAdmin && (
                    <div className="mt-2 text-on-surface-variant text-xs">
                      {threadAny.internalNotes?.length
                        ? `Nota interna: ${threadAny.internalNotes.length} nota(s)`
                        : 'Sin notas internas'}
                    </div>
                  )}
                  <button
                    onClick={() => navigate(`/feedback/thread/${thread.id}`)}
                    className="mt-1 text-primary hover:underline text-xs block"
                  >
                    Ver mensajes
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}