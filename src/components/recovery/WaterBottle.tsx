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
  // viewBox 0 0 100 200. Cuerpo de botella con cuello, hombro y base; el agua
  // se recorta desde abajo con un clip cuyo alto depende del consumo real.
  const waterTop = 200 - (pct / 100) * 168

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
            <path d="M42 8 L58 8 L58 26 Q74 34 74 54 L74 186 Q74 194 66 194 L34 194 Q26 194 26 186 L26 54 Q26 34 42 26 Z" />
          </clipPath>
          <linearGradient id="bottleGlass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--c-water)" stopOpacity="0.22" />
            <stop offset="42%" stopColor="var(--c-water)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--c-water)" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="bottleWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-water)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--c-water-deep)" stopOpacity="0.82" />
          </linearGradient>
        </defs>

        {/* Tapa */}
        <rect x="38" y="0" width="24" height="10" rx="3" fill="var(--c-primary)" opacity="0.9" />
        {/* Vidrio celeste translúcido */}
        <path d="M42 8 L58 8 L58 26 Q74 34 74 54 L74 186 Q74 194 66 194 L34 194 Q26 194 26 186 L26 54 Q26 34 42 26 Z" fill="url(#bottleGlass)" />
        {/* Agua (recortada al consumo real) */}
        <g clipPath="url(#bottleBodyClip)">
          <rect x="26" y={waterTop} width="48" height={200 - waterTop} fill="url(#bottleWater)" data-testid="water-bottle-fill" />
          {pct > 0 && (
            <ellipse cx="50" cy={waterTop} rx="24" ry="3" fill="var(--c-water)" opacity="0.8" />
          )}
        </g>
        {/* Contorno + marcas */}
        <path d="M42 8 L58 8 L58 26 Q74 34 74 54 L74 186 Q74 194 66 194 L34 194 Q26 194 26 186 L26 54 Q26 34 42 26 Z" fill="none" stroke="var(--c-primary)" strokeWidth="1.6" opacity="0.6" />
        {[70, 110, 150].map(y => (
          <line key={y} x1="60" y1={y} x2="70" y2={y} stroke="var(--c-primary)" strokeWidth="1" opacity="0.35" />
        ))}
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
