// Mapa muscular por GRUPO (PECHO / ESPALDA / PIERNAS / BRAZOS / HOMBROS /
// CORE) y comparación semana a semana del ciclo. Todo derivado de volumen
// ejecutado (kg x reps) con ponderación por rol muscular real. Sin datos
// inventados: una semana sin series no genera cambio, se marca como sin base.
import { muscleLoadOf, type MuscleLoad } from './metrics'
import type { MuscleAttribution } from './muscleAttribution'
import { cycleWeekRange, completedCycleWeeks, type CycleConfig } from '@/utils/cycle'
import { todayKey } from '@/utils/dates'
import { MUSCLE_CATALOG } from './muscleCatalog'
import { MUSCLE_ALIASES, normalizeMuscleName } from '@/components/progress/muscleVocabulary'
import { MUSCLE_REGIONS } from '@/components/progress/muscleGeometry'

export const MUSCLE_GROUPS = ['PECHO', 'ESPALDA', 'PIERNAS', 'BRAZOS', 'HOMBROS', 'CORE'] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

// Un músculo API (o sus sinónimos del seed local) pertenece a un grupo.
// Los subgroups del seed español se agrupan en su familia para no perder trabajo.
//
// IMPORTANTE: esto es un COMPLEMENTO, no la fuente de verdad. La tabla se
// deriva abajo de MUSCLE_CATALOG + MUSCLE_ALIASES, que ya conocen el
// vocabulario completo (ids del catálogo, nombres en español del seed,
// términos de la biblioteca y sus alias). Mantener acá sólo esta tabla era el
// bug: `groupOfMuscle` devolvía null para casi todos los ids canónicos y TODO
// el volumen de ESPALDA caía en `unmappedVolume`, con lo que el atlas de la
// espalda quedaba siempre "Sin datos".
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
  // CORE: el vocabulario del tipo Exercise (types/index.ts) ya incluye
  // 'abdomen' y el atlas ya tenía grupo 'core', pero este mapa no lo
  // contemplaba, así que TODO el volumen abdominal se descartaba acá y
  // las regiones del torso se pintaban siempre "Sin datos".
  abs: 'CORE', core: 'CORE', abdomen: 'CORE', abdominales: 'CORE',
  oblicuos: 'CORE', obliquo: 'CORE', serrato: 'CORE', obliquos: 'CORE',
  'serratus-anterior': 'CORE', 'rectus-abdominis': 'CORE',
  'obliquus-externus': 'CORE', 'recto-abdominal': 'CORE',
  'abdominales-superiores': 'CORE', 'abdominales-inferiores': 'CORE',
  'recto-abdominal-superior': 'CORE', 'recto-abdominal-inferior': 'CORE',
}

// ── Derivación de la tabla de grupos ───────────────────────────────────────
// Región del atlas -> grupo. Fuente única: el catálogo; si la región no está
// en el catálogo (p. ej. teres-major, soleus) se usa el grupo de la propia
// geometría del atlas (que está en minúsculas).
const CATALOG_GROUP = new Map<string, MuscleGroup>(MUSCLE_CATALOG.map((m) => [m.id, m.group]))
const REGION_GROUP = new Map<string, MuscleGroup>()
for (const side of ['front', 'back'] as const) {
  for (const r of MUSCLE_REGIONS[side]) {
    const g = (r.parent ? CATALOG_GROUP.get(r.parent) : undefined)
      ?? CATALOG_GROUP.get(r.id)
      ?? (r.group.toUpperCase() as MuscleGroup)
    REGION_GROUP.set(r.id, g)
  }
}

// Nombre de músculo normalizado -> grupo.
// Un alias puede apuntar a un id de región O a un id del catálogo (el padre),
// así que hay que mirar en las dos tablas.
const ID_GROUP = new Map<string, MuscleGroup>(CATALOG_GROUP)
for (const [id, g] of REGION_GROUP) { if (!ID_GROUP.has(id)) { ID_GROUP.set(id, g) } }

