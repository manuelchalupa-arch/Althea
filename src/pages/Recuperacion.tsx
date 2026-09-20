import { useState, useEffect } from 'react'
import { db } from '@/services/storage/db'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { AltheaCard, AltheaCardHeader, AltheaBadge, StatusTag, AltheaProgress, AltheaButton } from '@/components/althea'
import { HydrationWidget } from '@/components/recovery/HydrationWidget'
import { SleepForm } from '@/components/recovery/SleepForm'
import { RecoveryCheckForm, type RecoveryCheckValues } from '@/components/recovery/RecoveryCheckForm'
import { RecommendationCard, type Recommendation } from '@/components/recovery/RecommendationCard'
import { getTodayHydration, getHydrationGoal } from '@/services/recovery/recoveryService'
import { analyzeRecovery } from '@/services/ai/recoveryAnalyzer'
import { logDecision } from '@/services/ai/decisionLogger'

export default function Recuperacion(){
  const today = new Date().toISOString().slice(0,10)
  const [vals,setVals]=useState<RecoveryCheckValues>({ energy:7, fatigue:4, pain:2, mood:7, motivation:7, perceivedExertion:5, stress:3, painArea:'', painObservation:'' })
  const [score,setScore]=useState(0)
  const [color,setColor]=useState<'green'|'yellow'|'red'>('green')
  const [hydration, setHydration] = useState(0)
  const [goal, setGoal] = useState(2500)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [showWhyIds, setShowWhyIds] = useState<string[]>([])

  useEffect(() => {
    const loadHydration = async () => {
      const h = await getTodayHydration()
      const g = await getHydrationGoal()
      setHydration(h)
      setGoal(g)
    }
    loadHydration()
  }, [])

  useEffect(() => {
    const loadRecommendations = async () => {
      try {
        const ctx = await analyzeRecovery()
        const recs: Recommendation[] = []
        const ts = new Date().toISOString()
        if (ctx.lastScore === null) {
          recs.push({
            id: 'rec-nodata',
            type: 'recovery',
            title: 'Sin datos suficientes',
            description: 'Todavía no hay suficientes check-ins para generar una recomendación fiable.',
            reasoning: 'Hipótesis, no hecho: sin historial de recuperación no se puede inferir tendencia.',
            evidence: ['Dato: 0 check-ins con score en historial'],
            severity: 'info',
            timestamp: ts,
          })
        } else if (ctx.consecutiveLow >= 2 || ctx.lastScore < 45) {
          recs.push({
            id: 'rec-deload',
            type: 'recovery',
            title: 'Considerar descarga o descanso activo',
            description: 'Tu recuperación viene baja. Valorar bajar volumen hoy.',
            reasoning: 'Cálculo a partir de tus registros: racha de scores bajos y tendencia reciente.',
            evidence: [
              `Dato: último score ${ctx.lastScore}/100`,
              `Dato: ${ctx.consecutiveLow} día(s) consecutivos con score < 60`,
              `Cálculo: tendencia ${ctx.trend}, fatiga promedio ${ctx.fatigueAvg.toFixed(1)}/10`,
            ],
            action: { label: 'Aceptar sugerencia', type: 'accept' },
            severity: ctx.lastScore < 45 ? 'critical' : 'warning',
            timestamp: ts,
          })
        } else if (ctx.lastScore >= 70) {
          recs.push({
            id: 'rec-optimal',
            type: 'recovery',
            title: 'Recuperación óptima',
            description: 'Indicadores en rango. Podés entrenar según lo planificado.',
            reasoning: 'Cálculo a partir de tus registros recientes.',
            evidence: [`Dato: último score ${ctx.lastScore}/100`, `Cálculo: tendencia ${ctx.trend}`],
            severity: 'info',
            timestamp: ts,
          })
        }
        setRecommendations(recs)
      } catch {
        setRecommendations([])
      }
    }
    loadRecommendations()
  }, [])

  const handleRecAction = async (id: string, action: 'accept' | 'modify' | 'dismiss') => {
    const rec = recommendations.find(r => r.id === id)
    if (!rec) {
      return
    }
    try {
      const entry = await logDecision({
        type: 'recovery',
        context: { recommendationId: id, severity: rec.severity },
        decision: {
          what: rec.title,
          why: rec.reasoning,
          factors: rec.evidence,
          confidence: rec.severity === 'info' ? 0.6 : 0.75,
        },
      })
      await db.decisionLog.update(entry.id, { outcome: { accepted: action === 'accept' } } as never)
    } catch {
      /* noop — la decisión queda registrada en UI aunque falle el log */
    }
    setRecommendations(prev => prev.filter(r => r.id !== id))
  }

  const toggleWhy = (id: string) => {
    setShowWhyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleCheckChange = (v: RecoveryCheckValues, s: number, c: 'green' | 'yellow' | 'red') => {
    setVals(v); setScore(s); setColor(c)
  }

  const handleCheckSaved = (s: number) => {
    alert(`Guardado: ${s}/100 — disponible para IA y gráficos`)
  }

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Recuperación</h1>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-3">
      <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Check-in de hoy</div>
      <RecoveryCheckForm onChange={handleCheckChange} onSaved={handleCheckSaved} />

      {recommendations.length > 0 && (
        <div className="space-y-3">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant font-medium">Recomendaciones (no modifican tu rutina automáticamente)</div>
          {recommendations.map(r => (
            <RecommendationCard
              key={r.id}
              recommendation={r}
              onAction={handleRecAction}
              showWhy={showWhyIds.includes(r.id)}
              onToggleWhy={() => toggleWhy(r.id)}
            />
          ))}
        </div>
      )}

      </div>
      <div className="lg:col-span-4 space-y-3 hidden lg:block">
        <div className={`rounded p-4 text-center border ${color==='green'?'bg-emerald-900/30 border-emerald-800':color==='yellow'?'bg-amber-900/30 border-amber-800':'bg-red-900/30 border-red-800'}`}>
          <div className="font-headline-lg text-3xl lg:text-4xl font-semibold tracking-tight text-on-surface">{score}<span className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-sm">/100</span></div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mt-1">{color==='green'?'Normal':color==='yellow'?'Moderada':'Baja'}</div>
        </div>
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><AlertTriangle size={14}/> Último check-in</div>
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-sm">Hoy — {new Date().toLocaleDateString('es')}</div>
          <div className="font-body-md text-sm text-on-surface font-medium">Energía: {vals.energy}/10 · Fatiga: {vals.fatigue}/10</div>
        </div>
        <div className="  rounded bg-surface-container-low/90 backdrop-blur-sm border border-outline-variant p-3 space-y-2">
          <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1"><Sparkles size={14}/> Tips de recuperación</div>
          <ul className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant text-xs space-y-1.5 list-disc list-inside">
            <li>Dormí 7–8h para óptima recuperación</li>
            <li>Mantené hidratación diaria</li>
            <li>Si el score { '<' } 50, considerá descanso activo</li>
          </ul>
        </div>
        
        <div className="space-y-3">
          <HydrationWidget />
          <SleepForm />
        </div>
      </div>

      </div>
    </div>
  )
}