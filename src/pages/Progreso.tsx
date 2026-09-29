import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { db } from '@/services/storage/db'
import { fetchPartMap } from '@/services/exerciseGym'
import { isDateInPeriod, loadFatigueBalance } from '@/services/training/metrics'
import { countTrainingDays, countTrainingDaysInPeriod } from '@/services/training/sessionMetrics'
import { unifiedAllCompletedSets } from '@/services/history'
import { buildMuscleResolver, type MuscleResolver } from '@/services/training/muscleAttribution'
import { groupLoadOf, weeklyGroupComparison } from '@/services/training/muscleGroups'
import { getCanonicalCycle } from '@/services/planning/cycleVersions'
import { todayKey, dayKeyOffset, toDateKey, daysBetween } from '@/utils/dates'
import { MuscleAtlas, type MuscleDataPoint } from '@/components/progress/MuscleAtlas'
import { resolveMuscleIds } from '@/components/progress/muscleVocabulary'
import { MUSCLE_CATALOG } from '@/services/training/muscleCatalog'
import { AltheaCard, AltheaCardHeader, AltheaButton, AltheaKPICard, AltheaEmpty, AltheaLoading } from '@/components/althea'
import type { RecoveryCheck, UserProfile } from '@/types'

type Period = '7' | '30' | '90' | '365' | 'all' | 'custom'
type UnifiedLog = { exerciseId: string; weight: number; reps: number; createdAt: string }

const PERIOD_OPTIONS: [Period, string][] = [
  ['7', '7 días'],
  ['30', '30 días'],
  ['90', '90 días'],
  ['365', 'Año'],
  ['all', 'Todo'],
  ['custom', 'Personalizado'],
]

const PERIOD_LABELS: Record<Period, string> = {
  '7': 'Últimos 7 días',
  '30': 'Últimos 30 días',
  '90': 'Últimos 90 días',
  '365': 'Último año',
  'all': 'Todo el historial',
  'custom': 'Rango personalizado',
}

function shiftDays(dateStr: string, delta: number): string {
  return dayKeyOffset(dateStr, delta)
}

interface VolumeBucket { from: string; to: string; label: string; volume: number }

// Agregación REAL de volumen (kg×reps) por día/semana/mes dentro de la ventana
// del período. Nunca inventa valores: las celdas sin series quedan en 0.
function buildVolumeBuckets(
  logs: UnifiedLog[],
  period: Period,
  opts: { customStart: string; customEnd: string },
): { buckets: VolumeBucket[]; unit: 'día' | 'semana' | 'mes' } {
  const today = todayKey()
  let start = today
  if (period === '7') { start = shiftDays(today, -6) }
  else if (period === '30') { start = shiftDays(today, -29) }
  else if (period === '90') { start = shiftDays(today, -89) }
  else if (period === '365') { start = shiftDays(today, -364) }
  else if (period === 'all') {
    const dates = logs.map((l) => toDateKey(String(l.createdAt || ''))).filter(Boolean)
    if (dates.length === 0) { return { buckets: [], unit: 'mes' } }
    start = dates.slice().sort()[0]
  } else if (period === 'custom') {
    start = opts.customStart || today
  }
  const end = (period === 'custom' && opts.customEnd) ? opts.customEnd : today
  if (start > end) { start = end }
  const daySpan = Math.max(1, daysBetween(start, end) + 1)

  let unit: 'día' | 'semana' | 'mes' = 'semana'
  let size = 1
  let num = daySpan
  if (daySpan <= 14) { unit = 'día' }
  else if (daySpan <= 90) { unit = 'semana'; size = 7; num = Math.min(12, Math.ceil(daySpan / 7)) }
  else { unit = 'mes'; size = 30; num = Math.min(12, Math.ceil(daySpan / 30)) }

  const dated = logs
    .map((l) => ({ date: toDateKey(String(l.createdAt || '')), v: Number(l.weight) * Number(l.reps) }))
    .filter((x) => x.date >= start && x.date <= end)

  const buckets: VolumeBucket[] = []
  for (let i = num - 1; i >= 0; i--) {
    const to = shiftDays(end, -(i * size))
    const from = shiftDays(to, -(size - 1))
    const volume = dated.filter((x) => x.date >= from && x.date <= to).reduce((a, x) => a + x.v, 0)
    buckets.push({ from, to, label: from.slice(5), volume: Math.round(volume) })
  }
  return { buckets, unit: unit }
}

