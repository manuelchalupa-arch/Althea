import { useState, useEffect } from 'react'
import { X, Send, Mail, Trash2 } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { IconChatBubble } from '@/components/brand/FitnessIcons'
import { streamChat, isChatAvailable, type ChatCompletionMessage } from '@/services/ai/chatService'
import { getActiveConversation, saveMessage, getMessages, type ChatMessage } from '@/services/ai/chatHistory'

import { createThread } from '@/services/feedback/feedbackService'
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from '@/services/feedback/feedbackTypes'

type FeedbackType = FeedbackCategory

const initialFeedbackType: FeedbackType = FEEDBACK_CATEGORIES[0]?.value ?? 'otro'

interface FeedbackFormState {
  type: FeedbackType
  subject: string
  content: string
  isSubmitting: boolean
  submittingError: string | null
  /** Aviso de envío pendiente (sin conexión): el borrador se conserva. */
  notice: string | null
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FeedbackFormState>({
    type: initialFeedbackType,
    subject: '',
    content: '',
    isSubmitting: false,
    submittingError: null,
    notice: null,
  })

  const [openChat, setOpenChat] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  useEffect(() => {
    if (openChat) {
      loadMessages()
    }
  }, [openChat])

  const loadMessages = async () => {
    try {
      const convId = await getActiveConversation('coach')
      setConversationId(convId)
      const msgs = await getMessages(convId)
      setMessages(msgs)
    } catch {
      setError('No se pudo cargar el historial')
    }
  }

