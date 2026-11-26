import { useState, useEffect, useRef } from 'react'
import { X, Send, Trash2 } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { IconChatBubble } from '@/components/brand/FitnessIcons'
import { streamChat, isChatAvailable, type ChatCompletionMessage } from '@/services/ai/chatService'
import { getActiveConversation, saveMessage, getMessages, type ChatMessage } from '@/services/ai/chatHistory'

export default function ChatWidget() {
  const [openChat, setOpenChat] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)

  // La carga del historial es async: no actualizar el estado si el widget
  // se desmonta antes de que Dexie termine de responder.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      document.documentElement.removeAttribute('data-chat-open')
    }
  }, [])

  // El CSS usa esta marca para retirar el FAB de Feedback mientras el chat
  // está abierto. La marca se limpia siempre al cerrar o desmontar el widget.
  useEffect(() => {
    const root = document.documentElement
    if (openChat) {
      root.setAttribute('data-chat-open', 'true')
    } else {
      root.removeAttribute('data-chat-open')
    }
    return () => root.removeAttribute('data-chat-open')
  }, [openChat])

  // El botón de chat del AppHeader (temple.tsx) abre este mismo panel.
  useEffect(() => {
    const openFromHeader = () => setOpenChat(true)
    window.addEventListener('althea:open-chat', openFromHeader)
    return () => window.removeEventListener('althea:open-chat', openFromHeader)
  }, [])

  const loadMessages = async () => {
    try {
      const convId = await getActiveConversation('coach')
      if (!mountedRef.current) { return }
      setConversationId(convId)
      const msgs = await getMessages(convId)
      if (!mountedRef.current) { return }
      setMessages(msgs)
    } catch {
      if (mountedRef.current) { setError('No se pudo cargar el historial') }
    }
  }

  useEffect(() => {
    if (openChat) { void loadMessages() }
  }, [openChat])

  const handleClearHistory = async () => {
    if (messages.length === 0) { return }
    if (!window.confirm('¿Borrar toda la conversación con el Coach? Esta acción no se puede deshacer.')) { return }
    try {
      const convId = conversationId ?? await getActiveConversation('coach')
      const { clearConversation } = await import('@/services/ai/chatHistory')
      await clearConversation(convId)
      if (!mountedRef.current) { return }
      setMessages([])
      setConversationId(null)
      setError(null)
    } catch {
      if (mountedRef.current) { setError('No se pudo borrar la conversación') }
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) { return }

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
            if (!mountedRef.current) { return }
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
            if (mountedRef.current) { setLoading(false) }
          },
          onError: (err) => {
            if (!mountedRef.current) { return }
            setError(err)
            setLoading(false)
          },
        },
      )
    } catch {
      if (!mountedRef.current) { return }
      setError('No se pudo enviar el mensaje')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpenChat(!openChat)}
        className={`fixed z-50 fab-chat-stack right-4 flex items-center justify-center rounded-full shadow-al-md transition-all duration-200 ${
          openChat
            ? 'w-11 h-11 bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            : 'fab-chat w-12 h-12 md:w-14 md:h-14 bg-primary text-on-primary hover:scale-105 md:right-4'
        }`}
        aria-label={openChat ? 'Cerrar chat' : 'Abrir chat'}
      >
        {openChat ? <X size={20} /> : <IconChatBubble className="w-6 h-6" />}
      </button>

      {openChat && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-2 pb-[calc(var(--mobile-nav-offset)+0.75rem)] md:p-8 md:pb-8 pointer-events-none">
          <div className="relative flex w-full max-w-md max-h-[82dvh] mx-2 md:mx-4 flex-col bg-surface rounded-3xl border border-outline-variant shadow-xl overflow-hidden pointer-events-auto">
            <div className="flex shrink-0 items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface">
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
                <button onClick={handleClearHistory} disabled={messages.length === 0} aria-label="Borrar conversación" title="Borrar conversación" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-on-surface-variant hover:bg-surface-container-low hover:text-error transition disabled:opacity-40">
                  <Trash2 size={18} />
                </button>
                <button onClick={() => setOpenChat(false)} aria-label="Cerrar ventana del chat" title="Cerrar chat" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-on-surface hover:bg-surface-container-low transition">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[120px] overflow-y-auto px-4 py-3 space-y-3 max-h-[45dvh]">
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

            <div className="shrink-0 px-3 py-3 border-t border-outline-variant bg-surface">
              {error && <p className="text-xs text-error mb-2" role="alert">{error}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { void handleSend() } }}
                  placeholder="Escribí tu mensaje…"
                  aria-label="Mensaje para el Coach"
                  className="flex-1 min-w-0 bg-surface-container-low border border-outline-variant rounded-xl px-3 py-3 min-h-[48px] text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={() => { void handleSend() }}
                  disabled={loading || !input.trim()}
                  className="w-12 h-12 min-w-[48px] rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 transition hover:brightness-110"
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
