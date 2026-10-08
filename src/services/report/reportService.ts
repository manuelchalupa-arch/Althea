import { db } from '@/services/storage/db'
import { isDateInPeriod, type AnalysisPeriod } from '@/services/training/metrics'
import { isCompletedSession } from '@/services/training/sessionMetrics'
import { getDiaryEntries } from '@/services/storage/diaryStore'
import { todayKey, dayKeyOffset, toDateKey, daysBetween, weekdayOfKey } from '@/utils/dates'
import { computeExpenditure, sessionDurationMinutes, loadWeightRows, type ExpenditureResult } from '@/services/training/exerciseEnergy'
import { toUnifiedSets, calculateExercisePRs } from '@/services/training/prs'
import type { TrainingSession, SetRecord } from '@/services/training/domain'

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export type ReportPeriod = AnalysisPeriod
// Las 4 secciones que el usuario puede elegir. 'fuerza' y 'musculos' son
// subsecciones de 'entrenamiento': se confirman juntas desde la UI.
export type ReportCategory = 'mediciones' | 'entrenamiento' | 'fuerza' | 'musculos' | 'recuperacion' | 'nutricion'

/** Secciones de primer nivel ofrecidas en la UI (4). */
export const REPORT_SECTIONS: Array<{ id: 'mediciones' | 'entrenamiento' | 'nutricion' | 'recuperacion'; label: string; desc: string }> = [
  { id: 'mediciones', label: 'Mediciones', desc: 'peso, % grasa, masa muscular, perímetros' },
  { id: 'entrenamiento', label: 'Entrenamiento', desc: 'sesiones, volumen, series, fuerza, 1RM, carga muscular' },
  { id: 'nutricion', label: 'Nutrición', desc: 'kcal, proteínas, carbohidratos, grasas, hidratación' },
  { id: 'recuperacion', label: 'Recuperación', desc: 'índice, fatiga, sueño, dolor, estrés' },
]

export const REPORT_SECTION_IDS = REPORT_SECTIONS.map(s => s.id)

/** Amplía una sección de UI a las categorías internas del servicio. */
export function categoriesForSection(id: 'mediciones' | 'entrenamiento' | 'nutricion' | 'recuperacion'): ReportCategory[] {
  return id === 'entrenamiento' ? ['entrenamiento', 'fuerza', 'musculos'] : [id]
}

/** ¿La selección cubre las 4 secciones → informe completo? */
export function isCompleteReport(categories: ReportCategory[]): boolean {
  return REPORT_SECTION_IDS.every(sec => categoriesForSection(sec).every(c => categories.includes(c)))
}

export interface ReportSelection {
  period: ReportPeriod
  customStart?: string
  customEnd?: string
  categories: ReportCategory[]
  today?: string // for test determinism
}