  const handleClearHistory = async () => {
    try {
      const convId = conversationId ?? await getActiveConversation('coach')
      const { clearConversation } = await import('@/services/ai/chatHistory')
      await clearConversation(convId)
      setMessages([])
      setConversationId(null)
    } catch {
      setError('No se pudo borrar el historial')
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) {return}

    setInput('')
    setError(null)
    setLoading(true)

    try {
      const convId = await getActiveConversation('coach')
      await saveMessage({ conversationId: convId, role: 'user', content: text, createdAt: new Date().toISOString() })

      const history: ChatCompletionMessage[] = [
        ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: text },
      ]

      let assistantContent = ''
      await streamChat(
        history,
        {
          onToken: (token) => {
            assistantContent += token
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last?.role === 'assistant') {
                return [...prev.slice(0, -1), { ...last, content: assistantContent }]
              }
              return [...prev, { id: 'streaming', conversationId: convId, role: 'assistant', content: assistantContent, createdAt: new Date().toISOString() }]
            })
          },
          onDone: async (fullText) => {
            await saveMessage({ conversationId: convId, role: 'assistant', content: fullText, createdAt: new Date().toISOString() })
            setLoading(false)
          },
          onError: (err) => {
            setError(err)
            setLoading(false)
          },
        },
      )
    } catch {
      setError('No se pudo enviar el mensaje')
      setLoading(false)
    }
  }

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.subject.trim() || !form.content.trim()) {return}

    setForm((prev) => ({ ...prev, isSubmitting: true, submittingError: null, notice: null }))

    try {
      const res = await createThread({
        category: form.type,
        subject: form.subject.trim(),
        text: form.content.trim(),
      })
      if (res.delivery === 'error') {
        // Error real de Firestore: se informa y el borrador queda en pie.
        setForm((prev) => ({ ...prev, isSubmitting: false, submittingError: res.error || 'No se pudo enviar. Intentá de nuevo.' }))
        return
      }
      if (res.delivery === 'pending') {
        // Sin conexión: NO es éxito. Borrador conservado, se reenvía solo.
        setForm((prev) => ({ ...prev, isSubmitting: false, notice: res.reason || 'Sin conexión: se enviará al volver la conexión.' }))
        return
      }
      setForm({ type: initialFeedbackType, subject: '', content: '', isSubmitting: false, submittingError: null, notice: null })
      setOpen(false)
    } catch {
      setForm((prev) => ({ ...prev, isSubmitting: false, submittingError: 'No se pudo enviar. Intentá de nuevo.' }))
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`fixed z-50 flex items-center justify-center rounded-full shadow-al-md transition-all duration-200 ${
          open
            ? 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 w-12 h-12 bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            : 'fab-feedback right-4 w-14 h-14 bg-success text-on-success hover:scale-105 md:right-4'
        }`}
        aria-label={open ? 'Cerrar feedback' : 'Abrir feedback'}
      >
        {open ? <X size={20} /> : <Mail size={24} className="w-6 h-6" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8 pointer-events-none">
          <div className="relative w-full max-w-lg mx-4 pt-8 pb-8 bg-surface rounded-3xl border border-outline-variant shadow-xl overflow-hidden">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface">
              <X size={24} />
            </button>

            <form onSubmit={handleFeedbackSubmit} className="space-y-6">
              <div>
                <label htmlFor="fb-type" className="block text-[10px] font-medium uppercase tracking-widest text-on-surface-variant mb-1">
                  Tipo
                </label>
                <select
                  id="fb-type"
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as FeedbackType }))}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary/50 disabled:opacity-50"
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fb-subject" className="block text-[10px] font-medium uppercase tracking-widest text-on-surface-variant mb-1">
                  Asunto
                </label>
                <input
                  id="fb-subject"
                  value={form.subject}
                  onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-sm text-on-surface focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  placeholder="Asunto del reporte"
                  maxLength={100}
                />
              </div>

              <div>
                <label htmlFor="fb-content" className="block text-[10px] font-medium uppercase tracking-widest text-on-surface-variant mb-1">
                  Descripción
                </label>
                <textarea
                  id="fb-content"
                  value={form.content}
                  onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-4 text-sm text-on-surface h-[120px] resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
                  placeholder="Describe tu reporte con el máximo de detalle"
                />
              </div>

              {form.submittingError && (
                <p className="text-xs text-error" role="alert">{form.submittingError}</p>
              )}
              {form.notice && (
                <p className="text-xs text-tertiary" role="status">{form.notice}</p>
              )}

              <button
                type="submit"
                disabled={form.isSubmitting}
                className="w-full py-3 rounded-xl bg-success text-on-success font-medium uppercase tracking-widest transition-colors hover:bg-success/90 disabled:opacity-50"
              >
                {form.isSubmitting ? 'Enviando…' : 'Enviar reporte'}
              </button>
            </form>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpenChat(!openChat)}
        className={`fixed z-50 flex items-center justify-center rounded-full shadow-al-md transition-all duration-200 ${
          openChat
            ? 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 w-12 h-12 bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            : 'fab-chat right-4 w-14 h-14 bg-primary text-on-primary hover:scale-105 md:right-4'
        }`}
        aria-label={openChat ? 'Cerrar chat' : 'Abrir chat'}
      >
        {openChat ? <X size={20} /> : <IconChatBubble className="w-6 h-6" />}
      </button>

      {openChat && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8 pointer-events-none">
          <div className="relative w-full max-w-md mx-4 pt-8 pb-8 bg-surface rounded-3xl border border-outline-variant shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full overflow-hidden shrink-0">
                  <BrandIcon name="coach" size={28} className="w-full h-full object-cover" />
                </span>
                <div>
                  <div className="text-body font-medium text-sm">Coach IA</div>
                  <div className="text-aux text-[10px]">
                    {isChatAvailable() ? 'En línea' : 'Sin conexión'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleClearHistory} aria-label="Borrar historial" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition">
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setOpenChat(false)} aria-label="Cerrar" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-on-surface hover:bg-surface-container-low transition">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[400px]">
              {messages.length === 0 && (
                <p className="text-on-surface-variant text-sm text-center py-8">Preguntale algo al Coach</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-low text-on-surface'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-surface-container-low rounded-2xl px-4 py-2.5 text-sm text-on-surface-variant">
                    Escribiendo…
                  </div>
                </div>
              )}
            </div>

            <div className="px-3 py-3 border-t border-outline-variant bg-surface">
              {error && <p className="text-xs text-error mb-2" role="alert">{error}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleSend() } }}
                  placeholder="Escribí tu mensaje…"
                  aria-label="Mensaje para el Coach"
                  className="flex-1 bg-surface-container-low border border-outline-variant rounded-xl px-3 py-3 min-h-[48px] text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 transition hover:brightness-110"
                  aria-label="Enviar mensaje"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