const GROUP_BY_NAME = new Map<string, MuscleGroup>()
// 1) ids del catálogo (anatomía oficial del repo).
for (const m of MUSCLE_CATALOG) { GROUP_BY_NAME.set(normalizeMuscleName(m.id), m.group) }
// 2) todo lo que ya resuelve el vocabulario del atlas: alias de la biblioteca,
//    nombres del seed en español e ids de región.
for (const [alias, ids] of Object.entries(MUSCLE_ALIASES)) {
  let g: MuscleGroup | undefined
  for (const id of ids) {
    const found = ID_GROUP.get(id)
    if (found) { g = found; break }
  }
  if (g) { GROUP_BY_NAME.set(alias, g) }
}
// 3) la tabla manual, por último, por si cubre algo sin región (gana).
for (const [raw, g] of Object.entries(GROUP_MEMBERS)) {
  GROUP_BY_NAME.set(normalizeMuscleName(raw), g)
  GROUP_BY_NAME.set(raw, g)
}

/**
 * Grupo de un nombre de músculo venga de donde venga (id del catálogo,
 * nombre del seed, término de la biblioteca, con tildes o sin ellas).
 * `null` sólo si de verdad no es un músculo asignable (cardio, inventado).
 */
export function groupOfMuscle(muscle: string): MuscleGroup | null {
  if (!muscle) { return null }
  return GROUP_BY_NAME.get(normalizeMuscleName(muscle)) ?? null
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
  muscleOf: (exerciseId: string) => MuscleAttribution | null,
  weights = { primary: 1, secondary1: 0.5, secondary2: 0.25 },
): { groups: GroupLoad[]; byGroup: Record<string, number>; unmappedVolume: number; unmappedSets: number } {
  const res = muscleLoadOf(items, muscleOf, weights)
  const byGroup: Record<string, number> = {}
  const musclesByGroup = new Map<MuscleGroup, MuscleLoad[]>()
  let attributed = 0
  for (const l of res.loads) {
    const g = groupOfMuscle(l.muscle)
    if (!g) { continue } // sin anatomía asignable (cardio, cuerpo completo, desconocido)
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

/**
 * Tendencia de un grupo entre dos períodos, con el umbral de estabilidad.
 *
 * ES LA FUENTE ÚNICA de tendencia de este módulo: la comparación semanal de
 * grupos y el atlas muscular (Progreso) deben pasar por acá. Antes cada uno
 * calculaba la suya — acá con ±5% y en el atlas con comparación estricta —
 * y el mismo dato podía leerse "Descenso" en el atlas y "Estable" en la
 * tabla de semanas.
 *
 * `prior <= 0` no es un descenso: es "sin-base" (no hay comparación posible).
 */
export function resolveTrend(
  current: number,
  prior: number,
): { trend: MuscleTrend; delta: number | null; deltaPct: number | null } {
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
/** Semana en curso: estado parcial, nunca BASE. `start`/`end` delimitan la ventana usada. */
export interface CurrentWeekLoad {
  byGroup: Record<string, number>
  total: number
  week: number
  /** Primer día de la semana en curso (inclusive). */
  start: string
  /** Último día considerado: hoy, o el fin de la semana si ya terminó. */
  end: string
}

export function weeklyGroupComparison(
  itemsByDate: Array<{ date: string; exerciseId: string; volume: number }>,
  muscleOf: (exerciseId: string) => MuscleAttribution | null,
  cycle: CycleConfig,
  today: string = todayKey(),
): { weeks: GroupWeekStat[]; current: CurrentWeekLoad | null } {
  const complete = completedCycleWeeks(cycle, today)
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
      const t = isBase
        ? { trend: 'sin-base' as MuscleTrend, delta: null, deltaPct: null }
        : resolveTrend(byGroup[g] ?? 0, prior[g] ?? 0)
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
      const end = today < curRange.end ? today : curRange.end
      const { byGroup } = groupLoadOf(itemsOf(curRange.start, end), muscleOf)
      return {
        byGroup,
        total: MUSCLE_GROUPS.reduce((a, g) => a + (byGroup[g] ?? 0), 0),
        week: curIdx,
        start: curRange.start,
        end,
      }
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
