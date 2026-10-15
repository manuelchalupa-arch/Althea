import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import SemanticIcon from '../components/ui/SemanticIcon';
import { db } from '@/services/storage/db'
import { fetchPartMap } from '@/services/exerciseGym'
import { isDateInPeriod, loadFatigueBalance } from '@/services/training/metrics'
import type { AnalysisPeriod } from '@/services/training/metrics'
import { countTrainingDays, countTrainingDaysInPeriod } from '@/services/training/sessionMetrics'
import { unifiedAllCompletedSets } from '@/services/history'
import { buildMuscleResolver, type MuscleResolver } from '@/services/training/muscleAttribution'
import { todayKey, dayKeyOffset, toDateKey, daysBetween } from '@/utils/dates'
import { MuscleAtlas } from '@/components/progress/MuscleAtlas'
import { buildAtlasMuscleData } from '@/components/progress/muscleAtlasData'
import { buildRegionContributions } from '@/components/progress/muscleContributions'
import {
  ATLAS_METRICS,
  ATLAS_MODES,
  DEFAULT_ATLAS_MODE,
  filterByRange,
  hasPriorHistory,
  resolveAtlasWindow,
  summarizeRows,
  type AtlasMetric,
  type AtlasMode,
  type AtlasSetRow,
} from '@/components/progress/atlasQuery'
import { buildRoutineCompliance, type ComplianceSession } from '@/services/training/routineCompliance'
import { getAllRoutines, getActiveRoutineId, type RoutineData } from '@/services/storage/routineStore'
import { normalizeSex, type SexCode } from '@/utils/sex'
import { AltheaCard, AltheaCardHeader, AltheaButton, AltheaKPICard, AltheaEmpty, AltheaLoading } from '@/components/althea'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { RecoveryCheck, UserProfile } from '@/types'

type UnifiedLog = {
  exerciseId: string
  weight: number
  reps: number
  createdAt: string
  sessionId?: string
  setNumber?: number
}

type SessionRow = {
  sessionId: string
  calendarDate: string
  sessionStatus: string
  routineId?: string | null
  actualDay?: number | null
  startedAt?: string
  completedAt?: string
  endedAt?: string
  isDemo?: boolean
}

// El resto de la página (KPIs, informe, reporte) trabaja con el `AnalysisPeriod`
// clásico. Solo el mapa usa las ventanas de calendario (semana/mes/ciclo).
const PERIOD_FOR_MODE: Record<AtlasMode, AnalysisPeriod> = {
  semana: '7',
  mes: '30',
  treinta: '30',
  rutina: '30',
  personalizada: 'custom',
}

const MODE_LABELS: Record<AtlasMode, string> = {
  semana: 'Semana actual (lunes a domingo)',
  mes: 'Mes actual',
  treinta: 'Mes actual',
  rutina: 'Semana del ciclo de la rutina',
  personalizada: 'Rango personalizado',
}

function shiftDays(dateStr: string, delta: number): string {
  return dayKeyOffset(dateStr, delta)
}

interface VolumeBucket { from: string; to: string; label: string; volume: number }

// Agregación REAL de volumen (kg×reps) por día/semana/mes dentro de la ventana
// del período. Nunca inventa valores: las celdas sin series quedan en 0.
function buildVolumeBuckets(
  logs: UnifiedLog[],
  period: AnalysisPeriod,
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

function periodDayCount(period: AnalysisPeriod, customStart: string, customEnd: string): number {
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
      <SemanticIcon name={icon} size={28} className="text-[28px] text-outline mb-2" />
      <p className="font-body-md text-sm text-on-surface-variant">{text}</p>
      {sub && <p className="font-body-md text-xs text-outline mt-1">{sub}</p>}
    </div>
  )
}

