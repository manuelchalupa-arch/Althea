import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeedbackActor } from '@/hooks/useFeedbackActor'
import { createThread, listMyThreads } from '@/services/feedback/feedbackService'
import { FeedbackCategory, FEEDBACK_CATEGORIES } from '@/services/feedback/feedbackTypes'
import SemanticIcon from '@/components/ui/SemanticIcon'

export default function Feedback() {
  const { actor, needsAccount } = useFeedbackActor()
  const navigate = useNavigate()
  const [threads, setThreads] = useState<Array<{
    id: string
    subject?: string
    status: string
    unreadForOwner: number
    lastMessagePreview?: string
  }>>([])
  const [category, setCategory] = useState<string>('')
  const [subject, setSubject] = useState<string>('')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    if (needsAccount || !actor?.uid) {
      return
    }
    ;(async () => {
      const { threads } = await listMyThreads()
      setThreads(threads.map((t: any) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        unreadForOwner: t.unreadForOwner,
        lastMessagePreview: t.lastMessagePreview,
      })))
    })()
  }, [needsAccount, actor])

  const handleSend = () => {
    if (!category || !subject || !message || !actor?.uid) { return }
    const cat: FeedbackCategory = category as FeedbackCategory
    createThread({ category: cat, subject, text: message }).then(() => {
      setSubject('')
      setMessage('')
    })
  }

  if (needsAccount) {
    return (
      <div className="p-8 text-center">
        <p className="text-on-surface-variant mb-4">Feedback necesita una cuenta de Althea para enviarse.</p>
        <SemanticIcon name="F" className="text-4xl mb-2" />
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="mt-3 btn-primary"
        >
          Iniciar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-on-surface">Feedback</h1>
          <p className="text-on-surface-variant">Comparte tu experiencia o reporte un problema</p>
        </header>

        <section className="mb-6">
          <h2 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider mb-3">Nuevo hilo</h2>
          <div className="space-y-3">
            <div>
              <label htmlFor="feedback-category" className="block text-on-surface-variant text-sm mb-1">Categoría</label>
              <select
                id="feedback-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Seleccionar categoría</option>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="feedback-subject" className="block text-on-surface-variant text-sm mb-1">Asunto (máx. 120 chars)</label>
              <input
                id="feedback-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, 120))}
                maxLength={120}
                placeholder="Qué pasó?"
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="feedback-message" className="block text-on-surface-variant text-sm mb-1">Mensaje (máx. 2000 chars)</label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                maxLength={2000}
                placeholder="Cuéntanos más..."
                rows={3}
                className="w-full rounded border border-outline-variant bg-surface px-3 py-2 text-on-surface resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!category || !subject || !message || !actor?.uid}
              className="mt-3 btn-primary w-full"
            >
              Enviar hilo
            </button>
          </div>
        </section>

        {threads.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-on-surface-variant uppercase tracking-wider mb-3">Mis hilos</h2>
            <div className="space-y-4">
              {threads.map((thread) => (
                <div key={thread.id} className="p-3 rounded bg-surface-container">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-on-surface">
                      {thread.subject || 'Sin asunto'}
                    </span>
                    <span className="text-on-surface-variant text-xs">
                      {thread.status}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-sm line-clamp-3">
                    {thread.lastMessagePreview || '—'}
                  </p>
                  <div className="text-on-surface-variant text-xs">
                    Hace poco ·
                    {thread.unreadForOwner > 0 ? '(sin leer)' : ''}
                  </div>
                  <button
                    onClick={() => navigate(`/feedback/thread/${thread.id}`)}
                    className="mt-1 text-primary hover:underline text-xs"
                  >
                    Ver hilo
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!actor?.uid && (
          <p className="mt-4 text-on-surface-variant">
            Inicia sesión para ver y enviar feedback.
          </p>
        )}
      </div>
    </div>
  )
}