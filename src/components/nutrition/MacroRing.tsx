import { macroPercent } from '@/services/nutrition/macroService'
import type { MacroGoals, MacroTotals } from '@/services/nutrition/macroService'

// Círculo central de macronutrientes.
//
// Tres segmentos concéntricos, cada uno con su PROPIO porcentaje de progreso
// sobre el objetivo real del usuario. No comparten una sola proporcion: si
// proteinas esta al 90 % y grasa al 20 %, cada arco se dibuja por separado.
//
// Las calorías no son un segmento: van en el centro, como dato associated.

type MacroKey = 'carbs' | 'protein' | 'fat'

interface SegmentSpec {
  key: MacroKey
  label: string
  /** token CSS del color: verde oscuro, coral, amarillo */
  color: string
  radius: number
}

const SEGMENTS: SegmentSpec[] = [
  { key: 'carbs', label: 'Carbohidratos', color: 'var(--c-macro-carbs-rgb)', radius: 84 },
  { key: 'protein', label: 'Proteínas', color: 'var(--c-macro-protein-rgb)', radius: 66 },
  { key: 'fat', label: 'Grasas', color: 'var(--c-macro-fat-rgb)', radius: 48 },
]

const STROKE = 13
/** alpha del trazo: semitransparente sobre el marmol claro */
const ALPHA = 0.55

function arcProgress(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) { return 0 }
  return Math.min(percent, 100) / 100
}

function endPoint(radius: number, progress: number): { x: number; y: number } {
  const angle = (-90 + 360 * progress) * (Math.PI / 180)
  return { x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle) }
}

export interface MacroRingProps {
  totals: MacroTotals
  goals: MacroGoals
  /** ancho maximo del circulo en px; la altura se deriva del viewBox */
  size?: number
}

export function MacroRing({ totals, goals, size = 320 }: MacroRingProps) {
  const percents: Record<MacroKey, number> = {
    carbs: macroPercent(totals.carbs, goals.carbs),
    protein: macroPercent(totals.protein, goals.protein),
    fat: macroPercent(totals.fat, goals.fat),
  }
  const consumed: Record<MacroKey, number> = {
    carbs: totals.carbs,
    protein: totals.protein,
    fat: totals.fat,
  }
  const goalOf: Record<MacroKey, number> = {
    carbs: goals.carbs,
    protein: goals.protein,
    fat: goals.fat,
  }

  const kcalGoal = goals.calories
  const kcalPct = macroPercent(totals.calories, kcalGoal)
  const kcalLabel = `${Math.round(totals.calories)} de ${Math.round(kcalGoal)} kcal`

  const description = SEGMENTS.map(s => {
    const p = percents[s.key]
    return `${s.label}: ${Math.round(consumed[s.key])} de ${goalOf[s.key]} gramos, ${Math.round(p)} por ciento`
  }).join('. ')

  return (
    <div className="flex flex-col items-center" data-testid="macro-ring">
      <div className="relative w-full" style={{ maxWidth: size }}>
        <svg
          viewBox="0 0 200 200"
          className="w-full h-auto"
          role="img"
          aria-label={`${description}. Calorías: ${kcalLabel}.`}
        >
          {SEGMENTS.map(seg => {
            const circumference = 2 * Math.PI * seg.radius
            const percent = percents[seg.key]
            const progress = arcProgress(percent)
            const over = percent > 100
            const end = endPoint(seg.radius, progress)
            return (
              <g
                key={seg.key}
                data-macro={seg.key}
                data-percent={Math.round(percent * 10) / 10}
                data-over={over ? 'true' : 'false'}
              >
                {/* pista */}
                <circle
                  cx="100"
                  cy="100"
                  r={seg.radius}
                  fill="none"
                  stroke="var(--c-outline-variant)"
                  strokeWidth={STROKE}
                  opacity={0.5}
                />
                {/* progreso propio del segmento */}
                <circle
                  cx="100"
                  cy="100"
                  r={seg.radius}
                  fill="none"
                  stroke={`rgb(${seg.color} / ${over ? ALPHA + 0.25 : ALPHA})`}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${progress * circumference} ${circumference}`}
                  transform="rotate(-90 100 100)"
                  className="transition-all duration-700"
                />
                {/* punto de cierre: marca cuando el segmento se completa */}
                {progress > 0 && (
                  <circle
                    cx={end.x}
                    cy={end.y}
                    r={3.2}
                    fill={`rgb(${seg.color} / ${over ? 1 : 0.9})`}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* Calorías: dato independiente en el centro, no un segmento */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center select-none px-4">
            <div className="font-label-caps text-[9px] uppercase tracking-wider text-on-surface-variant">
              Consumidas
            </div>
            <div
              className="font-headline-md text-headline-md font-bold text-on-surface leading-tight"
              data-macro="calories"
            >
              {Math.round(totals.calories).toLocaleString('es-AR')}
            </div>
            <div className="font-mono text-[10px] font-semibold text-on-surface-variant">
              de {Math.round(kcalGoal).toLocaleString('es-AR')} kcal
            </div>
            {kcalPct > 100 && (
              <div className="font-mono text-[9px] font-semibold text-error mt-0.5">
                {Math.round(kcalPct)}%
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leyenda: los tres porcentajes, cada uno del segmento que le corresponde */}
      <div className="w-full grid grid-cols-3 gap-2 mt-2" data-testid="macro-ring-legend">
        {SEGMENTS.map(seg => {
          const percent = percents[seg.key]
          const over = percent > 100
          return (
            <div
              key={seg.key}
              data-legend={seg.key}
              className={`rounded-lg border px-2 py-2 text-center bg-surface-container/40 ${
                over ? 'border-error/40' : 'border-outline-variant/40'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-on-surface">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: `rgb(${seg.color} / 0.85)` }}
                  aria-hidden="true"
                />
                <span className="truncate">{seg.label.slice(0, 4)}</span>
              </div>
              <div className="font-mono text-sm font-bold text-on-surface mt-0.5">
                {Math.round(consumed[seg.key])}g
              </div>
              <div className="font-mono text-[10px] text-on-surface-variant">
                / {goalOf[seg.key]}g
              </div>
              <div
                className={`font-mono text-[10px] font-semibold ${
                  over ? 'text-error' : 'text-on-surface-variant'
                }`}
              >
                {Math.round(percent)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MacroRing
