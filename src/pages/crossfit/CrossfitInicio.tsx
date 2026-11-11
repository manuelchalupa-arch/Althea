import { useEffect, useState } from 'react'
import { AltheaCard } from '@/components/althea/AltheaCard'
import { AltheaEmpty } from '@/components/althea/AltheaEmpty'
import { AltheaKPICard } from '@/components/althea/AltheaKPI'
import { AltheaBadge } from '@/components/althea/AltheaBadge'
import { listMarks, listResults, listSchedule, listWods } from '@/services/crossfit/cfStore'
import type { CfMark, CfModality, CfResult, CfScheduleEntry, CfWod } from '@/services/crossfit/types'
import { addDaysToKey, todayKey, weekStartKey } from '@/utils/dates'
import type { CrossfitSectionId } from '../Crossfit'

const MODALITY_LABEL: Record<CfModality, string> = { G: 'Gimnasia', M: 'MetCon', W: 'Weightlifting' }

function fmtDur(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) { return '—' }
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function isTrainingKind(kind: CfScheduleEntry['kind']): boolean {
  return kind !== 'rest' && kind !== 'recovery'
}

interface DashboardData {
  schedule: CfScheduleEntry[]
  results: CfResult[]
  marks: CfMark[]
  wods: CfWod[]
}

/**
 * Dashboard CrossFit: solo datos reales de cfSchedule/cfResults/cfMarks.
 * Sin valores de demostración: con vacío, muestra estados vacíos honestos.
 */
