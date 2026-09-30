import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { X, Send, Trash2, Bot, User } from 'lucide-react'
import BrandIcon from '@/components/brand/BrandIcon'
import { AltheaAvatar } from '@/components/brand/AltheaAvatar'
import { IconChatBubble } from '@/components/brand/FitnessIcons'
import { streamChat, isChatAvailable, type ChatCompletionMessage } from '@/services/ai/chatService'
import {
  prepareUnifiedContext,
  buildUnifiedSystemPrompt,
  composeUnifiedLocalReply,
  validateUnifiedAnswer,
} from '@/services/ai/unifiedPipeline'
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
      const convId = await getActiveConversation('unified')
      setConversationId(convId)
      const hist = await getMessages(convId)
      setMessages(hist)
    }
    init()
  }, [location.pathname])

  const runLocalReply = async (text: string) => {
    try {
      const prep = await prepareUnifiedContext(text)
      const reply = await composeUnifiedLocalReply(text, prep)
      const assistantMsg = await saveMessage({
        conversationId, role: 'assistant', content: reply.text, createdAt: new Date().toISOString(), source: reply.source,
        sources: reply.sourcesUsed.map(s => s.id),
      })
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errMsg = await saveMessage({
        conversationId, role: 'assistant', content: '⚠️ No pude procesar tu mensaje ahora. Revisá tu conexión y probá de nuevo.', createdAt: new Date().toISOString(),
      })
      setMessages(prev => [...prev, errMsg])
    } finally {
      setStreamText('')
      setStreaming(false)
      setUsage(getUsage())
    }
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || streaming || !conversationId) {return}

    setInput('')
    const userMsg = await saveMessage({
      conversationId, role: 'user', content: text, createdAt: new Date().toISOString()
    })
    setMessages(prev => [...prev, userMsg])

    if (!available) { await runLocalReply(text); return }

    const prep = await prepareUnifiedContext(text)
    const history: ChatCompletionMessage[] = messages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant', content: m.content
    }))

    const apiMessages: ChatCompletionMessage[] = [
      ...history,
      { role: 'user', content: text },
    ]

    setStreaming(true)
    setStreamText('')

    try {
      await streamChat(apiMessages, {
        onToken: (token) => setStreamText(prev => prev + token),
        onDone: async (fullText) => {
          setStreamText('')
          setStreaming(false)
          setUsage(getUsage())
          const validated = validateUnifiedAnswer(fullText, prep.evidence)
          const assistantMsg = await saveMessage({
            conversationId, role: 'assistant', content: validated.text, createdAt: new Date().toISOString(), source: 'groq',
            sources: validated.sourcesUsed.map(s => s.id),
          })
          setMessages(prev => [...prev, assistantMsg])
        },
        onError: async () => {
          await runLocalReply(text)
        },
      }, { systemPrompt: buildUnifiedSystemPrompt(prep) })
    } catch {
      await runLocalReply(text)
    }
  }

  const handleClear = async () => {
    if (!confirm('¿Borrar todo el historial de chat?')) {return}
    await clearAllChats()
    setMessages([])
    const newId = await getActiveConversation(pageContext)
    setConversationId(newId)
  }

  const available = isChatAvailable()

  if (location.pathname === '/coach') {return null}

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed z-50 flex items-center justify-center rounded-full shadow-al-md transition-all duration-200 ${
          open
            ? 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 w-12 h-12 bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 w-14 h-14 bg-primary text-on-primary hover:scale-105 md:bottom-8 md:right-4'
        }`}
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
      >
        {open ? <X size={20} /> : <IconChatBubble className="w-6 h-6" />}
      </button>
      {!open && (
        <Link
          to="/coach"
          aria-label="Abrir Coach"
          title="Coach"
          className="fixed z-50 flex items-center justify-center rounded-full shadow-al-md transition-all duration-200 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-4 w-12 h-12 bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container-high md:bottom-8 md:right-24"
        >
          <AltheaAvatar context="coach" size={40} alt="Abrir Coach" />
        </Link>
      )}

      {/* Chat overlay */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-md h-[75vh] md:h-[70vh] flex flex-col bg-surface border border-outline-variant rounded-2xl shadow-al-lg overflow-hidden fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full overflow-hidden shrink-0"><BrandIcon name="coach" size={28} className="w-full h-full object-cover" /></span>
                <div>
                  <div className="text-body font-medium text-sm">Althea</div>
                  <div className="text-aux text-[10px] flex items-center gap-1.5">
                    {pageContext}
                    {available && (
                      <span className="inline-flex items-center gap-1" title={`${usage.dayUsed}/${usage.dayTotal} mensajes hoy · Se renueva en ${resetInfo.nextDayReset}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${usage.dayPct >= 90 ? 'bg-error' : usage.dayPct >= 70 ? 'bg-tertiary' : 'bg-secondary'}`} />
                        <span className="text-on-surface-variant">{usage.dayUsed}/{usage.dayTotal}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleClear} aria-label="Borrar historial" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-on-surface-variant hover:bg-surface-container-low transition" title="Borrar historial">
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg text-on-surface hover:bg-surface-container-low transition">
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {!available && (
                <div className="rounded-xl bg-surface-container-low border border-outline-variant p-3 text-on-surface text-sm">
                  Estás en modo local: respondo con tus datos guardados. Con conexión reactivás el Coach completo.
                </div>
              )}
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <span className="inline-block mb-2"><AltheaAvatar context="empty-state" size={96} alt="Althea" /></span>
                  <p className="text-on-surface text-sm">{available ? '¿En qué puedo ayudarte?' : 'Respondo con tus datos guardados.'}</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-1">
                      <Bot size={14} className="text-secondary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm font-medium ${
                    msg.role === 'user'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-low border border-outline-variant text-on-surface'
                  }`}>
                    {msg.role === 'assistant' && msg.source === 'local' && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="material-symbols-outlined text-[12px] text-tertiary">cloud_off</span>
                        <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">Modo local</span>
                      </div>
                    )}
                    {msg.content.split('\n').map((line, i) => (
                      <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-surface border border-outline-variant flex items-center justify-center shrink-0 mt-1">
                      <User size={14} className="text-on-surface-variant" />
                    </div>
                  )}
                </div>
              ))}
              {streaming && streamText && (
                <div className="flex gap-2 justify-start">
                  <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0 mt-1">
                    <Bot size={14} className="text-secondary" />
                  </div>
                  <div className="max-w-[80%] rounded-xl px-3 py-2 text-sm bg-surface-container-low border border-outline-variant text-on-surface">
                    {streamText}
                    <span className="inline-block w-1.5 h-4 bg-secondary/60 ml-0.5 animate-pulse rounded-sm" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t border-outline-variant bg-surface">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage() }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={available ? 'Escribí tu mensaje…' : 'Modo local — respondo con tus datos'}
                  disabled={streaming}
                  maxLength={500}
                  aria-label="Mensaje para el Coach"
                  className="flex-1 bg-surface-container-low border border-outline-variant rounded-xl px-3 py-3 min-h-[48px] text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary/50 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || streaming}
                  aria-label="Enviar mensaje"
                  className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 transition hover:brightness-110"
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