export interface ReportData {
  period: ReportPeriod
  periodLabel: string
  range: { start: string; end: string }
  entrenamiento?: {
    diasEntrenados: number
    diasUnicos: string[]
    sesiones: number // = diasEntrenados (1 día = 1 sesión)
    /** Sesiones COMPLETED en el período. */
    completadas: number
    /** Sesiones PARTIAL en el período (empezadas y no terminadas). */
    incompletas: number
    volumen: number
    series: number
    repeticiones: number
    /** Duración real medida (startedAt → fin − pausas) de las sesiones del período. */
    duracionMin?: number
    frecuencia: number // sesiones / días del período
    adherencia?: number // % días entrenados vs días del período
    rendimiento?: { volumenPorSesion: number }
    /** Serie temporal diaria (kg×reps por día) del período: sustituye la gráfica de evolución. */
    serieDiaria?: Array<{ fecha: string; volumen: number; series: number }>
    /** Gasto calórico del ejercicio: mismo motor que Inicio y el historial. */
    gastoCalorico?: Pick<ExpenditureResult, 'totalKcal' | 'totalMinutes' | 'motivo' | 'porFecha'>
    /** Distribución de sesiones por día de la semana (Lun…Dom). */
    distribucion: Array<{ dia: string; sesiones: number }>
    /** Días con más y menos volumen entrenado (solo días con series). */
    diasActividad?: { mayor: { fecha: string; volumen: number } | null; menor: { fecha: string; volumen: number } | null }
    /** Comparación interna 1ª vs 2ª mitad del período; null si no hay con qué comparar. */
    comparativa?: { primeraMitad: number; segundaMitad: number; deltaPct: number | null }
    /** Observaciones escritas en las sesiones (texto real, sin interpretar). */
    observaciones: string[]
    /** Top 3 ejercicios por volumen en el período. */
    destacados: Array<{ exerciseId: string; volumen: number }>
  }
  fuerza?: {
    pesoMax: number
    repeticiones: number
    volumen: number
    rmEstimado: number // 1RM Epley sobre mejor serie
    progresoPorEjercicio: Array<{ exerciseId: string; pesoMax: number; reps: number; volumen: number; rm: number }>
    /** Mejores marcas históricas por ejercicio (cálculo propio de prs.ts). */
    prs: Array<{ exerciseId: string; peso: number; reps: number; fecha: string; rm: number; enPeriodo: boolean }>
  }
  musculos?: {
    cargaPorGrupo: Array<{ muscle: string; volumen: number; pct: number }>
    frecuencia: Record<string, number>
    gruposMas: string[]
    gruposMenos: string[]
  }
  recuperacion?: {
    scores: Array<{ date: string; score: number }>
    avgScore?: number
    fatiga: number[]
    suenoHoras: number[]
    dolorIncidencias: number
    estres: number[]
    motivacion: number[]
  }
  nutricion?: {
    calorias: number
    proteinas: number
    carbohidratos: number
    grasas: number
    hidratacionMl: number
  }
  mediciones?: {
    dias: number
    peso: { inicial: number; final: number; delta: number; min: number; max: number } | null
    grasaPct?: { inicial: number; final: number; delta: number }
    masaMuscularKg?: { inicial: number; final: number; delta: number }
    perimetros: Array<{ clave: string; inicial: number; final: number; delta: number }>
  }
  /** Conclusiones derivadas SOLO de los datos del informe (sin causalidad inventada). */
  conclusiones?: string[]
  isEmpty: boolean
  completo: boolean
}

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  '7': 'Últimos 7 días',
  '30': 'Últimos 30 días',
  '90': 'Últimos 90 días',
  '365': 'Año',
  'all': 'Todo el historial',
  'custom': 'Período personalizado',
}

function periodRange(period: ReportPeriod, opts: { customStart?: string; customEnd?: string; today?: string }): { start: string; end: string } {
  const today = opts.today ?? todayKey()
  if (period === 'custom') {return { start: opts.customStart ?? today, end: opts.customEnd ?? today }}
  if (period === 'all') {return { start: '1970-01-01', end: today }}
  return { start: dayKeyOffset(today, -(Number(period) - 1)), end: today }
}

function inReportPeriod(dateStr: string, sel: ReportSelection): boolean {
  const today = sel.today ?? todayKey()
  return isDateInPeriod(dateStr, sel.period, { customStart: sel.customStart, customEnd: sel.customEnd, today })
}

