// Botella de agua: una única, grande y claramente reconocible, con llenado
// proporcional al consumo real contra el objetivo real. La medida principal es
// "botellas / objetivo"; los mililitros quedan como dato secundario exacto.
// SVG puro (sin imágenes, sin dependencias) para que escale nítido y respete
// el color del tema. Datos: hydrationBottles.ts (db.hydrationBottleLogs).
import { useCallback, useEffect, useState } from 'react'
import {
  getBottleConfigs, getBottleDailySummary, getCalculatedHydrationGoal, completeBottle,
  addHydrationMl,
  type BottleConfig,
} from '@/services/recovery/hydrationBottles'
import { todayKey } from '@/utils/dates'

const fmtMl = (n: number) => `${Math.round(n).toLocaleString('es-AR')} ml`
/** Capacidad de referencia cuando el usuario no configuró botellas. */
const FALLBACK_BOTTLE_ML = 500

export interface WaterBottleProps {
  /** Fecha local YYYY-MM-DD. Por defecto hoy. */
  date?: string
  /** Muestra los botones para registrar cada botella configurada. */
  allowQuickAdd?: boolean
  /** Fila horizontal reducida (uso en recovery/widget). */
  compact?: boolean
  /** Tamaño de la botella. `lg` para las vistas principales (Inicio, Nutrición). */
  size?: 'sm' | 'md' | 'lg'
  /** Cambiar este valor fuerza una relectura (registros hechos desde arriba). */
  refreshKey?: number
  className?: string
}

const SIZES = {
  sm: { box: 'w-24 h-40', metric: 'text-2xl' },
  md: { w: 168, h: 268, box: 'w-[168px] h-[268px]', metric: 'text-4xl' },
  lg: { w: 208, h: 332, box: 'w-[208px] h-[332px]', metric: 'text-5xl' },
} as const