export default function CrossfitInicio({ onNavigate }: { onNavigate: (id: CrossfitSectionId) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([listSchedule(), listResults(), listMarks(), listWods()])
      .then(([schedule, results, marks, wods]) => {
        if (alive) { setData({ schedule, results, marks, wods }) }
      })
      .catch(() => { if (alive) { setData({ schedule: [], results: [], marks: [], wods: [] }) } })
    return () => { alive = false }
  }, [])

  if (!data) {
    return <p className="text-on-surface-variant text-sm py-8 text-center">Cargando datos…</p>
  }

  const { schedule, results, marks, wods } = data
  const today = todayKey()
  const wodById = new Map(wods.map((w) => [w.id, w]))

  const todayEntry = schedule.find((s) => s.date === today && isTrainingKind(s.kind))
  const wodOfDay = todayEntry?.wodId ? wodById.get(todayEntry.wodId) ?? null : null
  const nextEntry = schedule.find((s) => s.date > today && isTrainingKind(s.kind))

  const weekStart = weekStartKey(today)
  const weekEnd = addDaysToKey(weekStart, 6)
  const weekResults = results.filter((r) => r.date >= weekStart && r.date <= weekEnd)
  const weekPlanned = schedule.filter((s) => s.date >= weekStart && s.date <= weekEnd && isTrainingKind(s.kind))
  const compliance = weekPlanned.length > 0 ? Math.min(100, Math.round((weekResults.length / weekPlanned.length) * 100)) : null

  const lastResult = results[0] ?? null
  const totalSec = results.reduce((acc, r) => acc + (r.timeSec ?? 0), 0)
  const totalReps = results.reduce((acc, r) => acc + (r.reps ?? 0), 0)

  // Distribución de modalidades sobre los WODs realmente ejecutados.
  const modalityCount: Record<CfModality, number> = { G: 0, M: 0, W: 0 }
  const movementCount = new Map<string, number>()
  for (const r of results) {
    const wod = r.wodId ? wodById.get(r.wodId) : undefined
    if (!wod) { continue }
    for (const m of wod.modalities) { modalityCount[m] += 1 }
    for (const mv of wod.movements) {
      movementCount.set(mv.name, (movementCount.get(mv.name) ?? 0) + 1)
    }
  }
  const modalityTotal = modalityCount.G + modalityCount.M + modalityCount.W
  const topMovements = [...movementCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const recentMarks = marks.slice(0, 3)
  const recentResults = results.slice(0, 5)

  return (
    <div className="space-y-4">
      {/* WOD del día + próximo */}
      <div className="grid gap-3 sm:grid-cols-2">
        <AltheaCard>
          <div className="space-y-2">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">WOD de hoy</p>
            {todayEntry && wodOfDay ? (
              <>
                <h2 className="font-headline text-lg font-semibold text-on-surface">{wodOfDay.name}</h2>
                <div className="flex flex-wrap gap-1.5">
                  <AltheaBadge>{wodOfDay.format}</AltheaBadge>
                  {wodOfDay.modalities.map((m) => <AltheaBadge key={m}>{m}</AltheaBadge>)}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('wod')}
                  className="min-h-[44px] w-full rounded-lg bg-primary text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest transition active:scale-[0.98]"
                >
                  Abrir WOD
                </button>
              </>
            ) : todayEntry ? (
              <p className="text-on-surface-variant text-sm">
                Sesión de {todayEntry.kind === 'recovery' ? 'recuperación' : 'entrenamiento'} sin WOD adjunto.
                <button type="button" onClick={() => onNavigate('programacion')} className="ml-1 underline text-on-surface min-h-[44px]">
                  Ver programación
                </button>
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-on-surface-variant text-sm">No hay entrenamiento programado para hoy.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onNavigate('programacion')} className="min-h-[44px] flex-1 rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface">
                    Programar
                  </button>
                  <button type="button" onClick={() => onNavigate('constructor')} className="min-h-[44px] flex-1 rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface">
                    Crear WOD
                  </button>
                </div>
              </div>
            )}
          </div>
        </AltheaCard>

        <AltheaCard>
          <div className="space-y-2">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Próximo entrenamiento</p>
            {nextEntry ? (
              <>
                <p className="font-headline text-lg font-semibold text-on-surface">
                  {nextEntry.title ?? wodById.get(nextEntry.wodId ?? '')?.name ?? `Día ${nextEntry.kind}`}
                </p>
                <p className="text-on-surface-variant text-sm">{nextEntry.date}</p>
              </>
            ) : (
              <p className="text-on-surface-variant text-sm">No hay sesiones futuras programadas.</p>
            )}
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant pt-1">Último resultado</p>
            {lastResult ? (
              <p className="text-on-surface text-sm">
                <span className="font-semibold">{lastResult.wodName}</span> — {lastResult.scoreText}
                <span className="text-on-surface-variant"> ({lastResult.date})</span>
              </p>
            ) : (
              <p className="text-on-surface-variant text-sm">Sin entrenamientos registrados.</p>
            )}
          </div>
        </AltheaCard>
      </div>

      {/* KPIs semanales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AltheaKPICard icon="exercise" label="Esta semana" value={String(weekResults.length)} subtitle={`${weekPlanned.length} programados`} />
        <AltheaKPICard icon="schedule" label="Tiempo en WODs" value={fmtDur(totalSec)} subtitle="acumulado histórico" />
        <AltheaKPICard icon="bolt" label="Reps registradas" value={String(totalReps)} subtitle="en resultados con conteo" />
        <AltheaKPICard
          icon="monitoring"
          label="Cumplimiento"
          value={compliance === null ? '—' : `${compliance}%`}
          subtitle={compliance === null ? 'sin programación esta semana' : `${weekResults.length}/${weekPlanned.length} sesiones`}
        />
      </div>

      {/* Modalidades + movimientos + marcas */}
      <div className="grid gap-3 lg:grid-cols-3">
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
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Movimientos trabajados</p>
            {topMovements.length === 0 ? (
              <p className="text-on-surface-variant text-sm">Aún no hay WODs ejecutados.</p>
            ) : (
              <ul className="space-y-1.5">
                {topMovements.map(([name, count]) => (
                  <li key={name} className="flex justify-between text-sm">
                    <span className="text-on-surface">{name}</span>
                    <span className="text-on-surface-variant">{count}×</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AltheaCard>

        <AltheaCard>
          <div className="space-y-2">
            <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Marcas personales</p>
            {recentMarks.length === 0 ? (
              <p className="text-on-surface-variant text-sm">Sin marcas registradas.</p>
            ) : (
              <ul className="space-y-1.5">
                {recentMarks.map((m) => (
                  <li key={m.id} className="flex justify-between text-sm">
                    <span className="text-on-surface">{m.movement} · {m.reps}RM</span>
                    <span className="font-semibold text-on-surface">{m.valueKg} kg</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => onNavigate('progreso')} className="min-h-[44px] w-full rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface">
              Ver progreso completo
            </button>
          </div>
        </AltheaCard>
      </div>

      {/* Historial reciente */}
      <AltheaCard>
        <div className="space-y-2">
          <p className="font-label-caps text-[10px] uppercase tracking-[0.16em] text-on-surface-variant">Resultados recientes</p>
          {recentResults.length === 0 ? (
            <AltheaEmpty icon="history" title="Sin resultados todavía" description="Cuando termines un WOD, su resultado aparecerá aquí." />
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {recentResults.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{r.wodName}</p>
                    <p className="text-xs text-on-surface-variant">{r.date} · {r.format} · {r.level.toUpperCase()}</p>
                  </div>
                  <span className="text-sm font-semibold text-on-surface whitespace-nowrap">{r.scoreText}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </AltheaCard>
    </div>
  )
}
