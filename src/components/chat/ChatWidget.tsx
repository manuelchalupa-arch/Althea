import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { X, Send, Trash2, Bot, User } from 'lucide-react'
import { IconChatBubble } from '@/components/brand/FitnessIcons'
import { streamChat, isChatAvailable, type ChatCompletionMessage } from '@/services/ai/chatService'
import { buildChatContext } from '@/services/ai/chatContext'
import { getActiveConversation, saveMessage, getMessages, clearAllChats, type ChatMessage } from '@/services/ai/chatHistory'
import { getUsage, getResetInfo } from '@/services/ai/groqUsage'

const PAGE_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/entrenar': 'Entrenamiento',
  '/rutina': 'Rutinas',
  '/rutinas': 'Rutinas',
  '/nutricion': 'Nutrición',
  '/recuperacion': 'Recuperación',
  '/progresos': 'Progreso',
  '/progreso': 'Progreso',
  '/coach': 'Coach IA',
  '/calendario': 'Calendario',
  '/perfil': 'Perfil',
  '/biblioteca': 'Biblioteca',
  '/mas': 'Más',
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [pageContext, setPageContext] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const [usage, setUsage] = useState(() => getUsage())
  const [resetInfo] = useState(() => getResetInfo())

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, streamText, scrollToBottom])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setUsage(getUsage())
    }
  }, [open])

  // Refresh usage every 10s while open
  useEffect(() => {
    if (!open) {return}
    const id = setInterval(() => setUsage(getUsage()), 10_000)
    return () => clearInterval(id)
  }, [open])

  useEffect(() => {
    const label = PAGE_LABELS[location.pathname] || location.pathname
    setPageContext(label)
    const init = async () => {
      const convId = await getActiveConversation(label)
      setConversationId(convId)
      const hist = await getMessages(convId)
      setMessages(hist)
    }
    init()
  }, [location.pathname])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming || !conversationId) {return}

    setInput('')
    const userMsg = await saveMessage({
      conversationId, role: 'user', content: text, createdAt: new Date().toISOString()
    })
    setMessages(prev => [...prev, userMsg])

    const context = await buildChatContext(pageContext)
    const history: ChatCompletionMessage[] = messages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant', content: m.content
    }))

    const userWithContext = context
      ? `[Contexto del usuario - ${pageContext}]\n${context}\n\n[Pregunta del usuario]\n${text}`
      : text

    const apiMessages: ChatCompletionMessage[] = [
      ...history,
      { role: 'user', content: userWithContext },
    ]

    setStreaming(true)
    setStreamText('')

    await streamChat(apiMessages, {
      onToken: (token) => setStreamText(prev => prev + token),
      onDone: async (fullText) => {
        setStreamText('')
        setStreaming(false)
        setUsage(getUsage())
        const assistantMsg = await saveMessage({
          conversationId, role: 'assistant', content: fullText, createdAt: new Date().toISOString()
        })
        setMessages(prev => [...prev, assistantMsg])
      },
      onError: async (error) => {
        setStreamText('')
        setStreaming(false)
        const errMsg = await saveMessage({
          conversationId, role: 'assistant', content: `⚠️ ${error}`, createdAt: new Date().toISOString()
        })
        setMessages(prev => [...prev, errMsg])
      },
    })
  }

  const handleClear = async () => {
    if (!confirm('¿Borrar todo el historial de chat?')) {return}
    await clearAllChats()
    setMessages([])
    const newId = await getActiveConversation(pageContext)
    setConversationId(newId)
  }

  const available = isChatAvailable()

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          open
            ? 'bottom-6 right-6 w-12 h-12 bg-surface border border-border text-textMuted hover:bg-elevated'
            : 'bottom-20 right-4 w-14 h-14 bg-action text-textMain hover:scale-105 md:bottom-8 md:right-8'
        }`}
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {open ? <X size={20} /> : <IconChatBubble className="w-6 h-6" />}
      </button>
      {!open && (
        <Link
          to="/coach"
          aria-label="Abrir Coach"
          title="Coach"
          className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-200 bottom-36 right-4 w-12 h-12 bg-surface border border-border text-textMuted hover:bg-elevated md:bottom-8 md:right-24"
        >
          <Bot size={18} />
        </Link>
      )}

      {/* Chat overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-4 pb-24 md:p-8 md:pb-24 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md h-[75vh] md:h-[70vh] flex flex-col bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-info" />
                <div>
                  <div className="text-body font-medium text-sm">Althea</div>
                  <div className="text-aux text-[10px] flex items-center gap-1.5">
                    {pageContext}
                    {available && (
                      <span className="inline-flex items-center gap-1" title={`${usage.dayUsed}/${usage.dayTotal} mensajes hoy · Se renueva en ${resetInfo.nextDayReset}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${usage.dayPct >= 90 ? 'bg-red-400' : usage.dayPct >= 70 ? 'bg-amber-400' : 'bg-green-400'}`} />
                        <span className="text-textMuted">{usage.dayUsed}/{usage.dayTotal}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleClear} aria-label="Borrar historial" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-textMuted hover:bg-bg transition" title="Borrar historial">
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-textMain hover:bg-bg transition">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {!available && (
                <div className="rounded-xl bg-surface border border-border p-3 text-textMain text-sm">
                  El Coach IA no está disponible en este momento.
                </div>
              )}
              {messages.length === 0 && available && (
                <div className="text-center py-8">
                  <Bot size={32} className="mx-auto text-textMuted mb-2" />
                  <p className="text-textMain text-sm">¿En qué puedo ayudarte?</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-info/20 flex items-center justify-center shrink-0 mt-1">
                      <Bot size={14} className="text-info" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm font-medium ${
                    msg.role === 'user'
                      ? 'bg-action text-textMain'
                      : 'bg-bg border border-border text-textMain'
                  }`}>
                    {msg.content.split('\n').map((line, i) => (
                      <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-surface border border-border flex items-center justify-center shrink-0 mt-1">
                      <User size={14} className="text-textMuted" />
                    </div>
                  )}
                </div>
              ))}
              {streaming && streamText && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-info/20 flex items-center justify-center shrink-0 mt-1">
                    <Bot size={14} className="text-info" />
                  </div>
                  <div className="max-w-[80%] rounded-xl px-3 py-2 text-sm bg-surface border border-border text-textMain">
                    {streamText}
                    <span className="inline-block w-1.5 h-4 bg-info/60 ml-0.5 animate-pulse rounded-sm" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-border bg-surface">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage() }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={available ? 'Escribí tu mensaje…' : 'Chat no disponible'}
                  disabled={streaming || !available}
                  maxLength={500}
                  aria-label="Mensaje para el Coach"
                  className="flex-1 bg-bg border border-border rounded-xl px-3 py-3 min-h-[48px] text-sm text-textMain placeholder:text-textMuted focus:outline-none focus:border-info/50 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || streaming || !available}
                  aria-label="Enviar mensaje"
                  className="w-12 h-12 rounded-xl bg-action text-textMain flex items-center justify-center disabled:opacity-40 transition hover:brightness-110"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