export function WaterBottle({ date, allowQuickAdd = true, compact = false, size, refreshKey = 0, className = '' }: WaterBottleProps) {
  const day = date ?? todayKey()
  const [totalMl, setTotalMl] = useState(0)
  const [goalMl, setGoalMl] = useState(0)
  const [bottles, setBottles] = useState<BottleConfig[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // (G) Carga manual de mililitros: cualquier monto, no solo las botellas.
  const [manualMl, setManualMl] = useState('')

  const reload = useCallback(async () => {
    const [summary, goal, cfgs] = await Promise.all([
      getBottleDailySummary(day),
      getCalculatedHydrationGoal().catch(() => 0),
      getBottleConfigs().catch(() => [] as BottleConfig[]),
    ])
    setTotalMl(summary.totalMl)
    setGoalMl(goal)
    setBottles(cfgs.filter((c) => c.active))
    const counts: Record<string, number> = {}
    for (const pb of summary.perBottle) { counts[pb.bottleId] = pb.count }
    setCounts(counts)
  }, [day])

  useEffect(() => {
    let alive = true
    setLoading(true)
    reload()
      .catch(() => { if (alive) { setError('No se pudo leer la hidratación de hoy') } })
      .finally(() => { if (alive) { setLoading(false) } })
    // Si el usuario reconfigura las botellas (editor en otra vista), recargar.
    const onConfigChange = () => { reload().catch(() => { /* noop */ }) }
    window.addEventListener('bottleConfigChange', onConfigChange)
    return () => {
      alive = false
      window.removeEventListener('bottleConfigChange', onConfigChange)
    }
    // refreshKey no se usa dentro de reload: se declara acá para que un cambio
    // externo fuerce la relectura (misma intención que el prop documenta).
  }, [reload, refreshKey])

  const onComplete = async (bottleId: string) => {
    setBusy(true)
    setError(null)
    try {
      await completeBottle(bottleId, day)
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el agua')
    } finally {
      setBusy(false)
    }
  }

  const manualValue = Math.round(Number(manualMl))
  // (G) Registro manual: ml libres ? db.hydrationBottleLogs con id `manual`.
  const onManualAdd = async () => {
    if (!(manualValue > 0)) { return }
    setBusy(true)
    setError(null)
    try {
      await addHydrationMl(manualValue, day)
      setManualMl('')
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el agua')
    } finally {
      setBusy(false)
    }
  }

  const pct = goalMl > 0 ? Math.min(100, (totalMl / goalMl) * 100) : 0
  // Unidad de medida = botella configurada; si no hay, 500 ml.
  const unitMl = bottles[0]?.capacityMl || FALLBACK_BOTTLE_ML
  const bottlesDone = Math.floor(totalMl / unitMl)
  const bottlesGoal = goalMl > 0 ? Math.max(1, Math.round(goalMl / unitMl)) : 0
  const dim = size ? SIZES[size] : (compact ? SIZES.sm : SIZES.md)
  // Geometría unificada con HydrationBottle: viewBox 0 0 100 200, agua desde y=58 hasta y=190.
  const frac = goalMl > 0 ? Math.max(0, Math.min(totalMl / goalMl, 1)) : 0
  const shift = (1 - frac) * 132

  return (
    <div
      className={`flex ${compact ? 'flex-row items-center gap-4' : 'flex-col items-center gap-3'} ${className}`}
      data-testid="water-bottle"
    >
      <svg
        viewBox="0 0 100 200"
        className={compact ? 'w-24 h-40 shrink-0' : dim.box}
        role="img"
        aria-label={`Hidratación: ${bottlesDone} de ${bottlesGoal} botellas (${fmtMl(totalMl)} de ${fmtMl(goalMl)}). ${Math.round(pct)}% del objetivo.`}
        data-testid="water-bottle-svg"
        data-consumed-ml={Math.round(totalMl)}
        data-goal-ml={Math.round(goalMl)}
        data-pct={Math.round(pct)}
        data-bottles-done={bottlesDone}
        data-bottles-goal={bottlesGoal}
      >
        <defs>
          <clipPath id="bottleBodyClip">
            <path d="M41 20 H59 V38 C59 50 78 54 78 72 V178 Q78 190 66 190 H34 Q22 190 22 178 V72 C22 54 41 50 41 38 Z" />
          </clipPath>
          <linearGradient id="bottleWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--althea-hydration)', stopOpacity: 0.78 }} />
            <stop offset="1" style={{ stopColor: 'var(--althea-hydration)', stopOpacity: 0.98 }} />
          </linearGradient>
          <linearGradient id="bottleGlass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.16" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.32" />
          </linearGradient>
        </defs>

        <ellipse cx="50" cy="193" rx="30" ry="3.4" fill="#000" opacity="0.14" />

        <g clipPath="url(#bottleBodyClip)">
          <path d="M41 20 H59 V38 C59 50 78 54 78 72 V178 Q78 190 66 190 H34 Q22 190 22 178 V72 C22 54 41 50 41 38 Z" fill="var(--althea-surface-2)" opacity="0.5" />
          <g style={{ transform: `translateY(${shift}px)` }}>
            <rect x="0" y="59" width="100" height="150" fill="url(#bottleWater)" data-testid="water-bottle-fill" />
            <ellipse cx="50" cy="59" rx="29" ry="2.6" fill="#fff" opacity="0.34" />
            <path d="M21 59 Q 50 62.4 79 59" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
            <rect x="27" y="66" width="4" height="90" rx="2" fill="#fff" opacity="0.16" />
          </g>
        </g>

        <path d="M41 20 H59 V38 C59 50 78 54 78 72 V178 Q78 190 66 190 H34 Q22 190 22 178 V72 C22 54 41 50 41 38 Z" fill="url(#bottleGlass)" />
        <path d="M41 20 H59 V38 C59 50 78 54 78 72 V178 Q78 190 66 190 H34 Q22 190 22 178 V72 C22 54 41 50 41 38 Z" fill="none" stroke="var(--althea-on-surface-muted)" strokeOpacity="0.55" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M27 76 V172" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M73 84 V150" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M45 26 V36" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />

        <rect x="38" y="4" width="24" height="17" rx="3.5" fill="var(--althea-primary)" />
        <path d="M42 4.5 V20.5 M46 4.5 V20.5 M50 4.5 V20.5 M54 4.5 V20.5 M58 4.5 V20.5" stroke="#000" strokeOpacity="0.16" strokeWidth="0.9" />
        <rect x="38" y="4" width="24" height="3.6" rx="1.8" fill="#fff" opacity="0.18" />
        <rect x="39.5" y="20" width="21" height="2.2" rx="1" fill="var(--althea-on-surface-muted)" opacity="0.45" />
      </svg>

      <div className={compact ? 'min-w-0' : 'w-full text-center'}>
        {/* Medida principal: botellas / objetivo (derivada del objetivo real) */}
        <div className="flex items-baseline justify-center gap-1" data-testid="water-bottle-bottles">
          <span className={`font-headline-lg ${dim.metric} font-semibold text-on-surface tabular-nums leading-none`}>{bottlesDone}</span>
          <span className="font-headline-md text-on-surface-variant/70 text-lg">/</span>
          <span className="font-headline-md text-xl font-medium text-on-surface tabular-nums">{bottlesGoal}</span>
          <span className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant ml-1">botellas</span>
        </div>
        {/* Detalle exacto en ml */}
        <p className="font-body-sm text-[11px] text-on-surface-variant mt-1 tabular-nums" data-testid="water-bottle-readout">
          {fmtMl(totalMl)} <span className="opacity-60">/ {fmtMl(goalMl)}</span>
        </p>
        <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden mt-1.5" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del objetivo de hidratación">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--c-water-deep)' }} />
        </div>
        {pct >= 100 && (
          <p className="font-body-sm text-[11px] text-secondary mt-1">Objetivo alcanzado</p>
        )}

        {allowQuickAdd && (
          <div className="flex flex-wrap gap-1.5 mt-2 justify-center" data-testid="water-bottle-actions">
            {loading ? (
              <span className="font-body-sm text-[11px] text-on-surface-variant">Cargando…</span>
            ) : bottles.length === 0 ? (
              <span className="font-body-sm text-[11px] text-on-surface-variant">Sin botellas activas configuradas</span>
            ) : (
              bottles.map(b => (
                <button
                  key={b.id}
                  onClick={() => onComplete(b.id)}
                  disabled={busy}
                  data-testid={`water-bottle-add-${b.id}`}
                  aria-label={`Registrar ${b.name || b.id} (${b.capacityMl} ml)`}
                  className="min-h-[44px] px-2.5 flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/35 text-primary font-label-caps text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[14px]">water_drop</span>
                  +{b.capacityMl >= 1000 ? `${(b.capacityMl / 1000).toFixed(b.capacityMl % 1000 ? 1 : 0)}L` : `${b.capacityMl}ml`}
                  {counts[b.id] ? <span className="text-on-surface-variant">({counts[b.id]})</span> : null}
                </button>
              ))
            )}
          </div>
        )}
        {allowQuickAdd && !loading && (
          <form
            onSubmit={(e) => { e.preventDefault(); void onManualAdd() }}
            className="flex items-center justify-center gap-1.5 mt-2"
            data-testid="water-bottle-manual"
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              step={10}
              value={manualMl}
              onChange={(e) => setManualMl(e.target.value)}
              placeholder="ml"
              aria-label="Mililitros a registrar"
              className="w-24 min-h-[44px] px-2 rounded-lg bg-surface-container-low border border-outline-variant font-mono text-sm text-on-surface"
            />
            <button
              type="submit"
              disabled={busy || !(manualValue > 0)}
              aria-label="Registrar mililitros"
              className="min-h-[44px] px-2.5 rounded-lg bg-secondary/15 border border-secondary/40 text-secondary font-label-caps text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
            >
              Registrar
            </button>
          </form>
        )}
        {error && <p className="font-body-sm text-[11px] text-error mt-1">{error}</p>}
      </div>
    </div>
  )
}

export default WaterBottle
