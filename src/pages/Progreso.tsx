import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { db } from '@/services/storage/db'
import { BODY_PARTS, fetchPartMap } from '@/services/exerciseGym'
import { combinedIndexOf, isDateInPeriod, projectProgress, loadFatigueBalance } from '@/services/training/metrics'
import { countTrainingDays, countTrainingDaysInPeriod } from '@/services/training/sessionMetrics'
import { unifiedAllCompletedSets } from '@/services/history'
import { buildMuscleResolver, type MuscleResolver } from '@/services/training/muscleAttribution'
import { groupLoadOf, weeklyGroupComparison } from '@/services/training/muscleGroups'
import { getCanonicalCycle } from '@/services/planning/cycleVersions'
import { getMacroTotals } from '@/services/nutrition/macroService'
import { todayKey, dayKeyOffset, toDateKey, daysBetween } from '@/utils/dates'
import { buildNutritionWeek, type DayPoint } from '@/utils/nutritionWeek'
import { MuscleMapPanel } from '@/components/progress/MuscleMapPanel'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { AltheaCard, AltheaCardHeader, AltheaBadge, AltheaButton, AltheaKPICard, AltheaEmpty, AltheaLoading, AltheaSelect, AltheaInput } from '@/components/althea'
import type { RecoveryCheck, UserProfile } from '@/types'

type Period = '7' | '30' | '90' | '365' | 'all' | 'custom'
type Metric = 'peso' | 'reps' | 'series' | 'volumen' | 'mejor' | 'indice'
type UnifiedLog = { exerciseId: string; weight: number; reps: number; createdAt: string }

const METRICS: [Metric, string, string][] = [
  ['peso', 'Peso', 'kg máx/día'],
  ['reps', 'Repeticiones', 'suma/día'],
  ['series', 'Series', 'conteo/día'],
  ['volumen', 'Volumen', 'kg/día'],
  ['mejor', 'Mejor serie', 'kg×reps máx'],
  ['indice', 'Índice', 'base 100'],
]

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

