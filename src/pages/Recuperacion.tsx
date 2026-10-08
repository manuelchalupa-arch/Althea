import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { db } from '@/services/storage/db'
import { AltheaCard, AltheaCardHeader, AltheaBadge, AltheaButton, AltheaLoading, AltheaEmpty, AltheaMetric, AltheaStatRow } from '@/components/althea'
import { WaterBottle } from '@/components/recovery/WaterBottle'
import { BottleConfigEditor } from '@/components/recovery/BottleConfigEditor'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'
import { RecommendationCard, type Recommendation } from '@/components/recovery/RecommendationCard'
import { getRecoveryHistory } from '@/services/recovery/recoveryService'
import { analyzeRecovery, type RecoveryContext } from '@/services/ai/recoveryAnalyzer'
import { logDecision } from '@/services/ai/decisionLogger'
import type { RecoveryCheck } from '@/types'

const TREND_LABEL: Record<RecoveryContext['trend'], string> = {
  improving: 'En mejora',
  stable: 'Estable',
  declining: 'En descenso',
}

const TREND_VARIANT: Record<RecoveryContext['trend'], 'success' | 'default' | 'danger'> = {
  improving: 'success',
  stable: 'default',
  declining: 'danger',
}

function scoreTone(score: number): string {
  if (score >= 70) {return 'bg-secondary'}
  if (score >= 45) {return 'bg-tertiary'}
  return 'bg-error'
}

