// Panel protagonista de Progreso: mapa muscular frontal/posterior por grupo con
// comparación semana a semana del ciclo. Todos los valores provienen del
// volumen ejecutado y la atribución muscular real; BASE = primera semana
// completa del ciclo. Sin datos, la UI lo dice; no se rellena nada.
import { useState } from 'react'
import { AltheaBadge, AltheaButton } from '@/components/althea'
import { MuscleMap, MuscleMapLegend, MUSCLE_MAP_VIEWS, type MuscleView } from './MuscleMap'
import {
  MUSCLE_GROUPS, TREND_COLOR, TREND_LABEL,
  type GroupWeekStat, type MuscleGroup, type MuscleTrend,
} from '@/services/training/muscleGroups'
import { displayMuscle } from '@/utils/muscleMap'
import { ACTIVATION_LABEL, getMuscle, synergyNames } from '@/services/training/muscleCatalog'

export interface MuscleMapPanelProps {
  weeks: GroupWeekStat[]
  currentWeekIndex: number
  currentByGroup: Record<string, number>
  unmappedSets: number
  cycleStartDate: string
  hasAnySet: boolean
}

const fmtKg = (n: number) => `${Math.round(n).toLocaleString('es-AR')} kg`
const fmtSigned = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n).toLocaleString('es-AR')}`

export function MuscleMapPanel({
  weeks, currentWeekIndex, currentByGroup, unmappedSets, cycleStartDate, hasAnySet,
}: MuscleMapPanelProps) {
  const [view, setView] = useState<MuscleView>('front')
  const [weekSel, setWeekSel] = useState<number>(0) // 0 = semana en curso
  const [groupSel, setGroupSel] = useState<MuscleGroup | null>(null)
  const [muscleSel, setMuscleSel] = useState<string | null>(null)

  // Seleccionar un músculo en el mapa enfoca también su grupo.
  const selectMuscle = (id: string) => {
    const entity = getMuscle(id)
    if (!entity) { return }
    setMuscleSel(prev => (prev === id ? null : id))
    setGroupSel(prev => {
      if (muscleSel === id) { return null }
      return entity.group
    })
  }
  const clearMuscle = () => setMuscleSel(null)

  // Semana en curso (estado actual) o una semana completa seleccionada.
  const selectedWeek = weekSel === 0 ? null : (weeks.find(w => w.week === weekSel) ?? null)
  const priorWeek = selectedWeek ? weeks.find(w => w.week === selectedWeek.week - 1) ?? null : null
  const currentStat = selectedWeek ? null : weeks[weeks.length - 1] ?? null

  const pctByGroup = (() => {
    const out: Partial<Record<MuscleGroup, number>> = {}
    const base = selectedWeek ? selectedWeek : currentStat
    const vol = selectedWeek ? selectedWeek.byGroup : currentByGroup
    const total = MUSCLE_GROUPS.reduce((a, g) => a + (vol[g] ?? 0), 0)
    for (const g of MUSCLE_GROUPS) { out[g] = total > 0 ? Math.round(((vol[g] ?? 0) / total) * 100) : 0 }
    return out
  })()

  const trendByGroup = (() => {
    const out: Partial<Record<MuscleGroup, MuscleTrend>> = {}
    for (const g of MUSCLE_GROUPS) {
      out[g] = selectedWeek ? (selectedWeek.trend[g] ?? 'sin-base') : (priorWeek ? (priorWeek.trend[g] ?? 'sin-base') : 'sin-base')
    }
    return out
  })()

  const weekLabel = selectedWeek
    ? `Semana ${selectedWeek.week}${selectedWeek.isBase ? ' · BASE' : ''}`
    : `Semana ${currentWeekIndex} · en curso`

  if (!hasAnySet) {
    return (
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-5" data-testid="muscle-map-panel">
        <h2 className="font-headline-lg text-lg font-semibold text-on-surface">Mapa muscular</h2>
        <p className="font-body-md text-sm text-on-surface-variant mt-2">
          Sin series completadas todavía. Registrá tu primera sesión en Entrenar: el mapa se construye con el volumen y la atribución muscular reales de tus ejercicios.
        </p>
      </section>
    )
  }

  return (
    <section
      className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 md:p-5 space-y-4"
      data-testid="muscle-map-panel"
      aria-label="Mapa muscular por grupo y comparación semanal"
    >
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-headline-lg text-xl font-semibold text-on-surface tracking-tight">Mapa muscular</h2>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Trabajo ponderado por grupo (principal 100% · secundarios 50%/25%). Ciclo iniciado el {cycleStartDate}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-lg border border-outline-variant/60 overflow-hidden" role="group" aria-label="Vista del cuerpo">
            {MUSCLE_MAP_VIEWS.map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                aria-pressed={view === v.id}
                data-testid={`muscle-view-${v.id}`}
                className={`min-h-[44px] px-3 flex items-center font-label-caps text-[10px] font-semibold uppercase tracking-widest ${view === v.id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Selector de semana de ciclo */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Semana de ciclo">
        {weeks.map(w => (
          <button
            key={w.week}
            onClick={() => { setWeekSel(w.week); setGroupSel(null); clearMuscle() }}
            aria-pressed={weekSel === w.week}
            data-testid={`cycle-week-${w.week}`}
            className={`min-h-[44px] px-3 flex items-center gap-1.5 rounded-lg border font-label-caps text-[10px] font-semibold uppercase tracking-widest transition-colors ${weekSel === w.week ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container border-outline-variant/60 text-on-surface-variant'}`}
          >
            S{w.week}
            {w.isBase && <span className="text-secondary">BASE</span>}
          </button>
        ))}
        <button
          onClick={() => { setWeekSel(0); setGroupSel(null); clearMuscle() }}
          aria-pressed={weekSel === 0}
          data-testid="cycle-week-current"
          className={`min-h-[44px] px-3 flex items-center rounded-lg border font-label-caps text-[10px] font-semibold uppercase tracking-widest transition-colors ${weekSel === 0 ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container border-outline-variant/60 text-on-surface-variant'}`}
        >
          Actual
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-start">
        {/* Cuerpo */}
        <div className="flex justify-center md:justify-start">
          <MuscleMap
            view={view}
            pctByGroup={pctByGroup}
            trendByGroup={trendByGroup}
            selected={groupSel}
            selectedMuscle={muscleSel}
            onSelectMuscle={selectMuscle}
          />
        </div>

        {/* Grupos: carga y estado */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{weekLabel}</span>
            <MuscleMapLegend />
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" data-testid="muscle-group-list">
            {MUSCLE_GROUPS.map(g => {
              const vol = selectedWeek ? (selectedWeek.byGroup[g] ?? 0) : (currentByGroup[g] ?? 0)
              const prev = selectedWeek && priorWeek ? (priorWeek.byGroup[g] ?? 0) : null
              const delta = selectedWeek ? selectedWeek.delta[g] ?? null : (priorWeek && vol > 0 ? Math.round((vol - (priorWeek.byGroup[g] ?? 0)) * 10) / 10 : null)
              const deltaPct = selectedWeek ? selectedWeek.deltaPct[g] ?? null : null
              const trend = trendByGroup[g] ?? 'sin-base'
              const active = groupSel === g
              return (
                <li key={g}>
                  <button
                    onClick={() => { clearMuscle(); setGroupSel(prev2 => (prev2 === g ? null : g)) }}
                    aria-pressed={active}
                    data-testid={`muscle-group-${g}`}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${active ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container hover:border-outline'}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: vol > 0 ? TREND_COLOR[trend] : 'var(--c-outline-variant)' }} />
                        <span className="font-label-caps text-[10px] font-semibold uppercase tracking-wider text-on-surface truncate">{g}</span>
                      </span>
                      <span className="font-label-md text-[12px] font-semibold text-on-surface tabular-nums">{vol > 0 ? fmtKg(vol) : '—'}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="font-body-sm text-[10px] text-on-surface-variant tabular-nums">
                        {pctByGroup[g] ?? 0}% del trabajo
                      </span>
                      <span className="font-body-sm text-[10px] font-semibold" style={{ color: vol > 0 ? TREND_COLOR[trend] : 'var(--c-outline-variant)' }}>
                        {delta === null ? TREND_LABEL[trend] : `${fmtSigned(delta)} kg · ${deltaPct === null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`}`}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Ficha del músculo seleccionado en el mapa */}
      {muscleSel && getMuscle(muscleSel) && (() => {
        const m = getMuscle(muscleSel)!
        return (
          <div className="rounded-xl border border-primary/50 bg-primary/5 p-3 space-y-1" data-testid="muscle-detail">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-label-md text-sm font-semibold text-on-surface">{m.nameEs}</h3>
              <span className="font-body-sm text-[11px] italic text-on-surface-variant">{m.nameAnatomy}</span>
            </div>
            <p className="font-body-sm text-[11px] text-on-surface-variant">
              {m.group} · Activación {ACTIVATION_LABEL[m.activation].toLowerCase()}
            </p>
            <p className="font-body-sm text-[11px] text-on-surface-variant">
              Sinergistas: {synergyNames(m).join(', ') || '—'}
            </p>
            <p className="font-body-sm text-[11px] text-on-surface-variant">
              Ejercicios: {m.exercises.join(', ')}
            </p>
            <button
              onClick={clearMuscle}
              data-testid="muscle-detail-clear"
              className="min-h-[44px] px-3 mt-1 rounded-lg border border-outline-variant/60 font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant"
            >
              Quitar selección
            </button>
          </div>
        )
      })()}

      {/* Detalle del grupo seleccionado */}
      {groupSel && (() => {
        const vol = selectedWeek ? (selectedWeek.byGroup[groupSel] ?? 0) : (currentByGroup[groupSel] ?? 0)
        const prev = priorWeek ? (priorWeek.byGroup[groupSel] ?? 0) : null
        const delta = selectedWeek ? selectedWeek.delta[groupSel] ?? null : (prev !== null ? Math.round((vol - prev) * 10) / 10 : null)
        const deltaPct = selectedWeek ? selectedWeek.deltaPct[groupSel] ?? null : (prev && prev > 0 ? Math.round(((vol - prev) / prev) * 1000) / 10 : null)
        const trend = trendByGroup[groupSel] ?? 'sin-base'
        const muscles = (selectedWeek?.musclesByGroup[groupSel] ?? []).slice(0, 6)
        return (
          <div className="rounded-xl border border-outline-variant/50 bg-surface-container p-3 space-y-2" data-testid="muscle-group-detail">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-label-caps text-[11px] font-semibold uppercase tracking-widest text-on-surface">{groupSel}</h3>
              <AltheaBadge variant={trend === 'aumento' ? 'success' : trend === 'descenso' ? 'danger' : trend === 'estable' ? 'warning'  : 'default'} icon={trend === 'aumento' ? 'trending_up' : trend === 'descenso' ? 'trending_down' : 'trending_flat'}>
                {TREND_LABEL[trend]}
              </AltheaBadge>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-surface-container-highest rounded-lg p-2">
                <dt className="font-label-caps text-[9px] uppercase text-outline">Trabajo actual</dt>
                <dd className="font-headline-md text-sm font-semibold text-on-surface">{vol > 0 ? fmtKg(vol) : '—'}</dd>
              </div>
              <div className="bg-surface-container-highest rounded-lg p-2">
                <dt className="font-label-caps text-[9px] uppercase text-outline">Semana anterior</dt>
                <dd className="font-headline-md text-sm font-semibold text-on-surface">{prev === null ? '—' : prev > 0 ? fmtKg(prev) : '0 kg'}</dd>
              </div>
              <div className="bg-surface-container-highest rounded-lg p-2">
                <dt className="font-label-caps text-[9px] uppercase text-outline">Cambio</dt>
                <dd className="font-headline-md text-sm font-semibold" style={{ color: delta === null ? 'var(--c-on-surface)' : delta >= 0 ? TREND_COLOR.aumento : TREND_COLOR.descenso }}>
                  {delta === null ? 'Sin base' : fmtSigned(delta)}
                </dd>
              </div>
              <div className="bg-surface-container-highest rounded-lg p-2">
                <dt className="font-label-caps text-[9px] uppercase text-outline">Variación</dt>
                <dd className="font-headline-md text-sm font-semibold text-on-surface">{deltaPct === null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct}%`}</dd>
              </div>
            </dl>
            {muscles.length > 0 && (
              <div>
                <span className="font-label-caps text-[9px] uppercase text-outline">Músculos del grupo</span>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {muscles.map(m => (
                    <li key={m.muscle} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-container-highest">
                      <span className="font-body-sm text-[11px] text-on-surface">{displayMuscle(m.muscle)}</span>
                      <span className="font-label-caps text-[10px] font-semibold text-on-surface tabular-nums">{m.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })()}

      {unmappedSets > 0 && (
        <p className="font-body-sm text-[11px] text-on-surface-variant">
          {unmappedSets} {unmappedSets === 1 ? 'serie queda' : 'series quedan'} sin atribución muscular (ejercicio sin datos de biblioteca). No se imputa a ningún grupo.
        </p>
      )}
    </section>
  )
}