function epley1RM(weight: number, reps: number): number {
  if (reps <= 1) {return weight}
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

export async function generateReport(sel: ReportSelection): Promise<ReportData> {
  if (!sel.categories.length) {throw new Error('Seleccioná al menos una categoría')}
  const range = periodRange(sel.period, sel)
  const data: ReportData = {
    period: sel.period,
    periodLabel: sel.period === 'custom' ? `${sel.customStart ?? ''} → ${sel.customEnd ?? ''}` : PERIOD_LABEL[sel.period],
    range,
    isEmpty: true,
    completo: isCompleteReport(sel.categories),
  }

  // ENTRENAMIENTO: días únicos, volumen/series/reps desde setRecords oficiales
  if (sel.categories.includes('entrenamiento') || sel.categories.includes('fuerza') || sel.categories.includes('musculos')) {
    const sessions = await db.trainingSessions.toArray().catch(() => []) as unknown as TrainingSession[]
    // Sesiones reales del período (cualquier estado): base de completas/incompletas,
    // duración, distribución y gasto calórico. Las demo nunca entran.
    const periodAll = sessions.filter(s => !!s.calendarDate && !s.isDemo && inReportPeriod(s.calendarDate, sel))
    const filteredSessions = periodAll.filter(s => isCompletedSession(s))
    const diasUnicos = [...new Set(filteredSessions.map(s => s.calendarDate))].sort()
    const diasEntrenados = diasUnicos.length
    const completadas = periodAll.filter(s => s.sessionStatus === 'COMPLETED').length
    const incompletas = periodAll.filter(s => s.sessionStatus === 'PARTIAL').length

    const allSets = await db.setRecords.toArray().catch(() => []) as Array<Record<string, unknown>>
    const periodSets = allSets.filter(s => {
      const d = toDateKey((s as { completedAt?: string; createdAt?: string }).completedAt ?? (s as { createdAt?: string }).createdAt ?? '')
      if (!d) {return false}
      if ((s as { status?: string }).status !== 'COMPLETED') {return false}
      if ((s as { isDemo?: boolean }).isDemo) {return false}
      return inReportPeriod(d, sel)
    }) as Array<{ actualWeight: number; actualReps: number; exerciseId: string; completedAt?: string; createdAt?: string }>

    const volumen = periodSets.reduce((a, s) => a + Number(s.actualWeight || 0) * Number(s.actualReps || 0), 0)
    const series = periodSets.length
    const repeticiones = periodSets.reduce((a, s) => a + Number(s.actualReps || 0), 0)
    // Duración real medida (startedAt → fin − pausas). Sin timestamps no se suma:
    // nunca se estima una duración que no está registrada.
    const duracionMin = Math.round(periodAll.reduce((a, s) => {
      const m = sessionDurationMinutes(s)
      return m === null ? a : a + m
    }, 0) * 10) / 10

    // Días reales del período: `custom` y `all` ya no asumen 30/365 días.
    const primeraFecha = sessions.filter(s => !!s.calendarDate && !s.isDemo).map(s => s.calendarDate).sort()[0]
    const periodDaysCount = sel.period === 'all'
      ? Math.max(1, daysBetween(primeraFecha && primeraFecha < range.end ? primeraFecha : range.end, range.end) + 1)
      : Math.max(1, daysBetween(range.start, range.end) + 1)
    const frecuencia = Math.round((diasEntrenados / periodDaysCount) * 100) / 100

    if (sel.categories.includes('entrenamiento')) {
      const porDia = new Map<string, { volumen: number; series: number }>()
      for (const s of periodSets) {
        const d = toDateKey(s.completedAt ?? s.createdAt ?? '')
        if (!d) { continue }
        const cur = porDia.get(d) ?? { volumen: 0, series: 0 }
        cur.volumen += Number(s.actualWeight || 0) * Number(s.actualReps || 0)
        cur.series += 1
        porDia.set(d, cur)
      }
      const serieDiaria = [...porDia.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([fecha, v]) => ({ fecha, volumen: Math.round(v.volumen * 10) / 10, series: v.series }))

      // Gasto calórico del ejercicio: mismo motor que Inicio e historial.
      const weightRows = await loadWeightRows()
      const gasto = computeExpenditure({ from: range.start, to: range.end, sessions: periodAll, weightRows })

      const distribucion = DIAS_SEMANA.map(dia => ({ dia, sesiones: 0 }))
      for (const s of filteredSessions) { distribucion[(weekdayOfKey(s.calendarDate) + 6) % 7].sesiones++ }

      const porVolumen = [...serieDiaria].sort((a, b) => a.volumen - b.volumen)
      const diasActividad = serieDiaria.length
        ? {
            mayor: { fecha: porVolumen[porVolumen.length - 1].fecha, volumen: porVolumen[porVolumen.length - 1].volumen },
            menor: { fecha: porVolumen[0].fecha, volumen: porVolumen[0].volumen },
          }
        : { mayor: null, menor: null }

      // Comparación interna: 1ª vs 2ª mitad del rango (null si no hay con qué comparar).
      const mid = dayKeyOffset(range.start, Math.floor(daysBetween(range.start, range.end) / 2))
      let primeraMitad = 0, segundaMitad = 0
      for (const d of serieDiaria) {
        if (d.fecha <= mid) { primeraMitad += d.volumen } else { segundaMitad += d.volumen }
      }
      const comparativa = {
        primeraMitad: Math.round(primeraMitad * 10) / 10,
        segundaMitad: Math.round(segundaMitad * 10) / 10,
        deltaPct: primeraMitad > 0 && segundaMitad > 0 ? Math.round(((segundaMitad - primeraMitad) / primeraMitad) * 100) : null,
      }

      const observaciones = [...new Set(
        periodAll.map(s => String(s.generalObservation ?? '').trim()).filter(Boolean),
      )].slice(0, 5)

      const byExVol = new Map<string, number>()
      for (const s of periodSets) {
        const id = String(s.exerciseId)
        byExVol.set(id, (byExVol.get(id) ?? 0) + Number(s.actualWeight || 0) * Number(s.actualReps || 0))
      }
      const destacados = [...byExVol.entries()]
        .map(([exerciseId, v]) => ({ exerciseId, volumen: Math.round(v * 10) / 10 }))
        .sort((a, b) => b.volumen - a.volumen)
        .slice(0, 3)

      data.entrenamiento = {
        diasEntrenados,
        diasUnicos,
        sesiones: diasEntrenados,
        completadas,
        incompletas,
        volumen: Math.round(volumen * 10) / 10,
        series,
        repeticiones,
        duracionMin: duracionMin > 0 ? duracionMin : undefined,
        frecuencia,
        adherencia: periodoAdherencia(diasEntrenados, periodDaysCount),
        rendimiento: { volumenPorSesion: diasEntrenados ? Math.round((volumen / diasEntrenados) * 10) / 10 : 0 },
        serieDiaria,
        gastoCalorico: gasto,
        distribucion,
        diasActividad,
        comparativa,
        observaciones,
        destacados,
      }
      if (diasEntrenados > 0 || volumen > 0) {data.isEmpty = false}
    }

    if (sel.categories.includes('fuerza')) {
      const pesoMax = periodSets.reduce((m, s) => Math.max(m, Number(s.actualWeight || 0)), 0)
      const rmEstimado = (() => {
        if (!periodSets.length) {return 0}
        let best = 0
        for (const s of periodSets) {best = Math.max(best, epley1RM(Number(s.actualWeight || 0), Number(s.actualReps || 0)))}
        return best
      })()
      const byEx = new Map<string, { pesoMax: number; reps: number; volumen: number; rm: number }>()
      for (const s of periodSets) {
        const id = String(s.exerciseId)
        const cur = byEx.get(id) ?? { pesoMax: 0, reps: 0, volumen: 0, rm: 0 }
        cur.pesoMax = Math.max(cur.pesoMax, Number(s.actualWeight || 0))
        cur.reps += Number(s.actualReps || 0)
        cur.volumen += Number(s.actualWeight || 0) * Number(s.actualReps || 0)
        cur.rm = Math.max(cur.rm, epley1RM(Number(s.actualWeight || 0), Number(s.actualReps || 0)))
        byEx.set(id, cur)
      }
      const prs = buildExercisePRs(allSets, range)
      data.fuerza = {
        pesoMax,
        repeticiones,
        volumen: Math.round(volumen * 10) / 10,
        rmEstimado,
        progresoPorEjercicio: [...byEx.entries()].map(([exerciseId, v]) => ({ exerciseId, ...v, volumen: Math.round(v.volumen * 10) / 10 })).sort((a, b) => b.pesoMax - a.pesoMax),
        prs,
      }
      if (pesoMax > 0) {data.isEmpty = false}
    }

    if (sel.categories.includes('musculos')) {
      const { muscleLoadOf } = await import('@/services/training/metrics')
      const items = periodSets.map(s => ({ exerciseId: String(s.exerciseId), volume: Number(s.actualWeight || 0) * Number(s.actualReps || 0) }))
      // resolver real si existe
      let resolver: { muscleOf: (id: string) => { primary: string; secondary: string[] } | null } | null = null
      try {
        const { fetchPartMap } = await import('@/services/exerciseGym')
        const base = await fetchPartMap().catch(() => ({}))
        const { overlayCustomParts } = await import('@/services/training/customExercises')
        const map = await overlayCustomParts(base as Record<string, string>)
        const { buildMuscleResolver } = await import('@/services/training/muscleAttribution')
        const r = await buildMuscleResolver(map as Record<string, string>)
        resolver = { muscleOf: r.muscleOf }
      } catch { /* sin resolver: carga vacía */ }
      const muscleOf = resolver ? resolver.muscleOf : () => null
      const result = muscleLoadOf(items, muscleOf as never)
      const sorted = [...result.loads].sort((a, b) => b.volume - a.volume)
      data.musculos = {
        cargaPorGrupo: sorted.map(l => ({ muscle: l.muscle, volumen: l.volume, pct: l.pct })),
        frecuencia: Object.fromEntries(sorted.map(l => [l.muscle, l.sets])),
        gruposMas: sorted.slice(0, 3).map(l => l.muscle),
        gruposMenos: sorted.slice(-3).map(l => l.muscle),
      }
      if (sorted.length > 0) {data.isEmpty = false}
    }
  }

  if (sel.categories.includes('mediciones')) {
    const allRows = await db.bodyMeasurements.toArray().catch(() => []) as Array<{
      localDate: string; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number
      chestCm?: number; waistCm?: number; hipCm?: number; isDemo?: boolean
    }>
    const rows = allRows
      .filter(r => r.localDate && inReportPeriod(r.localDate, sel) && !r.isDemo)
      .sort((a, b) => a.localDate.localeCompare(b.localDate))
    const series = (pick: (r: typeof rows[number]) => number | undefined) =>
      rows.map(pick).filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    const track = (pick: (r: typeof rows[number]) => number | undefined) => {
      const vals = series(pick)
      if (vals.length === 0) { return null }
      const inicial = vals[0]
      const final = vals[vals.length - 1]
      return { inicial, final, delta: Math.round((final - inicial) * 10) / 10 }
    }
    const peso = track(r => r.weightKg)
    const grasaPct = track(r => r.bodyFatPct)
    const masaMuscularKg = track(r => r.muscleMassKg)
    const perimetros = ([
      ['Pecho', 'chestCm'], ['Cintura', 'waistCm'], ['Cadera', 'hipCm'],
    ] as Array<[string, 'chestCm' | 'waistCm' | 'hipCm']>)
      .map(([clave, k]) => ({ clave, t: track(r => r[k]) }))
      .filter((x): x is { clave: string; t: { inicial: number; final: number; delta: number } } => x.t !== null)
      .map(({ clave, t }) => ({ clave, ...t }))
    if (peso) {
      data.mediciones = {
        dias: rows.length,
        peso: { ...peso, min: Math.min(...series(r => r.weightKg)), max: Math.max(...series(r => r.weightKg)) },
        grasaPct: grasaPct ?? undefined,
        masaMuscularKg: masaMuscularKg ?? undefined,
        perimetros,
      }
      data.isEmpty = false
    }
  }

  if (sel.categories.includes('recuperacion')) {
    const allRec = await db.recoveryChecks.toArray().catch(() => []) as Array<Record<string, unknown>>
    const periodRec = allRec.filter(r => {
      const d = String((r as { localDate?: string }).localDate ?? '')
      return d && inReportPeriod(d, sel) && !(r as { isDemo?: boolean }).isDemo
    }) as Array<{ localDate: string; score: number; fatigue?: number; sleepHours?: number; soreness?: number; stress?: number; motivation?: number }>
    const scores = periodRec.map(r => ({ date: r.localDate, score: Number(r.score ?? 0) })).sort((a, b) => a.date.localeCompare(b.date))
    const avgScore = scores.length ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length) : undefined
    data.recuperacion = {
      scores,
      avgScore,
      fatiga: periodRec.map(r => Number(r.fatigue ?? 0)).filter(n => !isNaN(n)),
      suenoHoras: periodRec.map(r => Number(r.sleepHours ?? 0)).filter(n => n > 0),
      dolorIncidencias: periodRec.filter(r => Number(r.soreness ?? 0) >= 5).length,
      estres: periodRec.map(r => Number(r.stress ?? 0)).filter(n => !isNaN(n)),
      motivacion: periodRec.map(r => Number(r.motivation ?? 0)).filter(n => !isNaN(n)),
    }
    if (scores.length > 0) {data.isEmpty = false}
  }

  if (sel.categories.includes('nutricion')) {
    // calorías/macros por rango: sumar diaryEntries en período
    const allDays: string[] = []
    const nDays = daysBetween(range.start, range.end)
    for (let i = 0; i <= nDays; i++) {
      const ds = dayKeyOffset(range.start, i)
      if (inReportPeriod(ds, sel)) {allDays.push(ds)}
    }
    let calorias = 0, proteinas = 0, carbohidratos = 0, grasas = 0
    for (const ds of allDays) {
      const entries = await getDiaryEntries(ds).catch(() => [])
      for (const e of entries) {
        calorias += Number((e as { macros?: { calories?: number } }).macros?.calories ?? 0)
        proteinas += Number((e as { macros?: { proteins?: number } }).macros?.proteins ?? 0)
        carbohidratos += Number((e as { macros?: { carbs?: number } }).macros?.carbs ?? 0)
        grasas += Number((e as { macros?: { fats?: number } }).macros?.fats ?? 0)
      }
    }
    // hidratación real en rango
    const allHyd = await db.hydrationLogs.toArray().catch(() => []) as Array<{ localDate: string; amountMl: number; isDemo?: boolean }>
    const hidratacionMl = allHyd.filter(l => !l.isDemo && inReportPeriod(String(l.localDate), sel)).reduce((a, l) => a + Number(l.amountMl || 0), 0)
    data.nutricion = {
      calorias: Math.round(calorias),
      proteinas: Math.round(proteinas * 10) / 10,
      carbohidratos: Math.round(carbohidratos * 10) / 10,
      grasas: Math.round(grasas * 10) / 10,
      hidratacionMl,
    }
    if (calorias > 0 || hidratacionMl > 0) {data.isEmpty = false}
  }

  // Si ninguna categoría aportó datos, isEmpty true (período vacío)
  data.conclusiones = buildConclusiones(data)
  return data
}

