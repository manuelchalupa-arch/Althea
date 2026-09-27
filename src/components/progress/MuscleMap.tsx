// Mapa muscular frontal/posterior — MÚSCULO A MÚSCULO (no por grupo).
//
// Geometría (muscleGeometry.ts) y datos (muscleCatalog.ts) están desacoplados
// de este componente: aquí solo se dibuja. El color codifica el TREND del grupo
// al que pertenece el músculo (verde aumento, amarillo estable, rojo descenso,
// sin base = neutro) y la opacidad el % de carga de ese grupo. Cada músculo es
// seleccionable (click/Enter/Space) y expone su ficha en tooltip. La mitad
// derecha del cuerpo se dibuja una vez y se refleja con transform, de modo que
// izquierda y derecha son idénticas (consistencia entre lados).
import { useState } from 'react'
import { TREND_COLOR, type MuscleGroup, type MuscleTrend } from '@/services/training/muscleGroups'
import {
  ACTIVATION_LABEL, getMuscle, musclesForView, synergyNames,
} from '@/services/training/muscleCatalog'
import { MIRROR_TRANSFORM, MUSCLE_SHAPES, SILHOUETTE, TORSO_DETAIL } from '@/services/training/muscleGeometry'

export type MuscleView = 'front' | 'back'

export interface MuscleMapProps {
  view: MuscleView
  pctByGroup: Partial<Record<MuscleGroup, number>>
  trendByGroup: Partial<Record<MuscleGroup, MuscleTrend>>
  /** Músculo seleccionado (data-muscle-id). */
  selectedMuscle?: string | null
  /** Grupo resaltado cuando la selección viene de la lista de grupos. */
  selected?: MuscleGroup | null
  onSelectMuscle?: (muscleId: string) => void
  className?: string
}

export const MUSCLE_MAP_LEGEND: Array<{ trend: MuscleTrend; label: string }> = [
  { trend: 'aumento', label: 'Aumento' },
  { trend: 'estable', label: 'Estable' },
  { trend: 'descenso', label: 'Descenso' },
  { trend: 'sin-base', label: 'Sin base' },
]

/** Dibuja una mitad derecha y su espejo (x -> 120 - x). */
function Mirror({ paths }: { paths: string[] }) {
  return (
    <>
      {paths.map((d, i) => <path key={`r${i}`} d={d} />)}
      <g transform={MIRROR_TRANSFORM}>{paths.map((d, i) => <path key={`l${i}`} d={d} />)}</g>
    </>
  )
}

export function MuscleMap({
  view, pctByGroup, trendByGroup, selectedMuscle, selected, onSelectMuscle, className = '',
}: MuscleMapProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const muscles = musclesForView(view)
  const label = view === 'front' ? 'Mapa muscular frontal' : 'Mapa muscular posterior'
  const visibleId = hovered ?? selectedMuscle ?? null
  const visible = visibleId ? getMuscle(visibleId) : null
  const showTooltip = !!visible && visible.view === view

  return (
    <div className={`relative inline-block ${className}`}>
      <svg
        viewBox="0 0 120 200"
        className="w-full max-w-[190px] mx-auto block"
        role="group"
        aria-label={label}
        data-testid={`muscle-map-${view}`}
      >
        <g aria-hidden="true" fill="var(--c-surface-container-high)" stroke="var(--c-outline)" strokeWidth="0.6" opacity="0.55">
          <Mirror paths={SILHOUETTE[view]} />
        </g>
        <g aria-hidden="true" fill="none" stroke="var(--c-outline)" strokeWidth="0.5" strokeLinecap="round" opacity="0.45">
          <Mirror paths={TORSO_DETAIL} />
        </g>
        {muscles.map(m => {
          const shapes = MUSCLE_SHAPES[view].filter(s => s.id === m.id)
          if (shapes.length === 0) { return null }
          const pct = pctByGroup[m.group] ?? 0
          const trend = trendByGroup[m.group] ?? 'sin-base'
          const color = pct > 0 ? TREND_COLOR[trend] : 'var(--c-outline-variant)'
          const isSel = selectedMuscle === m.id
          const inSelGroup = !isSel && selected === m.group
          const strokeW = isSel ? 2 : inSelGroup ? 1.4 : 0.7
          const opacity = pct > 0 ? 0.3 + Math.min(pct, 100) / 100 * 0.6 : 0.12
          const paths = shapes.flatMap(s => s.paths)
          return (
            <g
              key={m.id}
              data-muscle-id={m.id}
              data-muscle-name={m.nameEs}
              data-muscle-group={m.group}
              data-muscle-activation={m.activation}
              data-testid={`muscle-path-${m.id}`}
              role={onSelectMuscle ? 'button' : undefined}
              tabIndex={onSelectMuscle ? 0 : undefined}
              aria-pressed={isSel || undefined}
              aria-label={`${m.nameEs}, ${m.group}, ${pct}% del trabajo`}
              className={onSelectMuscle ? 'cursor-pointer focus:outline-none' : undefined}
              onClick={onSelectMuscle ? () => onSelectMuscle(m.id) : undefined}
              onKeyDown={onSelectMuscle ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectMuscle(m.id) }
              } : undefined}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(prev => (prev === m.id ? null : prev))}
              onFocus={onSelectMuscle ? () => setHovered(m.id) : undefined}
              onBlur={() => setHovered(prev => (prev === m.id ? null : prev))}
            >
              <g fill={color} fillOpacity={opacity} stroke={color} strokeOpacity={isSel || inSelGroup ? 1 : 0.7} strokeWidth={strokeW}>
                <Mirror paths={paths} />
              </g>
            </g>
          )
        })}
      </svg>

      {showTooltip && visible && (
        <div
          role="tooltip"
          data-testid="muscle-tooltip"
          className="absolute left-0 top-full mt-2 w-[190px] max-w-[calc(100vw-2rem)] z-20 rounded-xl border border-outline-variant/50 bg-surface-container p-3 shadow-xl pointer-events-none"
        >
          <p className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface">{visible.nameEs}</p>
          <p className="font-body-sm text-[11px] italic text-on-surface-variant">{visible.nameAnatomy}</p>
          <p className="font-body-sm text-[11px] text-on-surface-variant mt-1">
            {visible.group} · {ACTIVATION_LABEL[visible.activation]}
          </p>
          <p className="font-body-sm text-[11px] text-on-surface-variant">
            Trabaja con: {synergyNames(visible).join(', ') || '—'}
          </p>
          <p className="font-body-sm text-[11px] text-on-surface-variant">
            Ejercicios: {visible.exercises.join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

export function MuscleMapLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="muscle-map-legend">
      {MUSCLE_MAP_LEGEND.map(l => (
        <li key={l.trend} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: TREND_COLOR[l.trend] }} />
          <span className="font-body-sm text-[11px] text-on-surface-variant">{l.label}</span>
        </li>
      ))}
    </ul>
  )
}

export const MUSCLE_MAP_VIEWS: Array<{ id: MuscleView; label: string }> = [
  { id: 'front', label: 'Frontal' },
  { id: 'back', label: 'Posterior' },
]
