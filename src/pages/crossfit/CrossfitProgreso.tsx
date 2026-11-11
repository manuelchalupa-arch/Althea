import { useEffect, useState } from 'react'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { AltheaButton } from '@/components/althea/AltheaButton'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaInput, AltheaSelect } from '@/components/althea/AltheaInput'
import { AltheaKPICard } from '@/components/althea/AltheaKPI'
import { deleteMark, listMarks, listResults, listWods, newMark } from '@/services/crossfit/cfStore'
import {
  avgRpe,
  bestMarkByMovement,
  modalityDistribution,
  prByBenchmark,
  topMovements,
  totalReps,
  totalRounds,
  totalTimeSec,
  weeklyVolume,
} from '@/services/crossfit/cfStats'
import type { CfMark, CfModality, CfResult, CfWod } from '@/services/crossfit/types'
import { addDaysToKey, todayKey, weekStartKey } from '@/utils/dates'

/**
 * Progreso y estadísticas CrossFit: KPIs globales, alta y evolución de marcas
 * de fuerza (1/3/5RM), distribución G/M/W, top de movimientos, resultados
 * recientes con PRs de benchmark y volumen de las últimas 8 semanas.
 * Solo datos reales de cfResults/cfMarks/cfWods: sin demo, con vacíos honestos.
 */

const MODALITY_LABEL: Record<CfModality, string> = { G: 'Gimnasia', M: 'MetCon', W: 'Weightlifting' }

const MOVEMENT_OPTIONS = [
  'Back Squat',
  'Front Squat',
  'Deadlift',
  'Power Clean',
  'Squat Clean',
  'Snatch',
  'Clean & Jerk',
  'Strict Press',
  'Bench Press',
  'Push Press',
].map((m) => ({ value: m, label: m }))

const REPS_OPTIONS = [
  { value: '1', label: '1RM (1 repetición)' },
  { value: '3', label: '3RM (3 repeticiones)' },
  { value: '5', label: '5RM (5 repeticiones)' },
]

function fmtDur(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) { return '—' }
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

interface DashboardData {
  results: CfResult[]
  marks: CfMark[]
  wods: CfWod[]
}

const loadAll = (): Promise<DashboardData> =>
  Promise.all([listResults(), listMarks(), listWods()]).then(([results, marks, wods]) => ({ results, marks, wods }))