function periodoAdherencia(diasEntrenados: number, periodoDias: number): number | undefined {
  if (!periodoDias) {return undefined}
  return Math.round((diasEntrenados / periodoDias) * 100)
}

/** Nombre legible de un ejercicio a partir de su id (mismo criterio que el PDF). */
function shortExerciseName(exerciseId: string): string {
  return exerciseId.split('/').pop()?.replace(/-/g, ' ') ?? exerciseId
}

/**
 * Mejores marcas históricas por ejercicio usando el motor propio de PRs/1RM
 * (prs.ts). `enPeriodo` indica si la marca se logró dentro del rango del
 * informe; no se inventan records ni se comparan con datos externos.
 */
function buildExercisePRs(
  allSets: Array<Record<string, unknown>>,
  range: { start: string; end: string },
): NonNullable<ReportData['fuerza']>['prs'] {
  const byExAll = new Map<string, SetRecord[]>()
  for (const s of allSets as unknown as SetRecord[]) {
    if (s.status !== 'COMPLETED' || s.isDemo || !s.exerciseId) {continue}
    if (!((s.actualWeight ?? 0) > 0) || !(s.actualReps > 0)) {continue}
    const list = byExAll.get(s.exerciseId) ?? []
    list.push(s)
    byExAll.set(s.exerciseId, list)
  }
  return [...byExAll.entries()].flatMap(([exerciseId, list]) => {
    const pr = calculateExercisePRs(toUnifiedSets(list))
    const w = pr.maxWeight
    const rm = pr.maxEstimated1RM
    if (!w || !rm) {return []}
    return [{
      exerciseId,
      peso: w.weight,
      reps: w.reps,
      fecha: w.date,
      rm: Math.round(rm.estimated1RM * 10) / 10,
      enPeriodo: w.date >= range.start && w.date <= range.end,
    }]
  })
    .sort((a, b) => (Number(b.enPeriodo) - Number(a.enPeriodo)) || (b.rm - a.rm))
    .slice(0, 10)
}

