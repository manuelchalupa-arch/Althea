import { useEffect, useState } from 'react'
import { db } from '@/services/storage/db'
import { METHOD_COACHING_STYLES } from '@/services/ai/coachPersonality'
import { TRAINING_METHODS, getMethod } from '@/services/ai/trainingMethodsDB'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import type { UserProfile } from '@/types'
import { Brain, Dumbbell, ChevronDown, ChevronUp, Lightbulb, ClipboardList, TrendingUp } from 'lucide-react'
import { AltheaCard, AltheaCardHeader, AltheaBadge, StatusTag, AltheaKPICard, AltheaProgress, AltheaButton, AltheaSection } from '@/components/althea'

interface RoutineTip { title: string; detail: string }
interface PostWorkoutTip { title: string; detail: string; priority: 'high' | 'medium' }

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

function generateCoachingTips(methodId: string): RoutineTip[] {
  const style = METHOD_COACHING_STYLES[methodId as TrainingMethodId]
  if (!style) {return []}
  const method = getMethod(methodId as TrainingMethodId)
  const tips: RoutineTip[] = []
  tips.push({ title: `Estilo: ${style.tone}`, detail: style.motivationStyle })
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
    const pct = lastSession.completedExerciseCount && lastSession.skippedExerciseCount != null
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

export default function Coach() {
  const [coachingMethod, setCoachingMethod] = useState<TrainingMethodId>('hypertrophy')
  const [routineTips, setRoutineTips] = useState<RoutineTip[]>([])
  const [coachingTips, setCoachingTips] = useState<RoutineTip[]>([])
  const [postWorkoutTips, setPostWorkoutTips] = useState<PostWorkoutTip[]>([])
  const [showMethodPicker, setShowMethodPicker] = useState(false)

  useEffect(() => {
    const load = async () => {
      const profile = (await db.userProfile.get('me').catch(() => null)) as UserProfile | null
      if (profile?.coachMethodView) { setCoachingMethod(profile.coachMethodView as TrainingMethodId) }
      const methodId = profile?.coachMethodView ?? profile?.cycle?.methodId ?? coachingMethod
      setRoutineTips(generateRoutineTips(methodId, profile))
      setCoachingTips(generateCoachingTips(coachingMethod))

      const surveys = await db.postWorkoutSurveys.toArray().catch(() => [])
      const sessions = await db.trainingSessions.toArray().catch(() => [])
      const lastSession = sessions.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus))
        .sort((a, b) => (a.calendarDate || '').localeCompare(b.calendarDate || '')).slice(-1)[0] || null
      setPostWorkoutTips(generatePostWorkoutTips(surveys, lastSession))
    }
    load()
  }, [coachingMethod])

  const handleMethodChange = (id: TrainingMethodId) => {
    setCoachingMethod(id)
    const style = METHOD_COACHING_STYLES[id]
    // Preferencia persistida en perfil Dexie (sin localStorage como fuente)
    db.userProfile.get('me').then(p => {
      if (p) {
        db.userProfile.update('me', {
          coachMethodView: id,
          ...(style ? { coachTone: style.tone } : {}),
        } as Partial<UserProfile>).catch(() => {})
      }
    }).catch(() => {})
    setCoachingTips(generateCoachingTips(id))
    setShowMethodPicker(false)
  }

  const currentStyle = METHOD_COACHING_STYLES[coachingMethod]
  const currentMethod = getMethod(coachingMethod)

  return (
    <div className="min-h-screen bg-transparent pb-24 px-4 md:px-6 lg:px-8 max-w-[1440px] w-full mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain size={20} className="text-primary" />
        <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Coach IA</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      {/* Card 1: Tips de la rutina actual */}
      <AltheaCard>
        <div className="flex items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <ClipboardList size={14} className="text-primary" />
          <span>CONSEJOS DE TU RUTINA</span>
        </div>
        {routineTips.length === 0 ? (
          <p className="font-body-md text-xs text-on-surface-variant">Cargando consejos...</p>
        ) : (
          <div className="space-y-2 mt-3">
            {routineTips.map((tip, i) => (
              <div key={i} className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3">
                <div className="font-body-md text-sm text-on-surface font-medium">{tip.title}</div>
                <div className="font-body-md text-xs text-on-surface-variant mt-0.5">{tip.detail}</div>
              </div>
            ))}
          </div>
        )}
      </AltheaCard>

      {/* Card 2: Estilo de coaching + selector — visible on all devices */}
      <AltheaCard>
        <div className="flex items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <Dumbbell size={14} className="text-primary" />
          <span>ESTILO DE COACHING</span>
        </div>

        {currentStyle && currentMethod && (
          <div className="bg-primary/20 border border-primary/40 rounded-lg p-3 flex items-center gap-2 mt-3">
            <span className="text-lg">{currentStyle.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-body-md text-sm text-on-surface font-medium">{currentMethod.nameEs}</div>
              <div className="font-body-md text-xs text-on-surface-variant truncate">{currentStyle.tone}</div>
            </div>
            <AltheaButton variant="secondary" size="sm" onClick={() => setShowMethodPicker(!showMethodPicker)}>
              Cambiar {showMethodPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </AltheaButton>
          </div>
        )}

        {showMethodPicker && (
          <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-2 max-h-60 overflow-y-auto space-y-1 mt-3">
            {TRAINING_METHODS.map(method => {
              const style = METHOD_COACHING_STYLES[method.id]
              const isActive = coachingMethod === method.id
              return (
                <button key={method.id} onClick={() => handleMethodChange(method.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${isActive ? 'bg-primary/20 border border-primary text-primary' : 'hover:bg-surface-container-high text-on-surface-variant'}`}>
                  <span>{style?.icon || '🏋️'}</span>
                  <span className="font-body-md text-sm">{method.nameEs}</span>
                </button>
              )
            })}
          </div>
        )}

        {coachingTips.length > 0 && (
          <div className="space-y-2 mt-3">
            {coachingTips.map((tip, i) => (
              <div key={i} className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-3">
                <div className="font-body-md text-sm text-on-surface font-medium">{tip.title}</div>
                <div className="font-body-md text-xs text-on-surface-variant mt-0.5">{tip.detail}</div>
              </div>
            ))}
          </div>
        )}
      </AltheaCard>
      </div>

      <div className="lg:col-span-4 space-y-3 hidden lg:block">
        {/* Desktop sidebar: compact coaching status */}
        <div className="bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant rounded-lg p-4 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">RESUMEN</div>
          {currentStyle && (
            <div className="flex items-center gap-2">
              <span className="text-lg">{currentStyle.icon}</span>
              <div className="font-body-md text-sm text-on-surface font-medium">{currentStyle.tone}</div>
            </div>
          )}
          <div className="font-body-md text-xs text-on-surface-variant">Método: {currentMethod?.nameEs || '—'}</div>
        </div>
      </div>

      {/* Card 3: Consejos post-entreno para el próximo día */}
      <AltheaCard>
        <div className="flex items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
          <TrendingUp size={14} className="text-primary" />
          <span>PARA TU PRÓXIMO DÍA</span>
        </div>
        {postWorkoutTips.length === 0 ? (
          <p className="font-body-md text-xs text-on-surface-variant">Completá una sesión para ver consejos personalizados.</p>
        ) : (
          <div className="space-y-2 mt-3">
            {postWorkoutTips.map((tip, i) => (
              <div key={i} className={`rounded-lg p-3 border ${tip.priority === 'high' ? 'bg-warning/12 border-warning/45' : 'bg-surface-container-low/90 backdrop-blur-sm border-outline-variant'}`}>
                <div className="font-body-md text-sm text-on-surface font-medium">{tip.title}</div>
                <div className="font-body-md text-xs text-on-surface-variant mt-0.5">{tip.detail}</div>
              </div>
            ))}
          </div>
        )}
      </AltheaCard>
      </div>
    </div>
  )
}