const METRIC_HELP: Record<Metric, string> = {
  peso: 'Peso máximo del día (kg).',
  reps: 'Suma de repeticiones del día.',
  series: 'Cantidad de series del día.',
  volumen: 'Suma de kg×reps del día.',
  mejor: 'Mejor serie del día (máx kg×reps).',
  indice: 'Índice combinado: 100 × media de (peso, reps, series, volumen) normalizados contra el primer día. Componentes en 0 se excluyen. Recalculable desde el historial.',
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

interface DayAgg { w: number; r: number; s: number; v: number; best: number }

function metricValueOf(a: DayAgg, metric: Metric, indice: number): number {
  if (metric === 'peso') { return a.w }
  if (metric === 'reps') { return a.r }
  if (metric === 'series') { return a.s }
  if (metric === 'volumen') { return Math.round(a.v) }
  if (metric === 'mejor') { return a.best }
  return indice
}

type InsightTone = 'ok' | 'attention' | 'info'
interface Insight { icon: string; text: string; tone: InsightTone }

function fmtKg(n: number): string {
  return `${Math.round(n).toLocaleString('es-AR')} kg`
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function buildInsights(cfg: {
  buckets: VolumeBucket[]
  unit: 'día' | 'semana' | 'mes'
  periodDays: number
  periodSessionDays: number
  weightStats: { actual: number; inicial: number; dif: number } | null
  recLatest: { score: number; date: string } | null
  upCount: number
  downCount: number
  partLabel: string
  metricLabel: string
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
  if (cfg.upCount > 0 || cfg.downCount > 0) {
    out.push({ icon: 'query_stats', text: `${cfg.upCount} ejercicios con tendencia positiva, ${cfg.downCount} negativa en ${cfg.partLabel} (${cfg.metricLabel}).`, tone: 'info' })
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
  const [allLogs, setAllLogs] = useState<Array<UnifiedLog & { part: string | null }>>([])
  const [unmapped, setUnmapped] = useState(0)
  const [trainingSessions, setTrainingSessions] = useState<Array<{ calendarDate: string; sessionStatus: string; isDemo?: boolean }>>([])
  const [bodies, setBodies] = useState<Array<{ localDate: string; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number }>>([])
  const [recovery, setRecovery] = useState<RecoveryCheck[]>([])
  const [period, setPeriod] = useState<Period>('30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [partSel, setPartSel] = useState('back')
  const [metric, setMetric] = useState<Metric>('volumen')
  const [resolver, setResolver] = useState<MuscleResolver | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
    const [reportOpen, setReportOpen] = useState(false)
    const [cycle, setCycle] = useState<Awaited<ReturnType<typeof getCanonicalCycle>> | null>(null)
  const [nutrition, setNutrition] = useState<{ kcal: number; protein: number; carbs: number; fat: number; hydrationMl: number; daysLogged: number } | null>(null)
  const [nutritionWeek, setNutritionWeek] = useState<DayPoint[]>([])
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    Promise.all([
      unifiedAllCompletedSets(),
      db.sessions.toArray().catch(() => []),
      db.table('trainingSessions').toArray().catch(() => []),
      db.table('bodyMeasurements').toArray().catch(() => []) as Promise<Array<{ localDate: string; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number }>>,
      db.recoveryChecks.toArray().catch(() => []),
      fetchPartMap().catch(() => ({} as Record<string, string>)),
      db.userProfile.toArray().catch(() => []),
    ])
      .then(async ([unifiedLogs, , officialSessions, bodyRows, recRows, baseMap, profileRows]) => {
        const { overlayCustomParts, listCustomExercises } = await import('@/services/training/customExercises')
        const partMap = await overlayCustomParts({ ...(baseMap as Record<string, string>) })
        const customs = await listCustomExercises().catch(() => [])
        const names: Record<string, string> = {}
        for (const c of customs) { if (c?.id) { names[c.id] = c.name } }
        const res = await buildMuscleResolver(partMap as Record<string, string>).catch(() => null)
        const cycleCfg = await getCanonicalCycle((profileRows[0] as UserProfile | undefined) ?? null).catch(() => null)
        let unm = 0
        const logs = unifiedLogs.map((l) => {
          const p = (partMap as Record<string, string>)[l.exerciseId] || null
          if (!p) { unm++ }
          return { ...l, part: p } as UnifiedLog & { part: string | null }
        })
        const allOfficial = officialSessions as unknown as Array<{ calendarDate: string; sessionStatus: import('@/services/training/domain').SessionStatus; isDemo?: boolean }>
        if (!alive) { return }
        setAllLogs(logs)
        setUnmapped(unm)
        setCustomNames(names)
        setResolver(res)
        setCycle(cycleCfg)
        setTrainingSessions(allOfficial)
        setBodies(bodyRows.slice().sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))))
        setRecovery(recRows.slice().sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))))
        const withData = BODY_PARTS.find((p) => logs.some((l) => (partMap)[l.exerciseId] === p))
        if (withData) { setPartSel(withData) }
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

  const weightData = useMemo(
    () => periodBodies.filter((b) => b.weightKg !== null).map((b) => ({ date: String(b.localDate).slice(5), peso: b.weightKg })),
    [periodBodies],
  )

  const recData = useMemo(
    () => periodRec.map((r) => ({ date: String(r.localDate).slice(5), full: String(r.localDate), indice: Number(r.score ?? 0) })).sort((a, b) => (a.full < b.full ? -1 : 1)),
    [periodRec],
  )
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

  const partLogs = useMemo(() => periodLogs.filter((l) => l.part === partSel), [periodLogs, partSel])

  const partAgg = useMemo(() => {
    const agg: Record<string, DayAgg> = {}
    for (const l of partLogs) {
      const d = toDateKey(String(l.createdAt))
      if (!agg[d]) { agg[d] = { w: 0, r: 0, s: 0, v: 0, best: 0 } }
      agg[d].w = Math.max(agg[d].w, Number(l.weight))
      agg[d].r += Number(l.reps)
      agg[d].s += 1
      agg[d].v += Number(l.weight) * Number(l.reps)
      agg[d].best = Math.max(agg[d].best, Number(l.weight) * Number(l.reps))
    }
    return agg
  }, [partLogs])

  const globalData = useMemo(() => {
    const dates = Object.keys(partAgg).sort()
    if (metric === 'indice') {
      const pts = dates.map((d) => ({ date: d, w: partAgg[d].w, r: partAgg[d].r, s: partAgg[d].s, v: partAgg[d].v }))
      const idx = combinedIndexOf(pts)
      if (!idx) { return [] }
      return idx.map((p) => ({ date: p.date.slice(5), valor: p.indice }))
    }
    return dates.map((d) => ({ date: d.slice(5), valor: metricValueOf(partAgg[d], metric, 0) }))
  }, [partAgg, metric])

  const perExercise = useMemo(() => {
    const byEx: Record<string, { name: string; pts: Record<string, DayAgg> }> = {}
    const nameOf = (id: string) => customNames[id] || id.split('/').pop()?.replace(/-/g, ' ') || id
    for (const l of partLogs) {
      if (!byEx[l.exerciseId]) { byEx[l.exerciseId] = { name: nameOf(l.exerciseId), pts: {} } }
      const d = toDateKey(String(l.createdAt || ''))
      const a = byEx[l.exerciseId].pts[d] || (byEx[l.exerciseId].pts[d] = { w: 0, r: 0, s: 0, v: 0, best: 0 })
      a.w = Math.max(a.w, Number(l.weight))
      a.r += Number(l.reps)
      a.s += 1
      a.v += Number(l.weight) * Number(l.reps)
      a.best = Math.max(a.best, Number(l.weight) * Number(l.reps))
    }
    return Object.entries(byEx).map(([id, e]) => {
      const dates = Object.keys(e.pts).sort()
      let trend = '○ nuevo'
      let pts: Array<{ date: string; valor: number }> = []
      if (metric === 'indice') {
        const idx = combinedIndexOf(dates.map((d) => ({ date: d, w: e.pts[d].w, r: e.pts[d].r, s: e.pts[d].s, v: e.pts[d].v })))
        pts = idx ? idx.map((p) => ({ date: p.date.slice(5), valor: p.indice })) : []
        trend = pts.length < 2 ? '○ nuevo' : pts[pts.length - 1].valor >= pts[0].valor ? '↑ progresa' : '↓ disminuye'
      } else {
        pts = dates.map((d) => ({ date: d.slice(5), valor: metricValueOf(e.pts[d], metric, 0) }))
        if (pts.length >= 4) {
          const l3 = pts.slice(-3).reduce((a, p) => a + p.valor, 0) / 3
          const p3 = pts.slice(-6, -3).reduce((a, p) => a + p.valor, 0) / Math.max(1, Math.min(3, pts.length - 3))
          trend = l3 > p3 * 1.05 ? '↑ progresa' : l3 < p3 * 0.95 ? '↓ disminuye' : '→ estable'
        } else if (pts.length >= 2) { trend = pts[pts.length - 1].valor >= pts[0].valor ? '↑ progresa' : '↓ disminuye' }
      }
      return { id, name: e.name, pts, trend }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [partLogs, metric, customNames])

  const trendCounts = useMemo(() => {
    let up = 0
    let down = 0
    for (const e of perExercise) {
      if (e.trend.startsWith('↑')) { up++ }
      else if (e.trend.startsWith('↓')) { down++ }
    }
    return { up, down }
  }, [perExercise])

  const buckets = useMemo(() => buildVolumeBuckets(partLogs, period, { customStart, customEnd }), [partLogs, period, customStart, customEnd])
  const bucketTotal = useMemo(() => buckets.buckets.reduce((a, b) => a + b.volume, 0), [buckets])

  const insights = useMemo(() => {
    const metricLabel = METRICS.find(([m]) => m === metric)?.[1] ?? metric
    return buildInsights({
      buckets: buckets.buckets,
      unit: buckets.unit,
      periodDays,
      periodSessionDays: period === 'all' ? totalSessionDays : periodSessionDays,
      weightStats,
      recLatest,
      upCount: trendCounts.up,
      downCount: trendCounts.down,
      partLabel: partSel,
      metricLabel,
      balance: week7,
    })
  }, [buckets, periodDays, periodSessionDays, totalSessionDays, period, weightStats, recLatest, trendCounts, partSel, metric, week7])


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

  // ─── Resumen nutricional del período (KPIs, sin composición completa) ───
  useEffect(() => {
    let alive = true
    const run = async () => {
      const t = todayKey()
      const nDays = period === 'all' ? 7 : Number(period) || 7
      const days: string[] = []
      for (let i = nDays - 1; i >= 0; i--) { days.push(dayKeyOffset(t, -i)) }
      let kcal = 0, protein = 0, carbs = 0, fat = 0, logged = 0
      const kcalByKey: Record<string, number> = {}
      for (const d of days) {
        const totals = await getMacroTotals(d).catch(() => null)
        kcalByKey[d] = totals ? Number(totals.calories || 0) : 0
        if (!totals || totals.calories <= 0) { continue }
        logged++
        kcal += totals.calories
        protein += totals.protein
        carbs += totals.carbs
        fat += totals.fat
      }
      const hydRows = await db.hydrationLogs.where('localDate').anyOf(days).toArray().catch(() => []) as Array<{ amountMl: number; isDemo?: boolean }>
      const hydrationMl = hydRows.filter((h) => !h.isDemo).reduce((a, h) => a + Number(h.amountMl || 0), 0)
      const avgDays = logged > 0 ? logged : 1
      if (!alive) { return }
      setNutrition({
        kcal: Math.round(kcal / avgDays), protein: Math.round(protein / avgDays),
        carbs: Math.round(carbs / avgDays), fat: Math.round(fat / avgDays),
        hydrationMl, daysLogged: logged,
      })
      setNutritionWeek(buildNutritionWeek(t, kcalByKey))
    }
    run()
    return () => { alive = false }

  }, [period, reloadKey])

  // ─── Medidas del período (solo las registradas realmente) ───
  const measures = useMemo(() => {
    const last = periodBodies[periodBodies.length - 1]
    const first = periodBodies[0]
    if (!last) { return [] }
    const rows: Array<{ label: string; now: number | null; prev: number | null; unit: string }> = [
      { label: 'Peso', now: numOrNull(last.weightKg), prev: numOrNull(first?.weightKg), unit: 'kg' },
      { label: '% Grasa', now: numOrNull(last.bodyFatPct), prev: numOrNull(first?.bodyFatPct), unit: '%' },
      { label: 'Masa muscular', now: numOrNull(last.muscleMassKg), prev: numOrNull(first?.muscleMassKg), unit: 'kg' },
      { label: 'Pecho', now: numOrNull(last.chestCm), prev: numOrNull(first?.chestCm), unit: 'cm' },
      { label: 'Cintura', now: numOrNull(last.waistCm), prev: numOrNull(first?.waistCm), unit: 'cm' },
      { label: 'Cadera', now: numOrNull(last.hipCm), prev: numOrNull(first?.hipCm), unit: 'cm' },
    ]
    return rows.filter((r) => r.now !== null)
  }, [periodBodies])

  const partMetricLabel = METRICS.find(([m]) => m === metric)?.[1] ?? metric

  const hasAnyData = allLogs.length > 0 || bodies.length > 0 || recovery.length > 0 || totalSessionDays > 0
  const hasPeriodData = periodLogs.length > 0 || periodBodies.length > 0 || periodRec.length > 0

  // ─── BLOQUE 6: resumen nutricional (medias del período + serie de 7 días) ───
  const nutritionBlock = () => {
    const weekMax = Math.max(...nutritionWeek.map((w) => w.kcal), 1)
    return (
      <AltheaCard className="p-4 h-full" data-testid="progreso-nutrition">
        <AltheaCardHeader
          title="Resumen nutricional"
          subtitle={nutrition?.daysLogged ? `Media de ${nutrition.daysLogged} ${nutrition.daysLogged === 1 ? 'día' : 'días'} con registro` : 'Sin registros'}
          icon="restaurant"
        />
        {!nutrition || nutrition.daysLogged === 0 ? (
          <InlineEmpty icon="restaurant" text="Sin comidas registradas." sub="Registrá tu dieta en Nutrición para ver la evolución." />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {([
              ['Calorías', nutrition.kcal, 'kcal'],
              ['Proteínas', nutrition.protein, 'g'],
              ['Carbohidratos', nutrition.carbs, 'g'],
              ['Grasas', nutrition.fat, 'g'],
            ] as Array<[string, number, string]>).map(([label, val, unit]) => (
              <li key={label} className="bg-surface-container-highest rounded-lg p-2">
                <span className="font-label-caps text-[9px] uppercase text-outline block">{label}</span>
                <span className="font-headline-md text-sm font-semibold text-on-surface tabular-nums">
                  {Math.round(val).toLocaleString('es-AR')}<span className="text-[10px] text-on-surface-variant ml-0.5">{unit}</span>
                </span>
              </li>
            ))}
            <li className="bg-surface-container-highest rounded-lg p-2">
              <span className="font-label-caps text-[9px] uppercase text-outline block">Hidratación</span>
              <span className="font-headline-md text-sm font-semibold text-on-surface tabular-nums">
                {nutrition.hydrationMl.toLocaleString('es-AR')}<span className="text-[10px] text-on-surface-variant ml-0.5">ml</span>
              </span>
            </li>
          </ul>
        )}

        <div className="mt-3 pt-3 border-t border-outline-variant/30">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-label-caps text-[9px] uppercase text-outline">Calorías · hoy y 6 días previos</span>
            <span className="font-label-caps text-[9px] uppercase text-outline">meta {fmtKg(nutrition?.kcal ?? 0)} kcal/día</span>
          </div>
          {nutritionWeek.length === 0 || nutritionWeek.every((w) => w.kcal === 0) ? (
            <InlineEmpty icon="bar_chart" text="Sin consumo registrado en la última semana." sub="Registrá tus comidas en Nutrición." />
          ) : (
            <div className="grid grid-cols-7 gap-1.5 items-end" role="img" aria-label={`Calorías consumidas por día: ${nutritionWeek.map((w) => `${w.today ? 'hoy' : w.label} ${Math.round(w.kcal)}`).join(', ')}`}>
              {nutritionWeek.map((w) => {
                const h = w.kcal > 0 ? Math.max(8, Math.round((w.kcal / weekMax) * 100)) : 4
                return (
                  <div key={w.key} className="flex flex-col items-center gap-1">
                    <span className="font-mono text-[9px] text-on-surface-variant">{w.kcal > 0 ? `${(w.kcal / 1000).toFixed(1)}k` : ''}</span>
                    <div className="w-full h-16 bg-surface-container-high rounded-md flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-md transition-all ${w.kcal > 0 ? (w.today ? 'bg-secondary' : 'bg-primary') : ''}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className={`font-mono text-[9px] ${w.today ? 'text-secondary font-bold' : 'text-outline'}`}>{w.today ? 'Hoy' : w.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </AltheaCard>
    )
  }

  // ─── BLOQUE 4: recuperación (gauge + sueño + evolución) ───
  const recoveryBlock = () => (
    <AltheaCard className="p-4 h-full" data-testid="progreso-recovery">
      <AltheaCardHeader title="Recuperación" subtitle="Check-ins registrados en el período" icon="speed" />
      {!recLatest ? (
        <InlineEmpty icon="speed" text="Sin registros de recuperación." sub="Completá el cuestionario diario en Recuperación." />
      ) : (() => {
        const latest = recLatest.score
        const r = 48
        const c = 2 * Math.PI * r
        const arc = (latest / 100) * c
        const strokeColor = latest >= 70 ? 'var(--c-secondary)' : latest >= 40 ? 'var(--c-primary)' : 'var(--c-error)'
        const spark = recData.slice(-14).map((p) => p.indice)
        const sparkW = 140
        const sparkH = 28
        const srng = Math.max(...spark) - Math.min(...spark) || 1
        const sparkPath = spark.map((v, i) => {
          const x = (i / Math.max(1, spark.length - 1)) * sparkW
          const y = sparkH - 4 - ((v - Math.min(...spark)) / srng) * (sparkH - 8)
          return `${i === 0 ? 'M' : 'L'}${x},${y}`
        }).join(' ')
        return (
          <div className="flex flex-col items-center sm:flex-row sm:items-center gap-3">
            <svg viewBox="0 0 120 120" className="w-24 h-24 sm:w-28 sm:h-28 shrink-0" role="img" aria-label={`Recuperación ${latest} de 100`}>
              <circle cx="60" cy="60" r={r} fill="none" stroke="var(--c-outline-variant)" strokeWidth="8" />
              <circle cx="60" cy="60" r={r} fill="none" stroke={strokeColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arc} ${c}`} strokeDashoffset={c * 0.25} transform="rotate(-90 60 60)" />
              <text x="60" y="56" textAnchor="middle" fill="var(--c-on-surface)" fontSize="26" fontWeight="600" fontFamily="Cormorant Garamond, serif">{latest}</text>
              <text x="60" y="72" textAnchor="middle" fill="var(--c-on-surface-variant)" fontSize="10" fontFamily="Inter">/100</text>
            </svg>
            <div className="flex-1 w-full flex flex-col gap-2 items-center sm:items-start">
              <AltheaBadge
                variant={latest >= 70 ? 'success' : latest >= 40 ? 'warning' : 'danger'}
                icon={latest >= 70 ? 'favorite' : latest >= 40 ? 'self_improvement' : 'sleep'}
              >
                {latest >= 70 ? 'Recuperación óptima' : latest >= 40 ? 'Recuperación moderada' : 'Descanso recomendado'}
              </AltheaBadge>
              <div className="grid grid-cols-2 gap-2 w-full">
                <div className="bg-surface-container-highest rounded-lg p-2 text-center">
                  <span className="font-label-caps text-[9px] text-outline block">SUEÑO</span>
                  <span className="font-headline-md text-sm font-semibold text-on-surface">{typeof recLatest.sleepHours === 'number' ? `${recLatest.sleepHours} h` : '—'}</span>
                </div>
                <div className="bg-surface-container-highest rounded-lg p-2 text-center">
                  <span className="font-label-caps text-[9px] text-outline block">CALIDAD</span>
                  <span className="font-headline-md text-sm font-semibold text-on-surface">{typeof recLatest.sleepQuality === 'number' ? `${recLatest.sleepQuality}/10` : '—'}</span>
                </div>
              </div>
              {spark.length >= 2 && (
                <div className="w-full">
                  <span className="font-label-caps text-[9px] text-outline uppercase block mb-0.5">Evolución reciente</span>
                  <svg viewBox={`0 0 ${sparkW} ${sparkH}`} className="w-full h-6" role="img" aria-label="Evolución reciente del índice de recuperación">
                    <path d={sparkPath} fill="none" stroke="var(--c-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={sparkW} cy={sparkH - 4 - ((spark[spark.length - 1] - Math.min(...spark)) / srng) * (sparkH - 8)} r="2.5" fill="var(--c-secondary)" />
                  </svg>
                </div>
              )}
              <p className="font-body-sm text-on-surface-variant text-[11px]">Último check-in: {recLatest.date}.</p>
            </div>
          </div>
        )
      })()}
    </AltheaCard>
  )

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
          {/* ─── BLOQUE 1 · mapa muscular (protagonista, ancho completo) ─── */}
          <MuscleMapPanel
            weeks={muscleComparison.weeks}
            currentWeekIndex={muscleComparison.current?.week ?? muscleComparison.weeks.length + 1}
            currentByGroup={muscleComparison.current?.byGroup ?? {}}
            unmappedSets={unmappedMuscleSets}
            cycleStartDate={(cycle?.startDate ?? todayKey())}
            hasAnySet={allLogs.length > 0}
          />

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

          {/* ─── Evolución: parte muscular + métrica + gráfico + mini gráficos ─── */}
          <AltheaCard className="p-4 space-y-3" data-testid="progreso-evolution">
            <AltheaCardHeader title="Evolución por parte muscular" icon="query_stats" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Parte muscular
                <select
                  value={partSel}
                  onChange={e => setPartSel(e.target.value)}
                  aria-label="Parte muscular"
                  className="w-full mt-1 bg-surface-container border border-outline-variant rounded-lg p-2.5 font-body-md text-sm text-on-surface min-h-[44px]"
                >
                  {BODY_PARTS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
              </label>
              <div className="min-w-0">
                <span className="font-label-caps text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Métrica</span>
                <div className="grid grid-cols-3 gap-1.5 mt-1">
                  {METRICS.map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMetric(v)}
                      aria-pressed={metric === v}
                      data-testid={`metric-${v}`}
                      className={`py-2 min-h-[44px] rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${metric === v ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="font-body-sm text-[11px] text-on-surface-variant">{METRIC_HELP[metric]}</p>

            <div data-testid="progreso-chart">
              {globalData.length > 0 ? (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={globalData}>
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} width={40} />
                      <Tooltip />
                      <Line type="monotone" dataKey="valor" stroke="var(--c-primary)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="font-body-sm text-on-surface-variant">
                  Sin datos suficientes para mostrar la evolución de {partSel.toUpperCase()} en este período.
                </p>
              )}
            </div>

            {perExercise.filter(e => e.pts.length > 1).slice(0, 6).map(ex => {
              const vals = ex.pts.map(p => p.valor)
              const mn = Math.min(...vals)
              const rng = (Math.max(...vals) - mn) || 1
              const w = 120
              const h = 32
              const pathD = ex.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / Math.max(1, ex.pts.length - 1)) * w} ${h - ((p.valor - mn) / rng) * h}`).join(' ')
              return (
                <div key={ex.id} className="flex items-center gap-3 py-1.5 border-t border-outline-variant/30">
                  <span className="font-body-sm text-[11px] text-on-surface truncate min-w-0 flex-1">{ex.name}</span>
                  <svg width="72" height="20" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
                    <path d={pathD} fill="none" stroke="var(--c-primary)" strokeWidth="2" />
                  </svg>
                  <span className="font-label-caps text-[10px] text-on-surface-variant shrink-0">{ex.trend}</span>
                </div>
              )
            })}
            {unmapped > 0 && (
              <p className="font-body-sm text-[11px] text-on-surface-variant">
                {unmapped} {unmapped === 1 ? 'registro sin parte muscular' : 'registros sin parte muscular'}: no se grafican.
              </p>
            )}
          </AltheaCard>

          {/* ─── BLOQUES 4 y 6 · recuperación y resumen nutricional ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            <div className="lg:col-span-5">{recoveryBlock()}</div>
            <div className="lg:col-span-7">{nutritionBlock()}</div>
          </div>

          {/* ─── BLOQUE 7 · informe del período ─── */}
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