function shortDate(s: string | undefined): string {
  if (!s) {return ''}
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

function buildRecommendations(ctx: RecoveryContext): Recommendation[] {
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
  return recs
}

export default function Recuperacion() {
  const [ctx, setCtx] = useState<RecoveryContext | null>(null)
  const [history, setHistory] = useState<RecoveryCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [showWhyIds, setShowWhyIds] = useState<string[]>([])
  const [savedScore, setSavedScore] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        const [analysis, recent] = await Promise.all([analyzeRecovery(), getRecoveryHistory(7)])
        if (cancelled) {return}
        setCtx(analysis)
        setHistory(recent)
        setRecommendations(buildRecommendations(analysis))
      } catch {
        if (!cancelled) {setError(true)}
      } finally {
        if (!cancelled) {setLoading(false)}
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = () => {
    setReloadKey(k => k + 1)
  }

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

  const handleCheckSaved = (s: number) => {
    setSavedScore(s)
    window.setTimeout(() => setSavedScore(null), 3000)
  }

  const scores = history.filter(c => typeof c.score === 'number').slice(-7)
  const factors = ctx?.lastCheck ? [
    { label: 'Energía', value: ctx.lastCheck.energy },
    { label: 'Fatiga', value: ctx.lastCheck.fatigue },
    { label: 'Dolor', value: ctx.lastCheck.pain },
    { label: 'Estado de ánimo', value: ctx.lastCheck.mood },
    { label: 'Estrés', value: ctx.lastCheck.stress },
  ] : []

  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 pb-24 max-w-[1440px] w-full mx-auto space-y-4">
      <h1 className="font-headline-lg text-lg font-semibold text-on-surface">Recuperación</h1>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-4">
          <AltheaCard level={2}>
            <AltheaCardHeader
              title="Check-in de hoy"
              subtitle="Tu estado real queda guardado en el dispositivo (Dexie) y alimenta IA y gráficos."
              icon="monitor_heart"
              action={savedScore !== null ? (
                <AltheaBadge variant="success" dot>Guardado {savedScore}/100</AltheaBadge>
              ) : undefined}
            />
            <RecoveryCheckForm onSaved={handleCheckSaved} />
          </AltheaCard>

          <AltheaCard level={2}>
            <AltheaCardHeader title="Estado y evolución" subtitle="Datos reales de tus últimos check-ins." icon="trending_up" />
            {loading ? (
              <AltheaLoading lines={3} />
            ) : error ? (
              <div className="rounded-lg bg-error/15 border border-error/40 p-4 space-y-3">
                <p className="font-body-sm text-sm text-on-surface">No se pudieron cargar tus datos de recuperación.</p>
                <AltheaButton variant="secondary" size="md" className="min-h-[48px]" onClick={reload}>
                  <RefreshCw size={16} className="mr-1" /> Reintentar
                </AltheaButton>
              </div>
            ) : (!ctx || ctx.lastScore === null) ? (
              <AltheaEmpty
                icon="spa"
                title="Sin datos de recuperación todavía"
                description="Completá tu primer check-in para ver tu estado, evolución y factores."
              />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                  <AltheaMetric
                    value={ctx.lastScore}
                    unit="/100"
                    label="Score de recuperación"
                  />
                  <div className="flex flex-col gap-1.5">
                    <AltheaBadge variant={TREND_VARIANT[ctx.trend]} dot>{TREND_LABEL[ctx.trend]}</AltheaBadge>
                    {ctx.consecutiveLow > 0 && (
                      <AltheaBadge variant="danger" dot>{ctx.consecutiveLow} día(s) seguidos en baja</AltheaBadge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-on-surface-variant">
                  <span>Energía promedio (3 días): {ctx.energyAvg.toFixed(1)}/10</span>
                  <span>Fatiga promedio (3 días): {ctx.fatigueAvg.toFixed(1)}/10</span>
                </div>

                <div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">Factores del último check-in</div>
                  <AltheaStatRow items={factors.map(f => ({
                    icon: f.label === 'Energía' ? 'progreso' : f.label === 'Fatiga' ? 'nutricion' : f.label === 'Dolor' ? 'recuperacion' : f.label === 'Estado de ánimo' ? 'coach' : 'mas',
                    value: `${f.value}/10`,
                    label: f.label,
                  }))} />
                </div>

                <div>
                  <div className="font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">Evolución reciente</div>
                  {scores.length > 0 ? (
                    <div className="flex items-end gap-2 h-28">
                      {scores.map(c => (
                        <div key={c.localDate} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                          <div
                            className={`w-full rounded-t-md ${scoreTone(c.score ?? 0)}`}
                            style={{ height: `${Math.max(10, c.score ?? 0)}%` }}
                            title={`${c.score}/100`}
                          />
                          <span className="text-[9px] text-on-surface-variant">{shortDate(c.localDate)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-body-sm text-sm text-on-surface-variant">Sin historial de scores todavía.</p>
                  )}
                </div>
              </div>
            )}
          </AltheaCard>

          <AltheaCard level={2}>
            <AltheaCardHeader title="Recomendaciones" subtitle="No modifican tu rutina automáticamente." icon="lightbulb" />
            {loading ? (
              <AltheaLoading lines={2} />
            ) : error ? (
              <div className="rounded-lg bg-error/15 border border-error/40 p-4 space-y-3">
                <p className="font-body-sm text-sm text-on-surface">No se pudieron generar recomendaciones.</p>
                <AltheaButton variant="secondary" size="md" className="min-h-[48px]" onClick={reload}>
                  <RefreshCw size={16} className="mr-1" /> Reintentar
                </AltheaButton>
              </div>
            ) : recommendations.length === 0 ? (
              <AltheaEmpty
                icon="task_alt"
                title="Sin recomendaciones activas"
                description="No hay alertas pendientes. Tus indicadores están dentro de los rangos esperados."
              />
            ) : (
              <div className="space-y-3">
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
          </AltheaCard>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <AltheaCard level={2} padding="md">
            <AltheaCardHeader title="Hidratación" subtitle="Consumo real contra objetivo calculado" icon="water_drop" />
            <WaterBottle />
            <div className="mt-3 pt-3 border-t border-outline-variant/30">
              <BottleConfigEditor />
            </div>
          </AltheaCard>

          <AltheaCard level={2}>
            <AltheaCardHeader title="Últimos días" icon="history" />
            {history.length > 0 ? (
              <div className="divide-y divide-outline-variant/30">
                {history.slice(-5).reverse().map(c => (
                  <div key={c.localDate} className="flex items-center justify-between py-2.5">
                    <span className="font-body-md text-sm text-on-surface">{shortDate(c.localDate)}</span>
                    {typeof c.score === 'number' ? (
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${scoreTone(c.score)}`} />
                        <span className="font-body-md text-sm font-semibold text-on-surface">{c.score}/100</span>
                      </div>
                    ) : (
                      <span className="font-body-sm text-xs text-on-surface-variant">Sin score</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-body-sm text-sm text-on-surface-variant">Sin check-ins guardados todavía.</p>
            )}
          </AltheaCard>
        </div>
      </div>
    </div>
  )
}