function periodDayCount(period: Period, customStart: string, customEnd: string): number {
  if (period === 'all') { return 0 }
  const today = todayKey()
  if (period === 'custom') {
    const s = customStart || today
    const e = customEnd || today
    return Math.max(1, daysBetween(s, e) + 1)
  }
  return Number(period)
}

type InsightTone = 'ok' | 'attention' | 'info'
interface Insight { icon: string; text: string; tone: InsightTone }

function fmtKg(n: number): string {
  return `${Math.round(n).toLocaleString('es-AR')} kg`
}

function buildInsights(cfg: {
  buckets: VolumeBucket[]
  unit: 'día' | 'semana' | 'mes'
  periodDays: number
  periodSessionDays: number
  weightStats: { actual: number; inicial: number; dif: number } | null
  recLatest: { score: number; date: string } | null
  balance: ReturnType<typeof loadFatigueBalance>
}): Insight[] {
  const out: Insight[] = []
  const b = cfg.buckets
  if (b.length >= 2) {
    const last = b[b.length - 1].volume
    const prev = b[b.length - 2].volume
    if (prev > 0) {
      const pct = Math.round(((last - prev) / prev) * 100)
      if (pct >= 5) {
        out.push({ icon: 'trending_up', text: `La carga subió ${pct}% en la última ${cfg.unit} (${fmtKg(prev)} → ${fmtKg(last)} kg).`, tone: 'ok' })
      } else if (pct <= -5) {
        out.push({ icon: 'trending_down', text: `La carga bajó ${Math.abs(pct)}% en la última ${cfg.unit} (${fmtKg(prev)} → ${fmtKg(last)} kg).`, tone: 'info' })
      } else {
        out.push({ icon: 'trending_flat', text: `Carga estable en la última ${cfg.unit} (${fmtKg(last)} kg).`, tone: 'info' })
      }
    } else if (last > 0) {
      out.push({ icon: 'fitness_center', text: `En la última ${cfg.unit} acumulaste ${fmtKg(last)} kg de volumen.`, tone: 'info' })
    }
  }
  if (cfg.periodDays > 0 && cfg.periodSessionDays > 0) {
    const pct = Math.round((cfg.periodSessionDays / cfg.periodDays) * 100)
    out.push(
      pct >= 50
        ? { icon: 'check_circle', text: `Entrenaste ${cfg.periodSessionDays} de ${cfg.periodDays} días del período (${pct}% de adherencia).`, tone: 'ok' as InsightTone }
        : { icon: 'warning', text: `Entrenaste ${cfg.periodSessionDays} de ${cfg.periodDays} días (${pct}%).`, tone: 'attention' as InsightTone },
    )
  }
  if (cfg.weightStats) {
    const w = cfg.weightStats
    const direccion = w.dif === 0 ? 'estable' : w.dif > 0 ? `subiste ${Math.abs(w.dif)} kg` : `bajaste ${Math.abs(w.dif)} kg`
    out.push({ icon: 'monitor_weight', text: `Peso: ${w.inicial} → ${w.actual} kg (${direccion} en el período).`, tone: 'info' })
  }
  if (cfg.recLatest) {
    const s = cfg.recLatest.score
    if (s >= 70) {
      out.push({ icon: 'favorite', text: `Última recuperación ${s}/100 (${cfg.recLatest.date}) — óptima.`, tone: 'ok' })
    } else if (s >= 40) {
      out.push({ icon: 'self_improvement', text: `Última recuperación ${s}/100 (${cfg.recLatest.date}) — moderada.`, tone: 'attention' })
    } else {
      out.push({ icon: 'warning', text: `Última recuperación ${s}/100 (${cfg.recLatest.date}) — descanso recomendado.`, tone: 'attention' })
    }
  }
  const bal = cfg.balance
  if (bal.balance === 'sobrecarga-posible') {
    out.push({ icon: 'warning', text: 'Carga alta en los últimos 7 días y fatiga declarada elevada: considerá descargar (decisión tuya).', tone: 'attention' })
  } else if (bal.balance === 'atencion') {
    out.push({ icon: 'info', text: `Carga ${bal.load} en 7 días` + (bal.reportedFatigue !== null ? ` con fatiga declarada ${bal.reportedFatigue}/10` : '') + ': observá la evolución.', tone: 'info' })
  } else if (bal.balance === 'ok') {
    out.push({ icon: 'check_circle', text: `Carga ${bal.load} en 7 días con fatiga declarada ${bal.reportedFatigue ?? '—'}/10: balance OK.`, tone: 'ok' })
  } else {
    out.push({ icon: 'info', text: 'Sin datos de la última semana para evaluar carga/fatiga.', tone: 'info' })
  }
  return out.slice(0, 5)
}

