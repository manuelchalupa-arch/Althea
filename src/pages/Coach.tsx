import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Brain, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { db } from '@/services/storage/db'
import { getActiveVersion, PROFILE_SCOPE } from '@/services/planning/cycleVersions'
import { METHOD_COACHING_STYLES, resolveCoachTone, type CoachTone } from '@/services/ai/coachPersonality'
import { setCoachMethodView } from '@/services/ai/coachPreferences'
import { TRAINING_METHODS, getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import type { UserProfile, UserProfile as ProfileT } from '@/types'
import { streamChat, isChatAvailable, type ChatCompletionMessage } from '@/services/ai/chatService'
import {
  buildSystemPrompt,
  composeLocalAnswer,
  prepareAnswer,
  validateAnswer,
} from '@/services/ai/answerPipeline'
import { getSourceById } from '@/services/ai/evidence'
import { getActiveConversation, saveMessage, getMessages, clearConversation, type ChatMessage } from '@/services/ai/chatHistory'
import { getUsage, getResetInfo } from '@/services/ai/groqUsage'
import { AltheaBadge, AltheaButton, AltheaCard, AltheaCardHeader, AltheaEmpty, AltheaLoading } from '@/components/althea'
import { SCIENTIFIC_SOURCES, calculateCalorieExpenditure } from '@/services/ai/metExpenditure'

const PAGE_CONTEXT = 'Coach IA'

interface RoutineTip { title: string; detail: string }
interface PostWorkoutTip { title: string; detail: string; priority: 'high' | 'medium' }

const QUICK_ACTIONS = [
  { label: 'Analizá mi última sesión', prompt: 'Analizá mi última sesión de entrenamiento y decime qué mejorar.', icon: 'insights' },
  { label: 'Sugerime qué comer hoy', prompt: '¿Qué opciones de comida me recomendás para hoy según mi objetivo y lo que ya registré?', icon: 'restaurant' },
  { label: 'Cómo entreno esta semana', prompt: '¿Cómo debería entrenar esta semana según mi método y mi recuperación?', icon: 'fitness_center' },
]

function generateRoutineTips(methodId: string, profile: UserProfile | null): RoutineTip[] {
  const method = getMethod(methodId as TrainingMethodId)
  const tips: RoutineTip[] = []
  if (!method) {
    tips.push({ title: 'Configurá tu rutina', detail: 'Andá a Perfil y elegí un método de entrenamiento para recibir consejos personalizados.' })
    return tips
  }
  const days = profile?.cycle?.trainingDays?.length || 3
  tips.push({ title: `${method.nameEs} — ${days} días/semana`, detail: method.descriptionEs || 'Método activo en tu ciclo actual.' })
  if (method.structure?.splitType) {tips.push({ title: 'Split', detail: `Distribución: ${method.structure.splitType}. Respetá los grupos musculares asignados por día.` })}
  if (method.defaults?.rpeRange) {tips.push({ title: 'Intensidad', detail: `RPE objetivo: ${method.defaults.rpeRange[0]}-${method.defaults.rpeRange[1]}. Si el RPE sube mucho, bajá carga.` })}
  if (method.progression?.method) {tips.push({ title: 'Progresión', detail: method.progression.descriptionEs || method.progression.method })}
  if (profile?.painAreas?.length) {tips.push({ title: 'Precaución', detail: `Zonas con historial de dolor: ${profile.painAreas.join(', ')}. Evitá sobrecargar esas zonas.` })}
  if (profile?.experienceLevel === 'beginner') {tips.push({ title: 'Nivel', detail: 'Siendo principiante, priorizá la técnica sobre la carga. Usá el espejo para corregir postura.' })}
  return tips.slice(0, 5)
}

// Etiqueta visible de cada tono (el id interno nunca se muestra al usuario).
const COACH_TONE_LABEL: Record<string, string> = {
  ABUELITOS: 'Equilibrado', PADELERO: 'Motivador', ARNOLD: 'Directo', PSYCHO: 'Exigente',
}
const toneLabel = (tone?: string | null): string => (tone ? (COACH_TONE_LABEL[tone] ?? tone) : '')

function generateCoachingTips(methodId: string): RoutineTip[] {
  const style = METHOD_COACHING_STYLES[methodId as TrainingMethodId]
  if (!style) {return []}
  const method = getMethod(methodId as TrainingMethodId)
  const tips: RoutineTip[] = []
  tips.push({ title: `Estilo: ${toneLabel(style.tone)}`, detail: style.motivationStyle })
  if (style.directness > 0.7) {tips.push({ title: 'Directo', detail: 'Este estilo prioriza instrucciones claras y cortas. Sin vueltas.' })}
  else if (style.directness < 0.4) {tips.push({ title: 'Empático', detail: 'Este estilo te acompaña con paciencia. Tomate tu tiempo para aprender.' })}
  if (style.technicalFocus > 0.7) {tips.push({ title: 'Técnico', detail: 'Se enfoca en la ejecución perfecta. Prestá atención a cada movimiento.' })}
  if (style.riskLevel > 0.7) {tips.push({ title: 'Alto rendimiento', detail: 'Busca empujarte al límite. Solo si tenés experiencia y sin dolor.' })}
  if (method?.suitability?.bestFor?.length) {tips.push({ title: 'Ideal para', detail: method.suitability.bestFor.join(', ') })}
  return tips.slice(0, 4)
}

function generatePostWorkoutTips(surveys: any[], lastSession: any): PostWorkoutTip[] {
  const tips: PostWorkoutTip[] = []
  if (!surveys.length && !lastSession) {
    tips.push({ title: 'Sin datos recientes', detail: 'Completá una sesión de entrenamiento para recibir consejos personalizados.', priority: 'medium' })
    return tips
  }
  const last = surveys[surveys.length - 1]
  if (last) {
    if (last.pain === 1) {
      tips.push({ title: 'Dolor reportado', detail: `Dolor en ${last.painZone || 'zona no especificada'}. Descansá esa zona 48-72h. Si persiste, consultá un profesional.`, priority: 'high' })
    }
    if (last.sessionRating <= 2) {
      tips.push({ title: 'Sesión difícil', detail: 'La valoración fue baja. Considerá reducir intensidad o volumen en la próxima sesión.', priority: 'high' })
    } else if (last.sessionRating >= 4) {
      tips.push({ title: 'Buena sesión', detail: 'Excelente rendimiento. Podés mantener o aumentar progresivamente la carga.', priority: 'medium' })
    }
    if (last.comment) {
      tips.push({ title: 'Tu nota', detail: `"${last.comment}". Consideralo para planificar la próxima sesión.`, priority: 'medium' })
    }
  }
  if (lastSession) {
    const pct = lastSession.completedExerciseCount && typeof lastSession.skippedExerciseCount === 'number'
      ? Math.round((lastSession.completedExerciseCount / ((lastSession.completedExerciseCount || 0) + (lastSession.skippedExerciseCount || 0))) * 100)
      : null
    if (pct !== null && pct < 70) {
      tips.push({ title: 'Cumplimiento bajo', detail: `Completaste ${pct}% de los ejercicios. Revisá si la carga o el volumen eran adecuados.`, priority: 'high' })
    }
    if (lastSession.totalVolume && lastSession.totalVolume > 0) {
      tips.push({ title: 'Volumen registrado', detail: `${lastSession.totalVolume} kg totales. Usá esto como referencia para la próxima vez.`, priority: 'medium' })
    }
  }
  const painSurveys = surveys.filter(s => s.pain === 1)
  if (painSurveys.length >= 3) {
    const zones = [...new Set(painSurveys.map(s => s.painZone).filter(Boolean))]
    tips.push({ title: 'Dolor recurrente', detail: `Dolor en ${zones.length > 0 ? zones.join(', ') : 'múltiples zonas'} en ${painSurveys.length} sesiones. Considerá consultar un profesional.`, priority: 'high' })
  }
  return tips.slice(0, 4)
}

function TipItem({ title, detail }: RoutineTip) {
  return (
    <div className="rounded-lg bg-surface-container-low/90 border border-outline-variant p-3">
      <div className="font-body-md text-sm font-medium text-on-surface">{title}</div>
      <div className="font-body-md text-xs text-on-surface-variant mt-0.5">{detail}</div>
    </div>
  )
}

function PostTipItem({ tip }: { tip: PostWorkoutTip }) {
  return (
    <div className="rounded-lg bg-surface-container-low/90 border border-outline-variant p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-body-md text-sm font-medium text-on-surface">{tip.title}</div>
        <AltheaBadge variant={tip.priority === 'high' ? 'danger' : 'warning'} size="xs">
          {tip.priority === 'high' ? 'Importante' : 'Info'}
        </AltheaBadge>
      </div>
      <div className="font-body-md text-xs text-on-surface-variant mt-0.5">{tip.detail}</div>
    </div>
  )
}

/**
 * Fuentes realmente usadas en ESTA respuesta (sourcesUsed[]), no el listado
 * general de la app. Cada número coincide con la marca [n] del texto.
 */
function MessageSources({ ids }: { ids: string[] }) {
  const sources = ids.map(id => getSourceById(id)).filter((s): s is NonNullable<typeof s> => !!s)
  if (sources.length === 0) { return null }
  return (
    <div className="mt-2 pt-2 border-t border-outline-variant/50 space-y-1" data-testid="message-sources">
      <div className="font-label-caps text-[9px] uppercase text-on-surface-variant">Fuentes usadas en esta respuesta</div>
      {sources.map((s, i) => (
        <div key={s.id} className="font-body-sm text-[11px] leading-snug text-on-surface-variant" data-testid="message-source">
          <span className="font-mono text-on-surface font-medium">[{i + 1}]</span>{' '}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-primary/50 hover:text-primary">
              {s.citationLabel}
            </a>
          ) : (
            s.citationLabel
          )}
          <span className="text-on-surface-variant/70"> · {s.evidence}</span>
        </div>
      ))}
    </div>
  )
}

