// Mapa muscular por GRUPO (PECHO / ESPALDA / PIERNAS / BRAZOS / HOMBROS) y
// comparación semana a semana del ciclo. Todo derivado de volumen ejecutado
// (kg x reps) con ponderación por rol muscular real. Sin datos inventados:
// una semana sin series no genera cambio, se marca como sin base.
import { muscleLoadOf, type MuscleLoad } from './metrics'
import { cycleWeekRange, completedCycleWeeks, type CycleConfig } from '@/utils/cycle'
import { todayKey } from '@/utils/dates'

export const MUSCLE_GROUPS = ['PECHO', 'ESPALDA', 'PIERNAS', 'BRAZOS', 'HOMBROS'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

// Un músculo API (o sus sinónimos del seed local) pertenece a un grupo.
// Los subgroups del seed español se agrupan en su familia para no perder trabajo.
const GROUP_MEMBERS: Record<string, MuscleGroup> = {
  pectorals: 'PECHO', pecho: 'PECHO', pectoral: 'PECHO',
  lats: 'ESPALDA', espalda: 'ESPALDA', dorsal: 'ESPALDA', dorsales: 'ESPALDA',
  'upper-back': 'ESPALDA', traps: 'ESPALDA', trapecios: 'ESPALDA',
  quads: 'PIERNAS', hamstrings: 'PIERNAS', glutes: 'PIERNAS', calves: 'PIERNAS',
  abductors: 'PIERNAS', adductors: 'PIERNAS', piernas: 'PIERNAS', cuadriceps: 'PIERNAS',
  isquiotibiales: 'PIERNAS', gluteos: 'PIERNAS', pantorrillas: 'PIERNAS',
  biceps: 'BRAZOS', triceps: 'BRAZOS', forearms: 'BRAZOS',
  biceps_brazo: 'BRAZOS', antebrazos: 'BRAZOS', brazo: 'BRAZOS',
  delts: 'HOMBROS', hombros: 'HOMBROS', hombro: 'HOMBROS', deltoides: 'HOMBROS',
}

export function groupOfMuscle(muscle: string): MuscleGroup | null {
  return GROUP_MEMBERS[muscle] ?? GROUP_MEMBERS[muscle.toLowerCase()] ?? null
}

export interface GroupLoad {
  group: MuscleGroup
  volume: number
  sets: number
  pct: number // % del total atribuido del período
  muscles: MuscleLoad[] // desglose por músculo real
}

/** Trabajo ponderado por grupo a partir de volumen + atribución real. */
export function groupLoadOf(
  items: Array<{ exerciseId: string; volume: number }>,
  muscleOf: (exerciseId: string) => { primary: string; secondary: string[] } | null,
  weights = { primary: 1, secondary1: 0.5, secondary2: 0.25 },
): { groups: GroupLoad[]; byGroup: Record<string, number>; unmappedVolume: number; unmappedSets: number } {
  const res = muscleLoadOf(items, muscleOf, weights)
  const byGroup: Record<string, number> = {}
  const musclesByGroup = new Map<MuscleGroup, MuscleLoad[]>()
  let attributed = 0
  for (const l of res.loads) {
    const g = groupOfMuscle(l.muscle)
    if (!g) { continue } // core/cardio/sin anatomía: fuera de los 5 grupos
    byGroup[g] = Math.round(((byGroup[g] ?? 0) + l.volume) * 10) / 10
    const arr = musclesByGroup.get(g) ?? []
    arr.push(l)
    musclesByGroup.set(g, arr)
    attributed += l.volume
  }
  const groups: GroupLoad[] = MUSCLE_GROUPS.map(g => {
    const muscles = (musclesByGroup.get(g) ?? []).slice().sort((a, b) => b.volume - a.volume)
    const volume = byGroup[g] ?? 0
    return {
      group: g,
      volume,
      sets: muscles.reduce((a, m) => a + m.sets, 0),
      pct: attributed > 0 ? Math.round((volume / attributed) * 100) : 0,
      muscles,
    }
  }).sort((a, b) => b.volume - a.volume)
  return { groups, byGroup, unmappedVolume: res.unmappedVolume, unmappedSets: res.unmappedSets }
}

export type MuscleTrend = 'aumento' | 'estable' | 'descenso' | 'sin-base'

/** Umbral estable: ±5% del baseline. Evita marcar ruido como tendencia. */
export const STABLE_THRESHOLD_PCT = 5

export interface GroupWeekStat {
  week: number // índice de semana de ciclo (1..N)
  start: string
  end: string
  isBase: boolean
  byGroup: Record<string, number>
  musclesByGroup: Record<string, Array<{ muscle: string; volume: number; sets: number; pct: number }>>
  total: number
  trend: Record<MuscleGroup, MuscleTrend>
  delta: Record<MuscleGroup, number | null> // variación absoluta vs semana previa
  deltaPct: Record<MuscleGroup, number | null>
  isComplete: boolean
}

function trendOf(current: number, prior: number): { trend: MuscleTrend; delta: number | null; deltaPct: number | null } {
  if (!(prior > 0)) { return { trend: 'sin-base', delta: null, deltaPct: null } }
  const delta = Math.round((current - prior) * 10) / 10
  const pct = Math.round((delta / prior) * 1000) / 10
  const trend: MuscleTrend = delta > 0 ? 'aumento' : delta < 0 ? 'descenso' : 'estable'
  return { trend: Math.abs(pct) < STABLE_THRESHOLD_PCT && delta !== 0 ? 'estable' : trend, delta, deltaPct: pct }
}

/**
 * Compara el trabajo muscular de las semanas COMPLETAS del ciclo.
 * La semana 1 completa es BASE. Cada semana posterior se compara con la
 * inmediatamente anterior. La semana en curso se agrega aparte (`current`).
 */
export function weeklyGroupComparison(
  itemsByDate: Array<{ date: string; exerciseId: string; volume: number }>,
  muscleOf: (exerciseId: string) => { primary: string; secondary: string[] } | null,
  cycle: CycleConfig,
  today: string = todayKey(),
): { weeks: GroupWeekStat[]; current: { byGroup: Record<string, number>; total: number; week: number } | null } {
  const complete = completedCycleWeeks(cycle, today)
  const weekByIndex = new Map(complete.map(w => [w.index, w]))
  const itemsOf = (start: string, end: string) => itemsByDate.filter(i => i.date >= start && i.date <= end)

  const weeks: GroupWeekStat[] = []
  let prior: Record<string, number> = {}
  for (const w of complete) {
    const { byGroup, groups } = groupLoadOf(itemsOf(w.start, w.end), muscleOf)
    const musclesByGroup: GroupWeekStat['musclesByGroup'] = {}
    for (const g of groups) { musclesByGroup[g.group] = g.muscles }
    const total = MUSCLE_GROUPS.reduce((a, g) => a + (byGroup[g] ?? 0), 0)
    const isBase = weeks.length === 0
    const trend: Record<MuscleGroup, MuscleTrend> = {} as Record<MuscleGroup, MuscleTrend>
    const delta: Record<MuscleGroup, number | null> = {} as Record<MuscleGroup, number | null>
    const deltaPct: Record<MuscleGroup, number | null> = {} as Record<MuscleGroup, number | null>
    for (const g of MUSCLE_GROUPS) {
      const t = isBase ? { trend: 'sin-base' as MuscleTrend, delta: null, deltaPct: null } : trendOf(byGroup[g] ?? 0, prior[g] ?? 0)
      trend[g] = t.trend
      delta[g] = t.delta
      deltaPct[g] = t.deltaPct
    }
    weeks.push({ week: w.index, start: w.start, end: w.end, isBase, byGroup, musclesByGroup, total, trend, delta, deltaPct, isComplete: true })
    prior = byGroup
  }

  // Semana en curso: se muestra como estado actual, nunca como BASE ni comparación cerrada.
  const curIdx = complete.length + 1
  const curRange = cycleWeekRange(curIdx, cycle)
  const current = today >= curRange.start
    ? (() => {
      const { byGroup } = groupLoadOf(itemsOf(curRange.start, today), muscleOf)
      return { byGroup, total: MUSCLE_GROUPS.reduce((a, g) => a + (byGroup[g] ?? 0), 0), week: curIdx }
    })()
    : null

  return { weeks, current }
}

export const TREND_LABEL: Record<MuscleTrend, string> = {
  'aumento': 'Aumento',
  'estable': 'Estable',
  'descenso': 'Descenso',
  'sin-base': 'Sin base',
}

export const TREND_COLOR: Record<MuscleTrend, string> = {
  'aumento': 'var(--c-success, #2E7D32)',
  'estable': 'var(--c-warning, #B8860B)',
  'descenso': 'var(--c-error, #B3261E)',
  'sin-base': 'var(--c-outline-variant)',
}