/**
 * Conclusiones derivadas SOLO de lo que hay en el propio informe: sin
 * causalidad, sin prognóstico y marcando «datos insuficientes» cuando falta.
 */
function buildConclusiones(data: ReportData): string[] {
  const out: string[] = []
  const e = data.entrenamiento
  if (e) {
    out.push(`Sesiones en el período: ${e.completadas} completadas y ${e.incompletas} incompletas${e.duracionMin ? ` · ${e.duracionMin} min de entrenamiento medidos` : ''}.`)
    const c = e.comparativa
    if (c && c.deltaPct !== null) {
      out.push(`El volumen de la 2ª mitad del período fue ${c.deltaPct > 0 ? '+' : ''}${c.deltaPct}% respecto de la 1ª (${c.primeraMitad} vs ${c.segundaMitad} kg).`)
    } else {
      out.push('Datos insuficientes para comparar la 1ª y la 2ª mitad del período.')
    }
    if (e.diasActividad?.mayor) { out.push(`Día de mayor actividad: ${e.diasActividad.mayor.fecha} (${Math.round(e.diasActividad.mayor.volumen)} kg).`) }
    if (e.gastoCalorico) {
      out.push(e.gastoCalorico.totalKcal !== null
        ? `Gasto calórico del ejercicio: ${Math.round(e.gastoCalorico.totalKcal)} kcal (estimación MET sobre sesiones con duración y peso registrados).`
        : 'Gasto calórico del ejercicio: sin datos suficientes para estimar.')
    }
    if (e.destacados.length) { out.push(`Mayor volumen por ejercicio: ${e.destacados.map(d => `${shortExerciseName(d.exerciseId)} (${d.volumen} kg)`).join(', ')}.`) }
    if (e.observaciones.length) { out.push(`Observaciones registradas: ${e.observaciones.join(' · ')}`) }
  }
  const pr = data.fuerza?.prs.find(p => p.enPeriodo) ?? data.fuerza?.prs[0]
  if (pr) {
    out.push(`Mejor marca de fuerza: ${shortExerciseName(pr.exerciseId)} ${pr.peso} kg × ${pr.reps} (1RM ${pr.rm} kg, ${pr.fecha}).`)
  }
  if (data.musculos?.gruposMas.length) { out.push(`Grupos musculares más trabajados: ${data.musculos.gruposMas.join(', ')}.`) }
  if (data.recuperacion?.avgScore !== undefined) { out.push(`Recuperación media del período: ${data.recuperacion.avgScore}/100.`) }
  if (data.mediciones?.peso) {
    const p = data.mediciones.peso
    out.push(`Peso: ${p.inicial} → ${p.final} kg (${p.delta > 0 ? '+' : ''}${p.delta} kg en el período).`)
  }
  if (data.nutricion) {
    out.push(`Nutrición registrada: ${Math.round(data.nutricion.calorias)} kcal · ${data.nutricion.hidratacionMl} ml de agua.`)
  }
  if (!out.length) { out.push('Sin datos suficientes en el período para armar conclusiones.') }
  return out
}