export default function Coach() {
  const [coachingMethod, setCoachingMethod] = useState<TrainingMethodId>('hypertrophy')
  const [routineTips, setRoutineTips] = useState<RoutineTip[]>([])
  const [coachingTips, setCoachingTips] = useState<RoutineTip[]>([])
  const [postWorkoutTips, setPostWorkoutTips] = useState<PostWorkoutTip[]>([])
  const [showMethodPicker, setShowMethodPicker] = useState(false)

  const [chatReady, setChatReady] = useState(false)
  const [conversationId, setConversationId] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sending, setSending] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [retryText, setRetryText] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [usage, setUsage] = useState(() => getUsage())
  const [resetInfo] = useState(() => getResetInfo())
  // FASE 2 S6 · tono efectivo del Coach (canónico), para no mostrar en el
  // encabezado el tono del método cuando la persona eligió otro en Perfil.
  const [coachTone, setCoachTone] = useState<CoachTone | null>(null)

  const available = isChatAvailable()

  const scrollToBottom = useCallback(() => {
    // Guard: en algunos entornos (jsdom/tests) no existe scrollIntoView.
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, streamText, scrollToBottom])

  useEffect(() => {
    const load = async () => {
      const profile = (await db.userProfile.get('me').catch(() => null)) as UserProfile | null
      if (profile?.coachMethodView) { setCoachingMethod(profile.coachMethodView as TrainingMethodId) }
      const pv = await getActiveVersion(PROFILE_SCOPE)
      const methodId = profile?.coachMethodView ?? pv?.cycle?.methodId ?? profile?.cycle?.methodId ?? coachingMethod
      setCoachTone(resolveCoachTone({
        coachTone: profile?.coachTone,
        coachIntensity: profile?.coachIntensity,
        methodId: (methodId as TrainingMethodId | undefined) ?? undefined,
      }))
      setRoutineTips(generateRoutineTips(methodId, profile))
      setCoachingTips(generateCoachingTips(methodId))
    }
    load()
  }, [coachingMethod])

  useEffect(() => {
    const init = async () => {
      const surveyData = await db.postWorkoutSurveys.toArray().catch(() => [])
      const sessionData = await db.trainingSessions.toArray().catch(() => [])
      const lastSession = sessionData.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus))
        .sort((a, b) => (a.calendarDate || '').localeCompare(b.calendarDate || '')).slice(-1)[0] || null
      setPostWorkoutTips(generatePostWorkoutTips(surveyData, lastSession))

      const convId = await getActiveConversation(PAGE_CONTEXT)
      setConversationId(convId)
      const history = await getMessages(convId)
      setMessages(history)
      setChatReady(true)
    }
    init()
  }, [])

  useEffect(() => {
    if (chatReady && available) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [chatReady, available])

  const handleMethodChange = (id: TrainingMethodId) => {
    setCoachingMethod(id)
    // FASE 2 S6 · solo la vista de método. Antes este handler también escribía
    // `coachTone` con el tono del método, pisando la preferencia explícita que
    // el usuario elige en Perfil.
    setCoachMethodView(id).catch(() => {})
    setCoachingTips(generateCoachingTips(id))
    setShowMethodPicker(false)
  }

  const runLocalReply = async (text: string) => {
    try {
      const prep = await prepareAnswer(text, PAGE_CONTEXT)
      const reply = await composeLocalAnswer(text, prep)
      const assistantMsg = await saveMessage({
        conversationId, role: 'assistant', content: reply.text, createdAt: new Date().toISOString(),
        source: reply.source, sources: reply.sourcesUsed.map(s => s.id),
      })
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setError('El Coach no pudo responder ahora. Revisá tu conexión y probá de nuevo.')
      setRetryText(text)
    } finally {
      setStreaming(false)
      setSending(false)
      setStreamText('')
      setUsage(getUsage())
    }
  }

  const runChat = async (text: string, opts?: { forceLocal?: boolean }) => {
    if (streaming || sending || !conversationId) { return }
    setError(null)
    setRetryText(null)
    if (!available || opts?.forceLocal) {
      await runLocalReply(text)
      return
    }
    setStreaming(true)
    setSending(true)
    setStreamText('')
    // Pipeline: intención → contexto real del usuario → evidencia recuperada.
    const prep = await prepareAnswer(text, PAGE_CONTEXT)
    const history: ChatCompletionMessage[] = messages
      .slice(-10)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => !m.content.startsWith('⚠️'))
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    const apiMessages: ChatCompletionMessage[] = [
      ...history,
      { role: 'user', content: text },
    ]
    try {
      await streamChat(
        apiMessages,
        {
          onToken: (token) => setStreamText(prev => prev + token),
          onDone: async (fullText) => {
            setStreaming(false)
            setSending(false)
            setStreamText('')
            setUsage(getUsage())
            // Validator: solo fuentes recuperadas y citadas quedan registradas.
            const validated = validateAnswer(fullText, prep.hits)
            const assistantMsg = await saveMessage({
              conversationId, role: 'assistant', content: validated.text,
              createdAt: new Date().toISOString(), source: 'groq',
              sources: validated.sourcesUsed.map(s => s.id),
            })
            setMessages(prev => [...prev, assistantMsg])
          },
          onError: async () => {
            await runLocalReply(text)
          },
        },
        { systemPrompt: buildSystemPrompt(prep) }
      )
    } catch {
      await runLocalReply(text)
    }
  }

  const sendMessage = async (raw: string) => {
    const text = raw.trim()
    if (!text || streaming || sending || !conversationId) { return }
    setInput('')
    const userMsg = await saveMessage({
      conversationId, role: 'user', content: text, createdAt: new Date().toISOString(),
    })
    setMessages(prev => [...prev, userMsg])
    await runChat(text)
  }

  const retry = async () => {
    if (!retryText) { return }
    await runChat(retryText)
  }

  const handleClear = async () => {
    if (!conversationId) { return }
    if (!window.confirm('¿Borrar esta conversación?')) { return }
    await clearConversation(conversationId)
    setMessages([])
    setError(null)
    setRetryText(null)
    const newId = await getActiveConversation(PAGE_CONTEXT)
    setConversationId(newId)
  }

  const currentStyle = METHOD_COACHING_STYLES[coachingMethod]
  const currentMethod = getMethod(coachingMethod)

  return (
    <div>
      <header className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-primary" />
          <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Coach IA</h1>
        </div>
        <AltheaBadge variant={available ? 'secondary' : 'outline'} dot={available} dotColor={available ? 'bg-secondary' : undefined} className="h-7">
          {available ? 'Disponible' : 'Sin conexión'}
        </AltheaBadge>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-3">
          <AltheaCard padding="none" className="flex flex-col h-[62vh] min-h-[440px] md:h-[560px] overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-outline-variant shrink-0">
              <div className="w-9 h-9 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-secondary" />
              </div>
              <div className="min-w-0 text-left">
                <div className="font-headline-sm text-sm text-on-surface truncate">Althea — Coach IA</div>
                <div className="font-body-md text-[11px] text-on-surface-variant truncate">
                    {currentMethod ? `${currentMethod.nameEs} · ${coachTone ?? currentStyle?.tone ?? ''}` : 'Tu asistente de entrenamiento'}
                  {available && (
                    <span className="inline-flex items-center gap-1 ml-2 align-middle" title={`${usage.dayUsed}/${usage.dayTotal} mensajes hoy · Se renueva en ${resetInfo.nextDayReset}`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${usage.dayPct >= 90 ? 'bg-error' : usage.dayPct >= 70 ? 'bg-tertiary' : 'bg-secondary'}`} />
                      <span className="text-on-surface-variant">{usage.dayUsed}/{usage.dayTotal}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-auto shrink-0">
                <button
                  onClick={handleClear}
                  disabled={messages.length === 0}
                  aria-label="Borrar conversación"
                  title="Borrar conversación"
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition disabled:opacity-40"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 space-y-3">
              {!chatReady ? (
                <AltheaLoading lines={4} />
              ) : messages.length === 0 && !streaming ? (
                <AltheaEmpty
                  icon={available ? 'chat' : 'cloud_off'}
                  title={available ? '¿En qué puedo ayudarte?' : 'Coach en modo local'}
                  description={available
                    ? 'Preguntame sobre tu rutina, nutrición o recuperación. Uso tus datos reales.'
                    : 'Sin conexión: respondo con tus datos guardados. Con conexión activás el Coach completo.'}
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm">
                      {QUICK_ACTIONS.map(a => (
                        <button
                          key={a.label}
                          onClick={() => sendMessage(a.prompt)}
                          disabled={streaming || sending}
                          className="inline-flex items-center gap-2 min-h-[48px] px-3.5 rounded-full border border-outline-variant bg-surface-container-low hover:bg-surface-container-high text-on-surface font-body-md text-xs disabled:opacity-50 transition"
                        >
                          <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">{a.icon}</span>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  }
                />
              ) : (
                <>
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0" aria-hidden="true">
                          <Bot size={14} className="text-secondary" />
                        </div>
                      )}
                      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 font-body-md text-sm break-words whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary text-on-primary rounded-br-md'
                          : 'bg-surface-container-low border border-outline-variant text-on-surface rounded-bl-md'
                      }`}>
                        {msg.role === 'assistant' && msg.source === 'local' && (
                          <div className="flex items-center gap-1 mb-1">
                            <span className="material-symbols-outlined text-[12px] text-tertiary" aria-hidden="true">cloud_off</span>
                            <span className="font-body-md text-[10px] uppercase tracking-wide text-on-surface-variant">Modo local</span>
                          </div>
                        )}
                        {msg.content}
                        {msg.role === 'assistant' && (msg.sources?.length ?? 0) > 0 && (
                          <MessageSources ids={msg.sources!} />
                        )}
                      </div>
                    </div>
                  ))}

                  {streaming && (
                    <div className="flex items-end gap-2 justify-start" aria-live="polite">
                      <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0" aria-hidden="true">
                        <Bot size={14} className="text-secondary" />
                      </div>
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md bg-surface-container-low border border-outline-variant px-4 py-2.5">
                        {streamText ? (
                          <p className="font-body-md text-sm text-on-surface break-words whitespace-pre-wrap">{streamText}<span className="inline-block w-1.5 h-4 bg-secondary/60 ml-0.5 animate-pulse rounded-sm" aria-hidden="true" /></p>
                        ) : (
                          <p className="font-body-md text-sm text-on-surface-variant">
                            Escribiendo<span className="sr-only">…</span>
                            <span className="inline-flex gap-1 ml-1" aria-hidden="true">
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" />
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!streaming && sending && (
                    <div className="flex items-end gap-2 justify-start" aria-live="polite">
                      <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center shrink-0" aria-hidden="true">
                        <Bot size={14} className="text-secondary" />
                      </div>
                      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-bl-md bg-surface-container-low border border-outline-variant px-4 py-2.5">
                        <p className="font-body-md text-sm text-on-surface-variant">Analizando tus datos…</p>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div role="alert" className="rounded-xl border border-error/40 bg-error/10 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[18px] text-error shrink-0" aria-hidden="true">error</span>
                        <p className="font-body-md text-sm text-on-surface">{error}</p>
                      </div>
                      {retryText && (
                        <AltheaButton variant="secondary" size="sm" className="min-h-[48px]" onClick={retry}>
                          Reintentar
                        </AltheaButton>
                      )}
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-3 py-3 border-t border-outline-variant shrink-0 bg-surface">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(input) }}
                className="flex items-end gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={available ? 'Escribí tu mensaje…' : 'Modo local — respondo con tus datos'}
                  disabled={streaming || sending}
                  maxLength={500}
                  aria-label="Mensaje para el Coach"
                  className="flex-1 min-h-[48px] rounded-xl bg-surface-container-low border border-outline-variant px-4 py-3 font-body-md text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary/60 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || streaming || sending}
                  aria-label="Enviar mensaje"
                  className="w-12 h-12 shrink-0 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 transition hover:brightness-110"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </AltheaCard>

          <div className="lg:hidden">
            <ContextualTips
              coachingMethod={coachingMethod}
              currentMethod={currentMethod}
              currentStyle={currentStyle}
              routineTips={routineTips}
              coachingTips={coachingTips}
            postWorkoutTips={postWorkoutTips}
            coachTone={coachTone}
              showMethodPicker={showMethodPicker}
              onTogglePicker={() => setShowMethodPicker(v => !v)}
              onMethodChange={handleMethodChange}
            />
          </div>
        </div>

        <div className="hidden lg:block lg:col-span-4 space-y-3">
          <ContextualTips
            coachingMethod={coachingMethod}
            currentMethod={currentMethod}
            currentStyle={currentStyle}
            coachTone={coachTone}
            routineTips={routineTips}
            coachingTips={coachingTips}
            postWorkoutTips={postWorkoutTips}
            showMethodPicker={showMethodPicker}
            onTogglePicker={() => setShowMethodPicker(v => !v)}
            onMethodChange={handleMethodChange}
          />
        </div>
      </div>
    </div>
  )
}

interface ContextualTipsProps {
  coachingMethod: TrainingMethodId
  currentMethod: ReturnType<typeof getMethod>
  currentStyle: (typeof METHOD_COACHING_STYLES)[TrainingMethodId] | undefined
  /** FASE 2 S6 · tono efectivo canónico (puede diferir del tono del método). */
  coachTone: CoachTone | null
  routineTips: RoutineTip[]
  coachingTips: RoutineTip[]
  postWorkoutTips: PostWorkoutTip[]
  showMethodPicker: boolean
  onTogglePicker: () => void
  onMethodChange: (id: TrainingMethodId) => void
}

function ContextualTips({
  coachingMethod, currentMethod, currentStyle, coachTone, routineTips, coachingTips, postWorkoutTips,
  showMethodPicker, onTogglePicker, onMethodChange,
}: ContextualTipsProps) {
  return (
    <>
      <AltheaCard>
        <AltheaCardHeader
          icon="fitness_center"
          title="Estilo de coaching"
            subtitle={currentMethod ? `${currentMethod.nameEs} · ${toneLabel(coachTone ?? currentStyle?.tone)}` : undefined}
          action={
            <AltheaButton variant="ghost" size="sm" className="min-h-[48px]" onClick={onTogglePicker}>
              {showMethodPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Cambiar
            </AltheaButton>
          }
        />
        {showMethodPicker && (
          <div className="space-y-1 mb-3">
            {TRAINING_METHODS.map(method => {
              const style = METHOD_COACHING_STYLES[method.id]
              const isActive = coachingMethod === method.id
              return (
                <button
                  key={method.id}
                  onClick={() => onMethodChange(method.id)}
                  aria-pressed={isActive}
                  className={`w-full min-h-[48px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    isActive ? 'bg-primary/10 border border-primary/40 text-primary' : 'hover:bg-surface-container-high text-on-surface'
                  }`}
                >
                  <span aria-hidden="true">{style?.icon || '⚙️'}</span>
                  <span className="font-body-md text-sm">{method.nameEs}</span>
                </button>
              )
            })}
          </div>
        )}
        {coachingTips.length > 0 && (
          <div className="space-y-2">
            {coachingTips.slice(0, 2).map((tip, i) => <TipItem key={i} {...tip} />)}
          </div>
        )}
      </AltheaCard>

      <AltheaCard>
        <AltheaCardHeader icon="format_list_bulleted" title="Consejos de tu rutina" subtitle="Según tu método y perfil" />
        {routineTips.length === 0 ? (
          <p className="font-body-md text-xs text-on-surface-variant">Cargando consejos...</p>
        ) : (
          <div className="space-y-2">
            {routineTips.slice(0, 3).map((tip, i) => <TipItem key={i} {...tip} />)}
          </div>
        )}
      </AltheaCard>

       <AltheaCard>
         <AltheaCardHeader icon="trending_up" title="Para tu próximo día" subtitle="Según tu última sesión" />
         {postWorkoutTips.length === 0 ? (
           <p className="font-body-md text-xs text-on-surface-variant">Completá una sesión para ver consejos personalizados.</p>
         ) : (
           <div className="space-y-2">
             {postWorkoutTips.slice(0, 2).map((tip, i) => <PostTipItem key={i} tip={tip} />)}
           </div>
         )}
        </AltheaCard>
        <CoachScientificSources />
      </>
    )
  }

/** Sección de fuentes científicas visibles en la parte inferior del Coach. */
export function CoachScientificSources() {
  const [expanded, setExpanded] = useState(false)
  return (
    <AltheaCard level={2} className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>school</span>
          <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">FUENTES CIENTÍFICAS</span>
        </div>
        <span className="text-on-surface-variant inline-flex" aria-hidden="true">
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          <p className="font-body-sm text-xs text-on-surface-variant">
            El contenido de Althea se apoya en fuentes científicas y profesionales. Consultá las referencias utilizadas por el Coach.
          </p>
          {SCIENTIFIC_SOURCES.map(src => (
            <a
              key={src.id}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 p-2 rounded border border-outline-variant/30 hover:border-primary/40 transition-colors text-on-surface text-xs"
            >
              <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: 16 }}>open_in_new</span>
              <div className="min-w-0">
                <span className="font-body-sm text-sm text-on-surface font-medium block truncate">{src.name}</span>
                <span className="font-label-caps text-[9px] text-on-surface-variant">{src.organization} · {src.topic}{src.year ? ` · ${src.year}` : ''}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </AltheaCard>
  )
}

/** Muestra el gasto energético estimado de una sesión. */
export function CalorieExpenditureDisplay({ weightKg, durationMinutes }: { weightKg?: number; durationMinutes?: number }) {
  if (!weightKg || !durationMinutes || durationMinutes <= 0) {
    return <p className="font-body-sm text-xs text-on-surface-variant">No hay datos suficientes para estimar el gasto.</p>
  }
  const result = calculateCalorieExpenditure({
    activity: 'Entrenamiento de fuerza general',
    met: 6.0,
    weightKg,
    durationMinutes,
  })
  return (
    <div className="rounded border border-outline-variant/30 p-3 space-y-1">
      <div className="font-label-caps text-[9px] uppercase text-on-surface-variant">Gasto energético estimado</div>
      <div className="font-headline-md text-lg text-on-surface font-semibold">{result.grossKcal} kcal</div>
      <div className="font-body-sm text-[11px] text-on-surface-variant">Neto: {result.netKcal} kcal · MET: {result.met}</div>
      <div className="font-label-caps text-[9px] text-on-surface-variant">Fórmula: MET × 3,5 × kg ÷ 200 × min</div>
    </div>
  )
}