function InlineEmpty({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <span className="material-symbols-outlined text-[28px] text-outline mb-2">{icon}</span>
      <p className="font-body-md text-sm text-on-surface-variant">{text}</p>
      {sub && <p className="font-body-md text-xs text-outline mt-1">{sub}</p>}
    </div>
  )
}

export default function Progresos() {
  const [allLogs, setAllLogs] = useState<UnifiedLog[]>([])
  const [trainingSessions, setTrainingSessions] = useState<Array<{ calendarDate: string; sessionStatus: string; isDemo?: boolean }>>([])
  const [bodies, setBodies] = useState<Array<{ localDate: string; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number }>>([])
  const [recovery, setRecovery] = useState<RecoveryCheck[]>([])
  const [period, setPeriod] = useState<Period>('30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [resolver, setResolver] = useState<MuscleResolver | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
    const [reportOpen, setReportOpen] = useState(false)
    const [cycle, setCycle] = useState<Awaited<ReturnType<typeof getCanonicalCycle>> | null>(null)
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([
      unifiedAllCompletedSets(),
      db.table('trainingSessions').toArray().catch(() => []),
      db.table('bodyMeasurements').toArray().catch(() => []) as Promise<Array<{ localDate: string; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number }>>,
      db.recoveryChecks.toArray().catch(() => []),
      fetchPartMap().catch(() => ({} as Record<string, string>)),
      db.userProfile.toArray().catch(() => []),
    ])
      .then(async ([unifiedLogs, officialSessions, bodyRows, recRows, baseMap, profileRows]) => {
        const { overlayCustomParts } = await import('@/services/training/customExercises')
        const partMap = await overlayCustomParts({ ...(baseMap as Record<string, string>) })
        const res = await buildMuscleResolver(partMap as Record<string, string>).catch(() => null)
        const cycleCfg = await getCanonicalCycle((profileRows[0] as UserProfile | undefined) ?? null).catch(() => null)
        const allOfficial = officialSessions as unknown as Array<{ calendarDate: string; sessionStatus: import('@/services/training/domain').SessionStatus; isDemo?: boolean }>
        if (!alive) { return }
        setAllLogs(unifiedLogs as unknown as UnifiedLog[])
        setResolver(res)
        setCycle(cycleCfg)
        setTrainingSessions(allOfficial)
        setBodies(bodyRows.slice().sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))))
        setRecovery(recRows.slice().sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))))
      })
      .catch((e: unknown) => {
        if (alive) { setError(e instanceof Error ? e.message : String(e)) }
      })
      .finally(() => {
        if (alive) { setLoading(false) }
      })
    return () => { alive = false }
  }, [reloadKey])

  const periodLogs = useMemo(
    () => allLogs.filter((l) => isDateInPeriod(toDateKey(String(l.createdAt || '')), period, { customStart, customEnd })),
    [allLogs, period, customStart, customEnd],
  )
  const periodBodies = useMemo(
    () => bodies.filter((b) => isDateInPeriod(String(b.localDate || ''), period, { customStart, customEnd })),
    [bodies, period, customStart, customEnd],
  )
  const periodRec = useMemo(
    () => recovery.filter((r) => isDateInPeriod(String(r.localDate || ''), period, { customStart, customEnd })),
    [recovery, period, customStart, customEnd],
  )
  const periodSessionDays = useMemo(
    () => countTrainingDaysInPeriod(trainingSessions as never, period, { customStart, customEnd }),
    [trainingSessions, period, customStart, customEnd],
  )
  const totalSessionDays = useMemo(() => countTrainingDays(trainingSessions as never), [trainingSessions])
  const periodDays = useMemo(() => periodDayCount(period, customStart, customEnd), [period, customStart, customEnd])
  const periodVolume = useMemo(() => periodLogs.reduce((a, l) => a + Number(l.weight) * Number(l.reps), 0), [periodLogs])

  // ─── Volumen comparable: mismo largo de ventana, período anterior ───
  // Solo se compara contra una ventana realmente existente: si el historial no
  // alcanza el período previo, no se muestra porcentaje (evita inventar progreso).
  const volumeComparison = useMemo(() => {
    if (period === 'all' || periodDays <= 0) { return null }
    const today = todayKey()
    const len = periodDays
    const curFrom = dayKeyOffset(today, -(len - 1))
    const prevTo = dayKeyOffset(curFrom, -1)
    const prevFrom = dayKeyOffset(prevTo, -(len - 1))
    if (prevFrom < '0000-00-00') { return null }
    const prevLogs = allLogs.filter((l) => {
      const d = toDateKey(String(l.createdAt || ''))
      return d >= prevFrom && d <= prevTo
    })
    const prevVolume = prevLogs.reduce((a, l) => a + Number(l.weight) * Number(l.reps), 0)
    if (prevVolume <= 0) { return null }
    const pct = Math.round(((periodVolume - prevVolume) / prevVolume) * 100)
    return { prevVolume, prevFrom, prevTo, pct }
  }, [allLogs, period, periodDays, periodVolume])


  const weightStats = useMemo(() => {
    const ws = periodBodies.map((b) => Number(b.weightKg)).filter((n) => !isNaN(n))
    if (ws.length === 0) { return null }
    const actual = ws[ws.length - 1]
    const inicial = ws[0]
    return { actual, inicial, dif: Math.round((actual - inicial) * 10) / 10, max: Math.max(...ws), min: Math.min(...ws) }
  }, [periodBodies])

  const recLatest = useMemo(() => {
    if (periodRec.length === 0) { return null }
    const last = periodRec[periodRec.length - 1]
    return { score: Number(last.score ?? 0), date: String(last.localDate).slice(5), sleepHours: last.sleepHours, sleepQuality: last.sleepQuality }
  }, [periodRec])

  const week7 = useMemo(() => {
    const today = todayKey()
    const cut = shiftDays(today, -6)
    const inWin = allLogs.filter((l) => toDateKey(String(l.createdAt || '')) >= cut)
    const volume7d = inWin.reduce((a, l) => a + Number(l.weight) * Number(l.reps), 0)
    const sessions7d = new Set(inWin.map((l) => toDateKey(String(l.createdAt || '')))).size
    const lastRec = recovery[recovery.length - 1] ?? null
    const res = loadFatigueBalance({
      volume7d,
      sessions7d,
      fatigueAvg: typeof lastRec?.fatigue === 'number' ? lastRec.fatigue : null,
      sleepAvg: typeof lastRec?.sleepHours === 'number' ? lastRec.sleepHours : null,
    })
    return res
  }, [allLogs, recovery])

  const buckets = useMemo(() => buildVolumeBuckets(periodLogs, period, { customStart, customEnd }), [periodLogs, period, customStart, customEnd])

  const insights = useMemo(() => {
    return buildInsights({
      buckets: buckets.buckets,
      unit: buckets.unit,
      periodDays,
      periodSessionDays: period === 'all' ? totalSessionDays : periodSessionDays,
      weightStats,
      recLatest,
      balance: week7,
    })
  }, [buckets, periodDays, periodSessionDays, totalSessionDays, period, weightStats, recLatest, week7])


  // ─── Mapa muscular: comparación por semana de ciclo ───
  // Usa TODO el historial (no el filtro de período): la comparación es entre
  // semanas del ciclo, por lo que recortarla por "últimos 30 días" la rompería.
  const muscleItemsByDate = useMemo(
    () => allLogs.map((l) => ({ date: toDateKey(String(l.createdAt || '')), exerciseId: l.exerciseId, volume: Number(l.weight) * Number(l.reps) }))
      .filter((i) => !!i.date),
    [allLogs],
  )
  const muscleComparison = useMemo(
    () => weeklyGroupComparison(muscleItemsByDate, resolver?.muscleOf ?? (() => null), cycle ?? { startDate: todayKey(), trainingDays: [], weekMap: [null, null, null, null, null, null, null] }, todayKey()),
    [muscleItemsByDate, resolver, cycle],
  )
  const unmappedMuscleSets = useMemo(() => {
    if (!allLogs.length) { return 0 }
    const { unmappedSets } = groupLoadOf(
      allLogs.map((l) => ({ exerciseId: l.exerciseId, volume: Number(l.weight) * Number(l.reps) })),
      resolver?.muscleOf ?? (() => null),
    )
    return unmappedSets
  }, [allLogs, resolver])

  const hasAnyData = allLogs.length > 0 || bodies.length > 0 || recovery.length > 0 || totalSessionDays > 0
  const hasPeriodData = periodLogs.length > 0 || periodBodies.length > 0 || periodRec.length > 0

  const [vista, setVista] = useState<'front' | 'back'>('front')

  const muscleData = useMemo((): Record<string, MuscleDataPoint> => {
    if (!hasAnyData) {return {}}
    const currentVol = muscleComparison.current?.byGroup ?? {}
    const lastWeek = muscleComparison.weeks[muscleComparison.weeks.length - 1] ?? null
    const out: Record<string, MuscleDataPoint> = {}
    for (const m of MUSCLE_CATALOG) {
      const regionIds = resolveMuscleIds(m.id)
      if (regionIds.length === 0) {continue}
      const current = currentVol[m.group] ?? 0
      const previous = lastWeek?.byGroup[m.group] ?? 0
      const trend = current > 0 && previous > 0
        ? current > previous ? 'aumento' : current < previous ? 'descenso' : 'estable'
        : 'sin-base'
      const point: MuscleDataPoint = { muscleId: m.id, current, previous, trend, unit: 'kg' }
      for (const rid of regionIds) {out[rid] = point}
    }
    return out
  }, [hasAnyData, muscleComparison])

  // ─── BLOQUE 7: informe periódico (conclusiones + descarga) ───
  const reportBlock = () => (
    <AltheaCard className="p-4" data-testid="progreso-report">
      <AltheaCardHeader
        title="Informe del período"
        subtitle={`${PERIOD_LABELS[period]} · conclusiones derivadas solo de tus registros`}
        icon="insights"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {insights.length === 0 ? (
          <InlineEmpty icon="insights" text="Sin conclusiones todavía." sub="Puede deberse a datos insuficientes en el período." />
        ) : (
          <ul className="space-y-2">
            {insights.slice(0, 4).map((ins, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`material-symbols-outlined text-[15px] mt-0.5 shrink-0 ${ins.tone === 'ok' ? 'text-secondary' : ins.tone === 'attention' ? 'text-tertiary' : 'text-on-surface-variant'}`}>{ins.icon}</span>
                <p className="font-body-sm text-[12px] text-on-surface">{ins.text}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-surface-container-highest rounded-lg p-2">
              <span className="font-label-caps text-[9px] uppercase text-outline block">Sesiones</span>
              <span className="font-headline-md text-sm font-semibold text-on-surface tabular-nums">{periodLogs.length}</span>
            </div>
            <div className="bg-surface-container-highest rounded-lg p-2">
              <span className="font-label-caps text-[9px] uppercase text-outline block">Mediciones</span>
              <span className="font-headline-md text-sm font-semibold text-on-surface tabular-nums">{periodBodies.length}</span>
            </div>
          </div>
          <AltheaButton size="lg" fullWidth className="min-h-[48px]" icon="picture_as_pdf" onClick={() => setReportOpen(true)}>
            Generar informe descargable
          </AltheaButton>
        </div>
      </div>
    </AltheaCard>
  )


  return (
    <div className="min-h-screen bg-transparent p-4 md:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-5">
      {/* ─── Hero Sub-Header ─── */}
      <section className="flex flex-col md:flex-row md:items-end justify-between pb-3 border-b border-outline-variant/40 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="font-label-caps text-[11px] text-secondary uppercase tracking-widest">Evolución de entrenamiento</span>
          </div>
          <h1 className="font-headline-lg text-[36px] font-semibold text-on-surface tracking-tight">
            {loading ? 'Cargando…' : 'Progreso'}
          </h1>
          <p className="font-body-md text-[13px] text-on-surface-variant mt-0.5">
            Fuerza, volumen, peso y recuperación a partir de tus registros reales.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg flex items-center gap-2">
            <span className="font-label-caps text-[10px] text-outline uppercase">Período:</span>
            <span className="font-label-md text-[14px] text-primary font-semibold">{PERIOD_LABELS[period]}</span>
          </div>
          <div className="px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg flex items-center gap-2">
            <span className="font-label-caps text-[10px] text-outline uppercase">Registros:</span>
            <span className="font-label-md text-[14px] text-primary font-semibold tabular-nums">{periodLogs.length}</span>
          </div>
        </div>
</section>
      {/* ─── Selector de período ─── */}
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Período del informe">
        {PERIOD_OPTIONS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setPeriod(v)}
            aria-pressed={period === v}
            data-testid={`period-${v}`}
            className={`px-3 py-1.5 min-h-[44px] rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${period === v ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Desde
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[44px]" />
          </label>
          <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hasta
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[44px]" />
          </label>
        </div>
      )}
      {loading ? (
        <AltheaLoading lines={4} />
      ) : error ? (
        <AltheaCard className="p-5">
          <AltheaCardHeader title="No se pudieron cargar los datos" icon="error" />
          <p className="font-body-md text-sm text-on-surface-variant mb-4">{error}</p>
          <AltheaButton variant="secondary" size="lg" className="min-h-[48px]" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>Reintentar</AltheaButton>
        </AltheaCard>
      ) : !hasAnyData ? (
        <AltheaEmpty
          icon="fitness_center"
          title="Todavía sin datos de entrenamiento"
          description="Registrá tu primera sesión en la pestaña Entrenar y volvé: tu evolución se construye con tus registros reales."
        />
      ) : !hasPeriodData ? (
        <AltheaCard className="p-5">
          <AltheaEmpty
            icon="calendar_month"
            title="Sin registros en este período"
            description={`No hay sesiones, mediciones ni check-ins entre ${customStart ? `el ${customStart}` : ''} y el ${customEnd || 'día de hoy'}. Probá otro período o ampliá el rango.`}
            action={<AltheaButton size="lg" className="min-h-[48px]" onClick={() => setPeriod('all')}>Ver todo el historial</AltheaButton>}
          />
        </AltheaCard>
      ) : (
        <>
          {/* ─── BLOQUE 1 · atlas muscular (protagonista, ancho completo) ─── */}
          <section className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 md:p-5" data-testid="muscle-atlas">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-headline-lg text-xl font-semibold text-on-surface tracking-tight">Mapa muscular</h2>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Trabajo por grupo · ciclo iniciado el {cycle?.startDate ?? todayKey()}
                </p>
              </div>
            </div>
            <MuscleAtlas
              view={vista}
              onViewChange={setVista}
              data={muscleData}
              width={280}
              detail="below"
            />
          </section>

          {/* ─── BLOQUES 2, 3 y 5 · días, peso y volumen comparable ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AltheaKPICard
              icon="exercise"
              label="Días entrenados"
              value={period === 'all' ? totalSessionDays : periodSessionDays}
              subtitle={period === 'all' ? 'todo el historial' : periodDays > 0 ? `de ${periodDays} días del período` : 'período'}
            />
            <AltheaKPICard
              icon="monitor_weight"
              label="Peso actual"
              value={weightStats ? `${weightStats.actual} kg` : '—'}
              subtitle={weightStats ? `${weightStats.dif > 0 ? '+' : ''}${weightStats.dif} kg en el período` : 'sin mediciones'}
              color={weightStats ? (weightStats.dif <= 0 ? 'success' : 'warning') : 'primary'}
            />
            <AltheaKPICard
              icon="fitness_center"
              label="Volumen comparable"
              value={fmtKg(periodVolume)}
              subtitle={volumeComparison
                ? `${volumeComparison.pct >= 0 ? '+' : ''}${volumeComparison.pct}% vs ${volumeComparison.prevFrom.slice(5)}–${volumeComparison.prevTo.slice(5)}`
                : 'kg×reps · sin período previo comparable'}
              color={volumeComparison ? (volumeComparison.pct >= 0 ? 'success' : 'warning') : 'primary'}
            />
          </div>

          {/* ─── BLOQUE 7 · informe del período (la analítica profunda vive en el PDF) ─── */}
          {reportBlock()}
          {reportOpen && <ReportModalLazy open={reportOpen} onClose={() => setReportOpen(false)} />}
        </>
      )}
    </div>
  )
}

const ReportModalLazyInner = lazy(() => import('@/components/report/ReportModal').then((m) => ({ default: m.ReportModal })))
function ReportModalLazy(props: { open: boolean; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <ReportModalLazyInner {...props} />
    </Suspense>
  )
}