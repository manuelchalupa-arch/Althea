/**
 * GRÁFICA TEMPORAL DEL PERÍODO — barras de volumen por día (o por bloque
 * semanal cuando el intervalo supera 31 días).
 *
 * Sin dependencias: divs con altura proporcional al máximo de LA CONSULTA.
 * Los días sin entrenamiento se muestran como barra en cero, explícitos, sin
 * inventar sesiones. `role="img"` con etiqueta que resume el intervalo.
 */
import type { AtlasMetric, BinnedPoint } from './atlasQuery'
import { chartValueOf } from './atlasQuery'

export interface PeriodChartProps {
  points: BinnedPoint[]
  /** Métrica visualizada (toda la escala usa exclusivamente esta métrica). */
  metric: AtlasMetric
  /** Valor máximo de la métrica en la consulta (para la escala). */
  max: number
  unit?: string
  title?: string
}

export function PeriodChart({ points, metric, max, unit = 'kg', title = 'Actividad del período' }: PeriodChartProps) {
  const scale = max > 0 ? max : 1
  const activeDays = points.filter((p) => p.hasWork).length
  return (
    <div className="atlas-chart" data-testid="atlas-chart" role="img" aria-label={`${title}: ${activeDays} de ${points.length} intervalos con entrenamiento`}>
      <div className="atlas-chart__bars">
        {points.map((p) => {
          const v = chartValueOf(p, metric)
          const h = p.hasWork ? Math.max(4, Math.round((v / scale) * 100)) : 0
          return (
            <div key={p.key} className="atlas-chart__col" title={`${p.from}${p.to !== p.from ? ` – ${p.to}` : ''} · ${v.toLocaleString('es-AR')} ${unit} · ${p.sets} series`}>
              <div
                className={`atlas-chart__bar${p.hasWork ? ' is-active' : ' is-zero'}`}
                style={{ height: `${h}%` }}
              />
              <span className="atlas-chart__label" aria-hidden="true">{p.label}</span>
            </div>
          )
        })}
      </div>
      <p className="atlas-chart__foot">
        {activeDays} de {points.length} intervalo{points.length === 1 ? '' : 's'} con entrenamiento
      </p>
    </div>
  )
}