export default function Progresos() {
  const [allLogs, setAllLogs] = useState<UnifiedLog[]>([])
  const [trainingSessions, setTrainingSessions] = useState<SessionRow[]>([])
  const [bodies, setBodies] = useState<Array<{ localDate: string; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number; chestCm?: number; waistCm?: number; hipCm?: number }>>([])
  const [recovery, setRecovery] = useState<RecoveryCheck[]>([])
  const [routines, setRoutines] = useState<RoutineData[]>([])
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null)
  const [routineSel, setRoutineSel] = useState('')
  // Modalidad del mapa muscular: semana · mes · rutina · personalizada.
  const [mode, setMode] = useState<AtlasMode>(DEFAULT_ATLAS_MODE)
  // Métrica que colorea el mapa: volumen (kg) · series · reps.
  const [metric, setMetric] = useState<AtlasMetric>('volumen')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [resolver, setResolver] = useState<MuscleResolver | null>(null)
  // Sexo del perfil, normalizado a canónico ('M' | 'F' | 'X'). Sólo define
  // qué figura dibuja el atlas; no interviene en ningún cálculo.
  const [atlasSex, setAtlasSex] = useState<SexCode>('X')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
    const [reportOpen, setReportOpen] = useState(false)

  // Proyección de la modalidad al período clásico que usan KPIs, informe y reporte.
  const period: AnalysisPeriod = PERIOD_FOR_MODE[mode]

  const isMobile = useIsMobile()
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
      getAllRoutines().catch(() => [] as RoutineData[]),
      getActiveRoutineId().catch(() => null as string | null),
    ])
      .then(async ([unifiedLogs, officialSessions, bodyRows, recRows, baseMap, profileRows, routineRows, activeRid]) => {
        const { overlayCustomParts } = await import('@/services/training/customExercises')
        const partMap = await overlayCustomParts({ ...(baseMap as Record<string, string>) })
        const res = await buildMuscleResolver(partMap as Record<string, string>).catch(() => null)
        const profile = (profileRows[0] as UserProfile | undefined) ?? null
        const allOfficial = officialSessions as unknown as SessionRow[]
        if (!alive) { return }
        setAllLogs(unifiedLogs as unknown as UnifiedLog[])
        setResolver(res)
        setRoutines(routineRows)
        setActiveRoutineId(activeRid)
        setTrainingSessions(allOfficial)
        setBodies(bodyRows.slice().sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))))
        setRecovery(recRows.slice().sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || ''))))
        setAtlasSex(normalizeSex(profile?.sex))
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

  // ─── Mapa muscular: UNA sola consulta por modalidad ──────────────────────
  // Misma fuente de verdad que el resto de la página (`allLogs`: series
  // completadas reales), filtrada por la ventana resuelta para la modalidad.
  // La ventana previa (igual duración, inmediata anterior) alimenta la
  // tendencia por región. Nada depende de la semana del ciclo.
  const hasAnyData = allLogs.length > 0 || bodies.length > 0 || recovery.length > 0 || totalSessionDays > 0
  const hasPeriodData = periodLogs.length > 0 || periodBodies.length > 0 || periodRec.length > 0

  // Rutina seleccionada (modalidad Rutina): por defecto la activa. Se resuelve
  // ANTES de la ventana porque el modo Rutina se ancla al ciclo real de la
  // rutina (`cycle.startDate`), no a una ventana móvil.
  const routine = useMemo(() => {
    if (routines.length === 0) { return null }
    return routines.find((r) => r.id === (routineSel || activeRoutineId)) ?? routines[0] ?? null
  }, [routines, routineSel, activeRoutineId])

  const winResult = useMemo(
    () => resolveAtlasWindow(mode, { customStart, customEnd, cycle: routine?.cycle ?? null }),
    [mode, customStart, customEnd, routine?.cycle],
  )
  const win = 'error' in winResult ? null : winResult
  const winError = 'error' in winResult ? winResult.error : null

  const toAtlasRow = (l: UnifiedLog): AtlasSetRow => ({
    date: toDateKey(String(l.createdAt || '')),
    exerciseId: l.exerciseId,
    volume: Number(l.weight) * Number(l.reps),
    reps: Number(l.reps) > 0 ? Number(l.reps) : 0,
    sessionId: l.sessionId,
  })

  const windowRows = useMemo(
    () => (win ? filterByRange(allLogs, (l) => toDateKey(String(l.createdAt || '')), win.start, win.end).map(toAtlasRow) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLogs, win?.start, win?.end],
  )
  const prevRows = useMemo(
    () => (win ? filterByRange(allLogs, (l) => toDateKey(String(l.createdAt || '')), win.prevStart, win.prevEnd).map(toAtlasRow) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLogs, win?.prevStart, win?.prevEnd],
  )
  const earliestDate = useMemo(() => {
    let min = ''
    for (const l of allLogs) {
      const d = toDateKey(String(l.createdAt || ''))
      if (d && (!min || d < min)) { min = d }
    }
    return min
  }, [allLogs])
  const hasPrior = !!win && (prevRows.length > 0 || (!!earliestDate && hasPriorHistory([earliestDate], win.prevStart)))

  const muscleOf = resolver?.muscleOf ?? (() => null)
  const nameOf = resolver?.nameOf ?? (() => null)

  const compliance = useMemo(() => {
    if (mode !== 'rutina' || !routine || !win) { return null }
    return buildRoutineCompliance({
      routine,
      sessions: trainingSessions as ComplianceSession[],
      sets: windowRows.map((r) => ({ sessionId: r.sessionId ?? '', exerciseId: r.exerciseId })),
      windowStart: win.start,
      windowEnd: win.end,
    })
  }, [mode, routine, trainingSessions, windowRows, win])

  // Filas del mapa: en modalidad Rutina solo cuentan las sesiones trazadas a
  // la rutina (por routineId, nunca por nombre). El resto se informa aparte.
  const scopedRows = useMemo(() => {
    if (mode !== 'rutina' || !compliance) { return windowRows }
    const ids = new Set(compliance.sessionIds)
    return windowRows.filter((r) => r.sessionId && ids.has(r.sessionId))
  }, [mode, compliance, windowRows])
  const scopedPrevRows = useMemo(() => {
    if (mode !== 'rutina' || !compliance) { return prevRows }
    const ids = new Set(compliance.sessionIds)
    return prevRows.filter((r) => r.sessionId && ids.has(r.sessionId))
  }, [mode, compliance, prevRows])

  const contributions = useMemo(() => {
    const items = scopedRows.map((r) => ({ date: r.date, exerciseId: r.exerciseId, volume: r.volume, reps: r.reps }))
    return buildRegionContributions(items, muscleOf, nameOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRows, resolver])
  const prevContributions = useMemo(() => {
    if (!hasPrior) { return null }
    const items = scopedPrevRows.map((r) => ({ date: r.date, exerciseId: r.exerciseId, volume: r.volume, reps: r.reps }))
    return buildRegionContributions(items, muscleOf, nameOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedPrevRows, hasPrior, resolver])

  const muscleData = useMemo(
    () => buildAtlasMuscleData({
      enabled: hasAnyData,
      current: contributions,
      previous: prevContributions,
      metric,
    }),
    [hasAnyData, contributions, prevContributions, metric],
  )

  const totals = useMemo(() => summarizeRows(scopedRows, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedRows, resolver])
  const prevTotals = useMemo(() => summarizeRows(scopedPrevRows, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedPrevRows, resolver])
  const volumeDeltaPct = prevTotals.volume > 0 && totals.volume > 0
    ? Math.round(((totals.volume - prevTotals.volume) / prevTotals.volume) * 100)
    : null

  const [vista, setVista] = useState<'front' | 'back'>('front')

  // ─── BLOQUE 7: informe periódico (conclusiones + descarga) ───
  const showAllHistory = () => {
    if (earliestDate) {
      setCustomStart(earliestDate)
      setCustomEnd(todayKey())
      setMode('personalizada')
    }
  }
  const reportBlock = () => (
    <AltheaCard className="p-4" data-testid="progreso-report">
      <AltheaCardHeader
        title="Informe del período"
        subtitle={`${MODE_LABELS[mode]} · conclusiones derivadas solo de tus registros`}
        icon="insights"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {insights.length === 0 ? (
          <InlineEmpty icon="insights" text="Sin conclusiones todavía." sub="Puede deberse a datos insuficientes en el período." />
        ) : (
          <ul className="space-y-2">
            {insights.slice(0, 4).map((ins, i) => (
              <li key={i} className="flex items-start gap-2">
                <SemanticIcon name={ins.icon} size={15} className={`text-[15px] mt-0.5 shrink-0 ${ins.tone === 'ok' ? 'text-secondary' : ins.tone === 'attention' ? 'text-tertiary' : 'text-on-surface-variant'}`} />
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

  if (isMobile) {
    return (
      <div className="space-y-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            <span className="font-label-caps text-[10px] text-secondary uppercase tracking-widest">Evolución de entrenamiento</span>
          </div>
          <h1 className="font-headline-lg text-2xl font-semibold text-on-surface tracking-tight">
            {loading ? 'Cargando…' : 'Progreso'}
          </h1>
          <p className="font-body-sm text-[12px] text-on-surface-variant mt-0.5">
            Fuerza, volumen, peso y recuperación a partir de tus registros reales.
          </p>
        </div>

        <AtlasModeChips
          mode={mode}
          onMode={setMode}
          wrapClass="flex gap-1.5 overflow-x-auto pb-1"
          chipClass={(active) => `shrink-0 px-3 min-h-[44px] rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${active ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant'}`}
        />
        <AtlasMetricControl
          metric={metric}
          onMetric={setMetric}
          wrapClass="flex gap-1.5 items-center overflow-x-auto pb-1"
          btnClass={(active) => `shrink-0 px-3 min-h-[44px] rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${active ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant'}`}
        />
        {mode === 'personalizada' && (
          <AtlasCustomRange
            start={customStart}
            end={customEnd}
            onStart={setCustomStart}
            onEnd={setCustomEnd}
            error={winError}
            inputClass="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[44px]"
          />
        )}

        {loading ? (
          <AltheaLoading lines={4} />
        ) : error ? (
          <AltheaCard className="p-4">
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
          <AltheaCard className="p-4">
            <AltheaEmpty
              icon="calendar_month"
              title="Sin registros en este período"
              description={`No hay sesiones, mediciones ni check-ins entre ${customStart ? `el ${customStart}` : ''} y el ${customEnd || 'día de hoy'}. Probá otro período o ampliá el rango.`}
              action={<AltheaButton size="lg" className="min-h-[48px]" onClick={showAllHistory}>Ver todo el historial</AltheaButton>}
            />
          </AltheaCard>
        ) : (
          <>
            <AtlasSection
              win={win}
              winError={winError}
              mode={mode}
              routine={routine}
              routines={routines}
              onRoutine={setRoutineSel}
              routineSel={routineSel || activeRoutineId || ''}
              compliance={compliance}
              totals={totals}
              volumeDeltaPct={volumeDeltaPct}
              hasPrior={hasPrior}
              metric={metric}
              vista={vista}
              onVista={setVista}
              muscleData={muscleData}
              atlasSex={atlasSex}
            />

            <div className="grid grid-cols-1 gap-2">
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

            {reportBlock()}
            {reportOpen && <ReportModalLazy open={reportOpen} onClose={() => setReportOpen(false)} />}
          </>
        )}
      </div>
    )
  }

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
            <span className="font-label-md text-[14px] text-primary font-semibold">{MODE_LABELS[mode]}</span>
          </div>
          <div className="px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg flex items-center gap-2">
            <span className="font-label-caps text-[10px] text-outline uppercase">Registros:</span>
            <span className="font-label-md text-[14px] text-primary font-semibold tabular-nums">{periodLogs.length}</span>
          </div>
        </div>
</section>
      {/* ─── Selector de modalidad del mapa ─── */}
      <AtlasModeChips
        mode={mode}
        onMode={setMode}
        wrapClass="flex gap-1.5 flex-wrap"
        chipClass={(active) => `px-3 py-1.5 min-h-[44px] rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${active ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline'}`}
      />
      <AtlasMetricControl
        metric={metric}
        onMetric={setMetric}
        wrapClass="flex gap-1.5 flex-wrap items-center"
        btnClass={(active) => `px-3 py-1.5 min-h-[44px] rounded-lg font-label-caps text-[10px] font-semibold uppercase tracking-widest border transition-all ${active ? 'bg-surface-container-high border-primary text-on-surface' : 'bg-surface-container-low border-outline-variant/60 text-on-surface-variant hover:border-outline'}`}
      />
      {mode === 'personalizada' && (
        <AtlasCustomRange
          start={customStart}
          end={customEnd}
          onStart={setCustomStart}
          onEnd={setCustomEnd}
          error={winError}
          inputClass="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[44px]"
        />
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
            action={<AltheaButton size="lg" className="min-h-[48px]" onClick={showAllHistory}>Ver todo el historial</AltheaButton>}
          />
        </AltheaCard>
      ) : (
        <>
          {/* ─── BLOQUE 1 · atlas muscular (protagonista, ancho completo) ─── */}
          <AtlasSection
            win={win}
            winError={winError}
            mode={mode}
            routine={routine}
            routines={routines}
            onRoutine={setRoutineSel}
            routineSel={routineSel || activeRoutineId || ''}
            compliance={compliance}
            totals={totals}
            volumeDeltaPct={volumeDeltaPct}
            hasPrior={hasPrior}
            metric={metric}
            vista={vista}
            onVista={setVista}
            muscleData={muscleData}
            atlasSex={atlasSex}
            wide
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

// ─── Sub-componentes del mapa muscular (compartidos mobile/desktop) ─────────

/** Selector de modalidad del mapa. Es EL selector de período de la página. */
function AtlasModeChips({ mode, onMode, wrapClass, chipClass }: {
  mode: AtlasMode
  onMode: (m: AtlasMode) => void
  wrapClass: string
  chipClass: (active: boolean) => string
}) {
  return (
    <div className={wrapClass} role="group" aria-label="Período del informe">
      {ATLAS_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onMode(m.id)}
          aria-pressed={mode === m.id}
          data-testid={m.testid}
          title={m.description}
          className={chipClass(mode === m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

/** Métrica que colorea el mapa: volumen (kg) · series · reps. */
function AtlasMetricControl({ metric, onMetric, wrapClass, btnClass }: {
  metric: AtlasMetric
  onMetric: (m: AtlasMetric) => void
  wrapClass: string
  btnClass: (active: boolean) => string
}) {
  return (
    <div className={wrapClass} role="radiogroup" aria-label="Métrica del mapa">
      <span className="atlas-metric__label">Color por:</span>
      {ATLAS_METRICS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={metric === m.id}
          data-testid={m.testid}
          onClick={() => onMetric(m.id)}
          className={btnClass(metric === m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function AtlasCustomRange({ start, end, onStart, onEnd, error, inputClass }: {
  start: string
  end: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
  error: string | null
  inputClass: string
}) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Desde
          <input type="date" value={start} onChange={e => onStart(e.target.value)} className={inputClass} />
        </label>
        <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Hasta
          <input type="date" value={end} onChange={e => onEnd(e.target.value)} className={inputClass} />
        </label>
      </div>
      {error && <p className="atlas-error" role="alert">{error}</p>}
    </div>
  )
}

/** Leyenda textual: el color nunca es la única vía de interpretación.
 *  El orden es el MISMO que usa el renderizado real, de menor a mayor
 *  intensidad: sin trabajo (gris) · baja (verde oscuro) · moderada
 *  (naranja) · alta (azul marino). */
function AtlasLegend({ metricLabel }: { metricLabel: string }) {
  return (
    <div className="atlas-legend" aria-label="Leyenda de intensidad">
      <span className="atlas-legend__item"><i className="atlas-legend__sw is-idle" aria-hidden="true" />Sin trabajo</span>
      <span className="atlas-legend__item"><i className="atlas-legend__sw is-low" aria-hidden="true" />Baja</span>
      <span className="atlas-legend__item"><i className="atlas-legend__sw is-mid" aria-hidden="true" />Moderada</span>
      <span className="atlas-legend__item"><i className="atlas-legend__sw is-high" aria-hidden="true" />Alta</span>
      <p className="atlas-legend__note">
        Intensidad relativa al período y a la métrica elegida ({metricLabel}). La tendencia histórica se muestra en el detalle de cada músculo.
      </p>
    </div>
  )
}

/** Indicadores del intervalo: mismos datos que la gráfica y el mapa. */
function AtlasSummary({ totals, volumeDeltaPct, hasPrior, windowLabel }: {
  totals: { sets: number; reps: number; volume: number; exercises: number; days: number }
  volumeDeltaPct: number | null
  hasPrior: boolean
  windowLabel: string
}) {
  const stats: Array<[string, string, string]> = [
    ['Días con entrenamiento', String(totals.days), windowLabel],
    ['Ejercicios', String(totals.exercises), `${totals.sets} series · ${totals.reps.toLocaleString('es-AR')} reps`],
    ['Volumen', `${Math.round(totals.volume).toLocaleString('es-AR')} kg`,
      volumeDeltaPct !== null
        ? `${volumeDeltaPct >= 0 ? '+' : ''}${volumeDeltaPct}% vs período anterior`
        : (hasPrior ? 'Sin volumen previo comparable' : 'Sin período previo con datos')],
  ]
  return (
    <dl className="atlas-stats">
      {stats.map(([label, value, sub]) => (
        <div key={label} className="atlas-stats__item">
          <dt>{label}</dt>
          <dd>{value}</dd>
          <dd className="atlas-stats__sub">{sub}</dd>
        </div>
      ))}
    </dl>
  )
}

function fmtMin(sec: number | null): string {
  if (sec === null || !(sec > 0)) { return 'no disponible' }
  const m = Math.round(sec / 60)
  return m < 1 ? 'menos de 1 min' : `${m} min`
}

function pctText(done: number, planned: number, pct: number | null): string {
  return `${done}/${planned}${pct === null ? ' · sin plan' : ` · ${pct}%`}`
}

/** Sección completa del mapa: ventana, rutina, gráfica, indicadores, mapa y leyenda. */
function AtlasSection(props: {
  win: { start: string; end: string; label: string } | null
  winError: string | null
  mode: AtlasMode
  routine: RoutineData | null
  routines: RoutineData[]
  onRoutine: (id: string) => void
  routineSel: string
  compliance: import('@/services/training/routineCompliance').RoutineCompliance | null
  totals: { sets: number; reps: number; volume: number; exercises: number; days: number }
  volumeDeltaPct: number | null
  hasPrior: boolean
  metric: AtlasMetric
  vista: 'front' | 'back'
  onVista: (v: 'front' | 'back') => void
  muscleData: Record<string, import('@/components/progress/MuscleAtlas').MuscleDataPoint>
  atlasSex: import('@/utils/sex').SexCode
  wide?: boolean
}) {
  const {
    win, winError, mode, routine, routines, onRoutine, routineSel, compliance,
    totals, volumeDeltaPct, hasPrior, metric,
    vista, onVista, muscleData, atlasSex, wide,
  } = props
  const metricMeta = ATLAS_METRICS.find((m) => m.id === metric) ?? ATLAS_METRICS[0]
  const subtitle = !win
    ? 'Resolvé el rango para ver el mapa.'
    : mode === 'rutina' && routine
      ? `${routine.name} · ${win.start.slice(5)} – ${win.end.slice(5)} (semana del ciclo)`
      : win.label
  return (
    <section className={wide ? 'rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4 md:p-5' : 'rounded-xl border border-outline-variant/40 bg-surface-container p-3'} data-testid="muscle-atlas">
      <h2 className={wide ? 'font-headline-lg text-xl font-semibold text-on-surface tracking-tight' : 'font-headline-lg text-lg font-semibold text-on-surface tracking-tight'}>Mapa muscular</h2>
      <p className={wide ? 'font-body-sm text-xs text-on-surface-variant mb-3' : 'font-body-sm text-[11px] text-on-surface-variant mb-3'}>{subtitle}</p>

      {mode === 'rutina' && (
        <div className="atlas-routine">
          {routines.length === 0 ? (
            <AltheaEmpty
              icon="rutinas"
              title="Sin rutina para medir cumplimiento"
              description="Creá una rutina en la pestaña Rutina: el cumplimiento se calcula contra lo planificado en ella."
            />
          ) : (
            <label className="font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">Rutina
              <select
                value={routineSel}
                onChange={(e) => onRoutine(e.target.value)}
                aria-label="Rutina a evaluar"
                className="w-full mt-1 bg-surface-container border border-outline-variant rounded p-2 font-body-md text-sm text-on-surface min-h-[44px]"
              >
                {routines.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {winError && <p className="atlas-error" role="alert">{winError}</p>}

      {win && !winError && (
        <>
          {totals.sets === 0 && (
            <AltheaEmpty
              icon="fitness_center"
              title="Sin trabajo en este intervalo"
              description="No hay series completadas en el rango elegido. Cambiá de modalidad o ampliá el rango."
            />
          )}
          <AtlasSummary totals={totals} volumeDeltaPct={volumeDeltaPct} hasPrior={hasPrior} windowLabel={win.label} />
          {mode === 'rutina' && compliance && (
            <div className="atlas-compliance" data-testid="atlas-compliance">
              <h3 className="font-label-caps text-[10px] uppercase tracking-widest text-on-surface-variant">Cumplimiento de la rutina</h3>
              {!compliance.hasPlan ? (
                <p className="font-body-sm text-[12px] text-on-surface-variant">La rutina no tiene ejercicios planificados.</p>
              ) : (
                <dl className="atlas-stats">
                  <div className="atlas-stats__item"><dt>Series</dt><dd>{pctText(compliance.seriesDone, compliance.seriesPlanned, compliance.seriesPct)}</dd><dd className="atlas-stats__sub">completadas / planificadas</dd></div>
                  <div className="atlas-stats__item"><dt>Ejercicios</dt><dd>{pctText(compliance.exDone, compliance.exPlanned, compliance.exPct)}</dd><dd className="atlas-stats__sub">completados / planificados</dd></div>
                  <div className="atlas-stats__item"><dt>Días</dt><dd>{pctText(compliance.daysDone, compliance.daysPlanned, compliance.daysPct)}</dd><dd className="atlas-stats__sub">realizados / programados</dd></div>
                  <div className="atlas-stats__item"><dt>Sesiones</dt><dd>{compliance.sessionsDone} hechas</dd><dd className="atlas-stats__sub">{compliance.sessionsPending} día(s) sin cobertura</dd></div>
                  <div className="atlas-stats__item"><dt>Carga ejecutada</dt><dd>{Math.round(totals.volume).toLocaleString('es-AR')} kg</dd><dd className="atlas-stats__sub">{totals.sets} series · {totals.reps.toLocaleString('es-AR')} reps</dd></div>
                  <div className="atlas-stats__item"><dt>Duración registrada</dt><dd>{fmtMin(compliance.durationSec)}</dd><dd className="atlas-stats__sub">suma de sesiones con inicio y fin</dd></div>
                </dl>
              )}
              {compliance.untrackedSets > 0 && (
                <p className="font-body-sm text-[12px] text-on-surface-variant">
                  {compliance.untrackedSets} serie(s) del intervalo no pertenecen a esta rutina (otra rutina o sin trazabilidad) y no cuentan para el cumplimiento.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <MuscleAtlas view={vista} onViewChange={onVista} data={muscleData} width={wide ? 280 : 260} detail="below" sex={atlasSex} />
      <AtlasLegend metricLabel={metricMeta.label} />
    </section>
  )
}