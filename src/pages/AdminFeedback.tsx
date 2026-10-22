import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFeedbackActor } from '@/hooks/useFeedbackActor'
import { listAllThreads, setThreadStatus } from '@/services/feedback/feedbackService'
import {
  FeedbackThread,
  FeedbackCategory,
  FeedbackStatus,
  FEEDBACK_CATEGORIES,
} from '@/services/feedback/feedbackTypes'
import { StatusBadge, CategoryBadge } from '@/components/feedback/parts'
import { formatActivity } from '@/components/feedback/format'

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'error'

/** Etiqueta de quién escribió el hilo: nombre, correo o prefijo de UID (hilos
 *  antiguos sin identidad denormalizada). */
function ownerLabel(t: FeedbackThread): string {
  return t.ownerName || t.ownerEmail || `${t.ownerId.slice(0, 8)}…`
}

export default function AdminFeedback() {
  const { actor, loading } = useFeedbackActor()
  const navigate = useNavigate()
  const [threads, setThreads] = useState<Array<FeedbackThread>>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [state, setState] = useState<LoadState>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (loading) { return }
    if (!actor?.isAdmin) {
      setThreads([])
      setState('unauthorized')
      return
    }
    let alive = true
    setState('loading')
    listAllThreads()
      .then((t) => { if (alive) { setThreads(t); setState('ready') } })
      .catch((e) => {
        if (!alive) { return }
        setThreads([])
        setState(e?.code === 'permission' ? 'unauthorized' : 'error')
      })
    return () => { alive = false }
  }, [actor, loading, reloadKey])

  const handleSetStatus = (threadId: string, status: FeedbackStatus) => {
    setThreadStatus(threadId, status)
      .then(() => listAllThreads())
      .then(setThreads)
      .catch(() => setReloadKey((k) => k + 1))
  }

  if (state === 'unauthorized') {
    return (
      <div className="min-h-screen bg-surface">
        <div className="mx-auto px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-6 max-w-lg text-center">
          <h1 className="text-2xl font-semibold text-on-surface mb-2">No autorizado</h1>
          <p className="text-on-surface-variant mb-4">
            Esta bandeja es solo para la administración de Althea.
          </p>
          <Link to="/feedback" className="btn-primary inline-block">Ir a Feedback</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-on-surface">Bandeja de feedback</h1>
          <p className="text-on-surface-variant">Reportes de los usuarios de Althea</p>
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

        {state === 'loading' && (
          <p className="text-on-surface-variant mt-4">Cargando bandeja…</p>
        )}

        {state === 'error' && (
          <div className="mt-4">
            <p className="text-on-surface-variant">No se pudo leer la bandeja. Revisá tu conexión.</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-2 text-primary hover:underline text-sm"
            >
              Reintentar
            </button>
          </div>
        )}

        {state === 'ready' && threads.length === 0 && (
          <p className="text-on-surface-variant mt-4">Todavía no hay reportes de usuarios.</p>
        )}

        {state === 'ready' && threads.length > 0 && (
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

                return (
                  <div key={thread.id} className="p-3 rounded bg-surface-container">
                    <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                      <span className="font-medium text-on-surface">
                        {thread.subject || 'Sin asunto'}
                      </span>
                      <StatusBadge status={thread.status} />
                    </div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <CategoryBadge category={thread.category} />
                      <span className="text-on-surface-variant text-xs">
                        Usuario: {ownerLabel(thread)}
                      </span>
                    </div>
                    <p className="text-on-surface-variant text-sm line-clamp-2">
                      {thread.lastMessagePreview || '—'}
                    </p>
                    <div className="text-on-surface-variant text-xs mt-1">
                      {formatActivity(thread.updatedAt)}
                      {thread.unreadForAdmin > 0 ? ' · sin leer' : ''}
                    </div>
                    <div className="mt-2 flex gap-3">
                      <button
                        onClick={() => handleSetStatus(thread.id, 'en_curso')}
                        disabled={thread.status === 'en_curso'}
                        className="text-primary hover:underline text-xs disabled:opacity-40"
                      >
                        Marcar en curso
                      </button>
                      <button
                        onClick={() => handleSetStatus(thread.id, 'resuelta')}
                        disabled={thread.status === 'resuelta'}
                        className="text-primary hover:underline text-xs disabled:opacity-40"
                      >
                        Marcar resuelta
                      </button>
                      <button
                        onClick={() => navigate(`/feedback/thread/${thread.id}`)}
                        className="text-primary hover:underline text-xs"
                      >
                        Ver conversación
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