export default function CrossfitProgreso() {
  const [data, setData] = useState<DashboardData | null>(null)

  const [movement, setMovement] = useState(MOVEMENT_OPTIONS[0].value)
  const [reps, setReps] = useState('1')
  const [valueKg, setValueKg] = useState('')
  const [date, setDate] = useState(todayKey())
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [chartMovement, setChartMovement] = useState('')

  useEffect(() => {
    let alive = true
    loadAll()
      .then((d) => { if (alive) { setData(d) } })
      .catch(() => { if (alive) { setData({ results: [], marks: [], wods: [] }) } })
    return () => { alive = false }
  }, [])

  const refreshMarks = async () => {
    const fresh = await listMarks()
    setData((d) => (d ? { ...d, marks: fresh } : d))
  }

  const saveMark = async () => {
    setFormError(null)
    setSavedMsg(null)
    const kg = Number(valueKg)
    if (!valueKg || !Number.isFinite(kg) || kg <= 0) {
      setFormError('Ingresá un peso mayor a cero (kg).')
      return
    }
    if (!date) {
      setFormError('Elegí una fecha para la marca.')
      return
    }
    setSaving(true)
    try {
      await newMark({ movement, reps: Number(reps), valueKg: kg, date, notes: notes.trim() || undefined })
      setValueKg('')
      setNotes('')
      setSavedMsg(`Marca guardada: ${movement} ${reps}RM · ${kg} kg.`)
      await refreshMarks()
    } catch {
      setFormError('No se pudo guardar la marca. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async (id: string) => {
    setConfirmId(null)
    setListError(null)
    try {
      await deleteMark(id)
      await refreshMarks()
    } catch {
      setListError('No se pudo eliminar la marca. Probá de nuevo.')
    }
  }

  if (!data) {
    return <p className="text-on-surface-variant text-sm py-8 text-center">Cargando datos…</p>
  }

  const { results, marks, wods } = data
  const today = todayKey()

  // KPIs
  const totalSec = totalTimeSec(results)
  const rounds = totalRounds(results)
  const repsTotal = totalReps(results)
  const rpeAvg = avgRpe(results)

  // Marcas agrupadas por movimiento (la lista viene desc por date).
  const marksByMovement = new Map<string, CfMark[]>()
  for (const m of marks) {
    const group = marksByMovement.get(m.movement)
    if (group) { group.push(m) } else { marksByMovement.set(m.movement, [m]) }
  }
  const bestByMovement = bestMarkByMovement(marks)
  const movementNames = [...marksByMovement.keys()].sort(
    (a, b) => (marksByMovement.get(b)?.[0]?.date ?? '').localeCompare(marksByMovement.get(a)?.[0]?.date ?? ''),
  )
  const chartSel = movementNames.includes(chartMovement) ? chartMovement : movementNames[0] ?? ''
  const chartMarks = (marksByMovement.get(chartSel) ?? []).slice().reverse() // cronológico ascendente
  const chartMax = Math.max(1, ...chartMarks.map((m) => m.valueKg))

  // Distribución y top de movimientos sobre los WODs ejecutados.
  const modalityCount = modalityDistribution(wods, results)
  const modalityTotal = modalityCount.G + modalityCount.M + modalityCount.W
  const topMv = topMovements(wods, results, 6)

  // Resultados recientes y PRs de benchmark.
  const recent = results.slice(0, 10)
  const prs = prByBenchmark(results)
  const prList = [...prs.values()].slice(0, 3)

  // Últimas 8 semanas (de la más vieja a la actual).
  const currentWeekStart = weekStartKey(today)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDaysToKey(currentWeekStart, -7 * i)
    return { start, vol: weeklyVolume(results, start) }
  }).reverse()

  return (
    <div className="space-y-4">
      {/* 1. KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AltheaKPICard icon="schedule" label="Tiempo en WODs" value={fmtDur(totalSec)} subtitle="acumulado histórico" />
        <AltheaKPICard icon="reorder" label="Rondas totales" value={String(rounds)} subtitle="en resultados con conteo" />
        <AltheaKPICard icon="bolt" label="Reps totales" value={String(repsTotal)} subtitle="en resultados con conteo" />
        <AltheaKPICard
          icon="monitoring"
          label="RPE promedio"
          value={rpeAvg === null ? '—' : String(rpeAvg)}
          subtitle={rpeAvg === null ? 'sin resultados con RPE' : 'sobre resultados con RPE'}
        />
      </div>

      {/* 2. Marcas de fuerza: alta */}
      <AltheaCard>
        <div className="space-y-3">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Nueva marca de fuerza</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AltheaSelect label="Movimiento" value={movement} onChange={(e) => setMovement(e.target.value)} options={MOVEMENT_OPTIONS} />
            <AltheaSelect label="Tipo" value={reps} onChange={(e) => setReps(e.target.value)} options={REPS_OPTIONS} />
            <AltheaInput
              label="Carga (kg)"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              value={valueKg}
              onChange={(e) => setValueKg(e.target.value)}
              placeholder="Ej.: 100"
            />
            <AltheaInput label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <AltheaInput
            label="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej.: cinta, última serie con ayuda"
            maxLength={120}
          />

          {formError && <p role="alert" className="text-sm text-error">{formError}</p>}
          {savedMsg && <p role="status" className="text-sm text-secondary font-semibold">{savedMsg}</p>}

          <AltheaButton type="button" onClick={saveMark} loading={saving} className="min-h-[44px]">
            Guardar marca
          </AltheaButton>
        </div>
      </AltheaCard>

      {/* 2. Marcas: lista agrupada + evolución */}
      <div className="grid gap-3 lg:grid-cols-3">
        <AltheaCard className="lg:col-span-2">
          <div className="space-y-3">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Marcas por movimiento</p>
            {listError && <p role="alert" className="text-sm text-error">{listError}</p>}
            {movementNames.length === 0 ? (
              <AltheaEmpty icon="monitoring" title="Sin marcas de fuerza" description="Registrá tu primera marca arriba para empezar a ver la evolución." />
            ) : (
              <div className="space-y-3">
                {movementNames.map((name) => {
                  const group = marksByMovement.get(name) ?? []
                  const best = bestByMovement.get(name)
                  return (
                    <div key={name} className="rounded-lg border border-outline-variant/60 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface">{name}</span>
                        {best && (
                          <AltheaBadge variant="primary" size="xs" icon="workspace_premium">
                            mejor {best.valueKg} kg · {best.date}
                          </AltheaBadge>
                        )}
                      </div>
                      <ul className="divide-y divide-outline-variant/50">
                        {group.map((m) => (
                          <li key={m.id} className="py-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <AltheaBadge size="xs">{m.reps}RM</AltheaBadge>
                              <span className="text-sm text-on-surface-variant whitespace-nowrap">{m.date}</span>
                              {m.notes && <span className="text-xs text-on-surface-variant truncate">{m.notes}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-semibold text-on-surface whitespace-nowrap">{m.valueKg} kg</span>
                              {confirmId === m.id ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-xs text-error font-semibold">¿Eliminar?</span>
                                  <button
                                    type="button"
                                    onClick={() => confirmDelete(m.id)}
                                    aria-label={`Confirmar eliminar marca ${m.reps}RM de ${m.movement}`}
                                    className="min-h-[44px] px-3 rounded-lg border border-error text-error font-label-md text-label-md font-semibold"
                                  >
                                    Sí
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmId(null)}
                                    aria-label="Cancelar eliminación"
                                    className="min-h-[44px] px-3 rounded-lg border border-outline-variant text-on-surface-variant font-label-md text-label-md"
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmId(m.id)}
                                  aria-label={`Eliminar marca ${m.reps}RM de ${m.movement}`}
                                  className="min-h-[44px] min-w-[44px] rounded-lg border border-outline-variant/60 text-on-surface-variant"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </AltheaCard>

        <AltheaCard>
          <div className="space-y-3">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Evolución de la marca</p>
            {movementNames.length === 0 ? (
              <p className="text-on-surface-variant text-sm">Sin datos para graficar.</p>
            ) : (
              <>
                <AltheaSelect
                  label="Movimiento"
                  value={chartSel}
                  onChange={(e) => setChartMovement(e.target.value)}
                  options={movementNames.map((m) => ({ value: m, label: m }))}
                />
                <div className="space-y-2">
                  {chartMarks.map((m) => {
                    const pct = Math.round((m.valueKg / chartMax) * 100)
                    return (
                      <div key={m.id} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-on-surface">{m.date} · {m.reps}RM</span>
                          <span className="text-on-surface-variant">{m.valueKg} kg</span>
                        </div>
                        <div
                          className="h-2 bg-surface-container-high rounded-full overflow-hidden"
                          role="img"
                          aria-label={`${chartSel} ${m.reps}RM: ${m.valueKg} kg el ${m.date}`}
                        >
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </AltheaCard>
      </div>

      {/* 3. Distribución G/M/W + top movimientos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AltheaCard>
          <div className="space-y-3">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Distribución G / M / W</p>
            {modalityTotal === 0 ? (
              <p className="text-on-surface-variant text-sm">Sin WODs ejecutados todavía.</p>
            ) : (
              (['G', 'M', 'W'] as CfModality[]).map((m) => {
                const pct = Math.round((modalityCount[m] / modalityTotal) * 100)
                return (
                  <div key={m} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface">{MODALITY_LABEL[m]} ({m})</span>
                      <span className="text-on-surface-variant">{pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-container-high rounded-full overflow-hidden" role="img" aria-label={`${MODALITY_LABEL[m]}: ${pct}%`}>
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </AltheaCard>

        <AltheaCard>
          <div className="space-y-2">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Top movimientos</p>
            {topMv.length === 0 ? (
              <p className="text-on-surface-variant text-sm">Aún no hay WODs ejecutados.</p>
            ) : (
              <ul className="space-y-1.5">
                {topMv.map((t) => (
                  <li key={t.name} className="flex justify-between text-sm">
                    <span className="text-on-surface">{t.name}</span>
                    <span className="text-on-surface-variant">{t.count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AltheaCard>
      </div>

      {/* 4. Resultados recientes + benchmarks con PR */}
      <div className="grid gap-3 lg:grid-cols-3">
        <AltheaCard className="lg:col-span-2">
          <div className="space-y-2">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Resultados recientes</p>
            {recent.length === 0 ? (
              <AltheaEmpty icon="history" title="Sin resultados todavía" description="Cuando termines un WOD, su resultado aparecerá aquí." />
            ) : (
              <ul className="divide-y divide-outline-variant/50">
                {recent.map((r) => (
                  <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{r.wodName}</p>
                      <p className="text-xs text-on-surface-variant">{r.date} · {r.format} · {r.level.toUpperCase()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.isBenchmark && <AltheaBadge size="xs" variant="primary">BM</AltheaBadge>}
                      <span className="text-sm font-semibold text-on-surface whitespace-nowrap">{r.scoreText}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AltheaCard>

        <div className="space-y-3">
          <AltheaKPICard
            icon="workspace_premium"
            label="Benchmarks con PR"
            value={String(prs.size)}
            subtitle={prs.size === 0 ? 'sin benchmarks ejecutados' : 'mejor marca por benchmark'}
          />
          <AltheaCard>
            <div className="space-y-2">
              <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Mejores marcas</p>
              {prList.length === 0 ? (
                <p className="text-on-surface-variant text-sm">Todavía no completaste benchmarks.</p>
              ) : (
                <ul className="space-y-1.5">
                  {prList.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 text-sm">
                      <span className="text-on-surface truncate">{r.wodName}</span>
                      <span className="font-semibold text-on-surface whitespace-nowrap">{r.scoreText}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AltheaCard>
        </div>
      </div>

      {/* 5. Volumen semanal */}
      <AltheaCard>
        <div className="space-y-3">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Volumen semanal · últimas 8 semanas</p>
          {results.length === 0 ? (
            <p className="text-on-surface-variant text-sm">Sin resultados para mostrar volumen semanal.</p>
          ) : (
            weeks.map(({ start, vol }) => (
              <div key={start} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface">Semana del {start}</span>
                  <span className="text-on-surface-variant">{vol.daysWithResult} {vol.daysWithResult === 1 ? 'día' : 'días'}</span>
                </div>
                <div
                  className="h-2 bg-surface-container-high rounded-full overflow-hidden"
                  role="img"
                  aria-label={`Semana del ${start}: ${vol.daysWithResult} días con resultado`}
                >
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(vol.daysWithResult / 7) * 100}%` }} />
                </div>
                <p className="text-xs text-on-surface-variant">Tiempo total: {fmtDur(vol.totalTimeSec)}</p>
              </div>
            ))
          )}
        </div>
      </AltheaCard>
    </div>
  )
}
