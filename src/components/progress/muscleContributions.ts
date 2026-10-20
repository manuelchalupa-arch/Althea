/**
 * CONTRIBUCIONES POR REGIÓN — prepara el dato que recibe el atlas muscular.
 *
 * SEPARACIÓN DE MAGNITUDES (no se mezclan nunca en un número único sin
 * conservar su procedencia):
 *
 *   volumeMeasuredKg  kg × reps de la CARGA EXTERNA REAL registrada.
 *   volumeEstimatedKg kg × reps de la CARGA EQUIVALENTE ESTIMADA (peso corporal).
 *   exposure          índice comparativo del producto, en unidades internas.
 *
 * Reglas que corrigen las pérdidas detectadas en la auditoría:
 *
 *   1. Una serie válida cuenta como ACTIVIDAD aunque no tenga carga externa.
 *      Antes `if (!(item.volume > 0)) continue` descartaba peso corporal entero.
 *   2. Una carga desconocida es `null`, NUNCA 0.
 *   3. Si un identificador muscular no resuelve a una región, la serie se
 *      conserva como `sin-atribucion` y se cuenta. Antes desaparecía en
 *      silencio y ni siquiera figuraba en `unattributedSets`.
 *   4. `null` o cadena vacía en un identificador se cuentan como registro
 *      excluido CON MOTIVO auditable.
 *
 * Ponderación por rol (idéntica a `muscleLoadOf`, metrics.ts:214):
 *   primary × 1 · secondary[0] × 0.5 · secondary[1] × 0.25
 *
 * Son ESTIMACIONES de reparto, no mediciones fisiológicas.
 */
import { resolveMuscleIds } from './muscleVocabulary'
import {
  bodyweightForDate,
  bodyweightWithoutModel,
  pullupEquivalent,
  pushupEquivalent,
  type EquivalentLoad,
  type LoadProvenance,
} from '@/services/training/bodyweightLoad'

export type LoadKind = LoadProvenance
export type AttributionPrecision = 'musculo' | 'grupo' | 'ninguna'

/** Motivos de exclusión, auditable y cerrado. */
export type ExclusionReason =
  | 'sin-fecha'
  | 'sin-ejercicio'
  | 'sin-atribucion'
  | 'atribucion-no-resuelta'
  | 'sin-repeticiones'

export interface RegionContribution {
  /** Series completadas que trabajaron la región (conteo directo). */
  sets: number
  /** Repeticiones registradas en esas series (sin ponderar). */
  reps: number
  /** Fechas YYYY-MM-DD con actividad en la región. */
  days: string[]
  /** Ejercicios que aportaron, con su carga medida y estimada por separado. */
  exercises: { name: string; measuredKg: number; estimatedKg: number }[]
  /** Volumen de CARGA EXTERNA REAL (kg). */
  volumeMeasuredKg: number
  /** Volumen de CARGA EQUIVALENTE ESTIMADA (kg). Nunca se mezcla con el anterior. */
  volumeEstimatedKg: number
  /** Volumen total (medida + estimada). Fuente única para métricas de atlas. */
  volume: number
  /** Carga promedio medida (kg). `null` si no hay carga externa real. */
  avgLoadMeasuredKg: number | null
  /** Carga promedio estimada (kg). `null` si no hay estimación con fuente. */
  avgLoadEstimatedKg: number | null
  /** Minutos de actividad deportiva atribuidos a la región. */
  sportMinutes: number
  /** Precisión con la que se atribuyó esta región. */
  precision: AttributionPrecision
}

export interface ContributionItem {
  date: string
  exerciseId: string
  /** Carga externa real por serie. `null` = no registrada o peso corporal. */
  externalKg: number | null
  reps: number
  /** Marca temporal original; permite recuperar la fecha si falta. */
  timestamp?: string
}

export interface SportItem {
  date: string
  activityId: string
  /** Nombre legible para la etiqueta de atribución en el detalle. */
  activityName?: string
  durationMinutes: number | null
  /** Regiones de la actividad con su precisión y factor resistido. */
  regions: { regionId: string; precision: AttributionPrecision; resistedFactor: number }[]
}

/** Fila de auditoría: una entrada = una serie (o una actividad) procesada. */
export interface AuditRow {
  kind: 'serie' | 'actividad'
  date: string
  exerciseId: string
  exerciseName: string | null
  reps: number
  externalKg: number | null
  equivalentKg: number | null
  loadKind: LoadKind
  volumeMeasuredKg: number
  volumeEstimatedKg: number
  admitted: boolean
  exclusion: ExclusionReason | null
  regions: { regionId: string; contributionKg: number; attribution: AttributionPrecision }[]
  /** Fuente del coeficiente o del catálogo usado. */
  source: string | null
}

export interface ContributionResult {
  byRegion: Record<string, RegionContribution>
  /** Mayor exposición combinada; base de la normalización relativa. */
  maxVolume: number
  totalSets: number
  /** Series con volumen pero sin atribución muscular resoluble. */
  unattributedSets: number
  /** Series válidas sin carga externa (peso corporal). Siguen siendo actividad. */
  bodyweightSets: number
  /** Todas las filas procesadas, admitidas o no, con su motivo. */
  audit: AuditRow[]
  /** Resumen cuantitativo de lo que se perdió y por qué. */
  diagnostics: {
    totalProcessed: number
    admitted: number
    excluded: Record<ExclusionReason, number>
    unattributed: number
    bodyweightCounted: number
    estimatedCounted: number
    sportActivities: number
    sportUnattributed: number
  }
}

/** Mismos pesos que `muscleLoadOf`: primary, secondary[0], secondary[1]. */
const ROLE_WEIGHTS = [1, 0.5, 0.25] as const

/** Máximo de ejercicios listados por región (el detalle muestra menos). */
const MAX_EXERCISES_PER_REGION = 6

function emptyExclusionCounts(): Record<ExclusionReason, number> {
  return {
    'sin-fecha': 0,
    'sin-ejercicio': 0,
    'sin-atribucion': 0,
    'atribucion-no-resuelta': 0,
    'sin-repeticiones': 0,
  }
}

export interface ContributionOptions {
  /** Peso corporal indexado por fecha (procedencia 'dated'). */
  bodyweightByDate?: Map<string, number>
  /**
   * Perfil de carga equivalente por ejercicio. Sólo se aplica si el
   * ejercicio está en el catálogo: nunca se infiere del texto libre.
   */
  equivalentProfile?: (exerciseId: string) => {
    kind: 'flexiones' | 'dominadas' | 'sin-modelo'
    bodyweightKg: number | null
    apoyadas?: boolean
    inclinada?: boolean
    addedKg?: number | null
    assistanceKg?: number | null
    reason?: string
  }
}

/**
 * Resuelve la carga equivalente de una serie.
 * Sin catálogo aplicable devuelve `unavailable` con motivo: la serie cuenta
 * igual, sólo que sin kilogramo estimado.
 */
function equivalentFor(
  exerciseId: string,
  opts: ContributionOptions,
  date: string,
): EquivalentLoad {
  const profile = opts.equivalentProfile?.(exerciseId)
  if (!profile) {
    return bodyweightWithoutModel(null, 'Ejercicio sin perfil de peso corporal: se conservan las series sin carga equivalente estimada.')
  }
  const dated = bodyweightForDate(date, opts.bodyweightByDate ?? new Map())
  const bw = profile.bodyweightKg ?? dated.kg

  if (profile.kind === 'flexiones') {
    return pushupEquivalent({ bodyweightKg: bw, apoyadas: profile.apoyadas, inclinada: profile.inclinada })
  }
  if (profile.kind === 'dominadas') {
    return pullupEquivalent({
      bodyweightKg: bw,
      addedKg: profile.addedKg ?? 0,
      assistanceKg: profile.assistanceKg ?? null,
    })
  }
  return bodyweightWithoutModel(bw, profile.reason ?? 'Sin modelo de carga equivalente con evidencia suficiente.')
}

export function buildRegionContributions(
  items: ContributionItem[],
  muscleOf: (exerciseId: string) => { primary: { name: string; pct?: number }; secondary: { name: string; pct?: number }[] } | null,
  nameOf: (exerciseId: string) => string | null,
  opts: ContributionOptions = {},
  sports: SportItem[] = [],
): ContributionResult {
  const volumeByRegion = new Map<string, number>()
  const measuredByRegion = new Map<string, number>()
  const estimatedByRegion = new Map<string, number>()
  const loadSumByRegion = new Map<string, number[]>()
  /** Cargas MEDIDAS por serie, separadas de las estimadas. */
  const measuredLoadsByRegion = new Map<string, number[]>()
  const setsByRegion = new Map<string, number>()
  const repsByRegion = new Map<string, number>()
  const daysByRegion = new Map<string, Set<string>>()
  const byRegionExercise = new Map<string, Map<string, { m: number; e: number }>>()
  const precisionByRegion = new Map<string, AttributionPrecision>()
  const sportByRegion = new Map<string, number>()
  const audit: AuditRow[] = []

  let unattributedSets = 0
  let bodyweightSets = 0
  let estimatedCounted = 0
  const exclusion = emptyExclusionCounts()

  for (const item of items) {
    const label = nameOf(item.exerciseId)

    // ── 1. Integridad de la fecha. Sin fecha válida NO entra al cálculo. ──
    const date = (item.date || '').trim()
    if (!date) {
      exclusion['sin-fecha']++
      audit.push({
        kind: 'serie', date: '', exerciseId: item.exerciseId, exerciseName: label,
        reps: Number(item.reps) || 0, externalKg: item.externalKg, equivalentKg: null,
        loadKind: 'unavailable', volumeMeasuredKg: 0, volumeEstimatedKg: 0,
        admitted: false, exclusion: 'sin-fecha', regions: [], source: null,
      })
      continue
    }

    // ── 2. Identificación del ejercicio. ──
    if (!item.exerciseId || !item.exerciseId.trim()) {
      exclusion['sin-ejercicio']++
      audit.push({
        kind: 'serie', date, exerciseId: item.exerciseId ?? '', exerciseName: label,
        reps: Number(item.reps) || 0, externalKg: item.externalKg, equivalentKg: null,
        loadKind: 'unavailable', volumeMeasuredKg: 0, volumeEstimatedKg: 0,
        admitted: false, exclusion: 'sin-ejercicio', regions: [], source: null,
      })
      continue
    }

    const reps = Number(item.reps) > 0 ? Number(item.reps) : 0

    // ── 3. Cargas. `null` NO es 0: se distingue medida, estimada y ausente. ──
    const externalKg = item.externalKg !== null && item.externalKg > 0 ? item.externalKg : null
    const eq = externalKg !== null
      ? { ...bodyweightWithoutModel(null, 'Hay carga externa medida: no procede estimar peso corporal.'), externalKg, provenance: 'measured' as LoadKind }
      : equivalentFor(item.exerciseId, opts, date)

    const volumeMeasuredKg = externalKg !== null ? externalKg : 0
    const volumeEstimatedKg = eq.provenance === 'estimated' && eq.equivalentKg !== null
      ? eq.equivalentKg
      : 0

    // Una serie de peso corporal (sin carga externa) SIGUE siendo actividad.
    // Antes se descartaba por `if (!(item.volume > 0)) continue`.
    // Ahora: externalKg === null significa que es peso corporal, no que sea inválido.
    if (externalKg === null) { bodyweightSets++ }
    if (eq.provenance === 'estimated' && volumeEstimatedKg > 0) { estimatedCounted++ }

    // ── 4. Atribución muscular. ──
    const attribution = muscleOf(item.exerciseId)
    if (!attribution) {
      exclusion['sin-atribucion']++
      unattributedSets++
      audit.push({
        kind: 'serie', date, exerciseId: item.exerciseId, exerciseName: label,
        reps, externalKg, equivalentKg: eq.equivalentKg, loadKind: eq.provenance,
        volumeMeasuredKg, volumeEstimatedKg, admitted: false,
        exclusion: 'sin-atribucion', regions: [], source: eq.source,
      })
      continue
    }

    const muscles = [
      { name: attribution.primary.name, pct: attribution.primary.pct },
      ...attribution.secondary,
    ]
    const rowRegions: AuditRow['regions'] = []
    let resolvedAny = false
    // Reparto de la carga de esta serie entre los roles.
    // Si el ejercicio define porcentajes explícitos (muscleBreakdown), se usan;
    // si no, se aplican los pesos generales por rol (primary ×1, secondary ×0.5, secondary ×0.25).
    const roleTotal = volumeMeasuredKg + volumeEstimatedKg

    for (let i = 0; i < muscles.length; i++) {
      const muscle = muscles[i]
      if (!muscle?.name) { continue }
      const weight = muscle.pct !== undefined ? muscle.pct / 100 : (ROLE_WEIGHTS[i] ?? 0)
      const contribution = round1(roleTotal * weight)

      const regions = resolveMuscleIds(muscle.name)
      if (regions.length === 0) {
        // No se pierde: queda registrado como atribución no resuelta.
        exclusion['atribucion-no-resuelta']++
        continue
      }
      resolvedAny = true

      for (const region of regions) {
        const mPart = round1(volumeMeasuredKg * weight)
        const ePart = round1(volumeEstimatedKg * weight)
        if (contribution > 0) {
          volumeByRegion.set(region, round1((volumeByRegion.get(region) ?? 0) + contribution))
        }
        measuredByRegion.set(region, round1((measuredByRegion.get(region) ?? 0) + mPart))
        estimatedByRegion.set(region, round1((estimatedByRegion.get(region) ?? 0) + ePart))
        // sets/reps/days se cuentan SIEMPRE que la región resuelva: una serie
        // de peso corporal sin estimación sigue siendo una serie registrada.
        setsByRegion.set(region, (setsByRegion.get(region) ?? 0) + 1)
        repsByRegion.set(region, (repsByRegion.get(region) ?? 0) + reps)

        // Cargas promedio por serie, guardadas según su procedencia real.
        if (externalKg !== null) {
          const arr = measuredLoadsByRegion.get(region) ?? []
          arr.push(externalKg)
          measuredLoadsByRegion.set(region, arr)
        }
        if (eq.provenance === 'estimated' && eq.equivalentKg !== null) {
          const arr = loadSumByRegion.get(region) ?? []
          arr.push(eq.equivalentKg)
          loadSumByRegion.set(region, arr)
        }

        const prevPrec = precisionByRegion.get(region)
        const prec: AttributionPrecision = i === 0 ? 'musculo' : 'grupo'
        // Una atribución de músculo específico prevalece sobre una de grupo.
        precisionByRegion.set(region, prevPrec === 'musculo' ? 'musculo' : prec)

        if (item.date) {
          let days = daysByRegion.get(region)
          if (!days) { days = new Set(); daysByRegion.set(region, days) }
          days.add(item.date)
        }
        if (label) {
          let perExercise = byRegionExercise.get(region)
          if (!perExercise) { perExercise = new Map(); byRegionExercise.set(region, perExercise) }
          const cur = perExercise.get(label) ?? { m: 0, e: 0 }
          perExercise.set(label, { m: round1(cur.m + mPart), e: round1(cur.e + ePart) })
        }
        rowRegions.push({ regionId: region, contributionKg: contribution, attribution: prec })
      }
    }

    // Atribución presente pero sin región resoluble: incidencia, no silencio.
    if (!resolvedAny) {
      exclusion['atribucion-no-resuelta']++
      audit.push({
        kind: 'serie', date, exerciseId: item.exerciseId, exerciseName: label,
        reps, externalKg, equivalentKg: eq.equivalentKg, loadKind: eq.provenance,
        volumeMeasuredKg, volumeEstimatedKg, admitted: false,
        exclusion: 'atribucion-no-resuelta', regions: [], source: eq.source,
      })
      continue
    }

    if (reps <= 0 && roleTotal === 0) { exclusion['sin-repeticiones']++ }

    audit.push({
      kind: 'serie', date, exerciseId: item.exerciseId, exerciseName: label,
      reps, externalKg, equivalentKg: eq.equivalentKg, loadKind: eq.provenance,
      volumeMeasuredKg, volumeEstimatedKg, admitted: true, exclusion: null,
      regions: rowRegions, source: eq.source,
    })
  }

  // ── Actividades deportivas: exposición en MINUTOS, nunca en kg. ──
  let sportActivities = 0
  let sportUnattributed = 0
  /** Etiquetas de atribución deportiva por región (solo display, no volumen). */
  const sportLabelsByRegion = new Map<string, { name: string; measuredKg: number; estimatedKg: number }[]>()
  for (const s of sports) {
    const date = (s.date || '').trim()
    const attributedRegions = s.regions.filter((r) => r.regionId && r.resistedFactor > 0)
    if (attributedRegions.length === 0) {
      sportUnattributed++
      audit.push({
        kind: 'actividad', date, exerciseId: s.activityId, exerciseName: null,
        reps: 0, externalKg: null, equivalentKg: null, loadKind: 'unavailable',
        volumeMeasuredKg: 0, volumeEstimatedKg: 0, admitted: false,
        exclusion: s.durationMinutes && s.durationMinutes > 0 ? 'atribucion-no-resuelta' : 'sin-fecha',
        regions: [], source: 'Exposición deportiva en minutos; nunca se convierte a kg.',
      })
      continue
    }
    sportActivities++
    const rowRegions: AuditRow['regions'] = []
    const sessionLabel = `${s.activityName?.trim() || s.activityId} · ${round1((s.durationMinutes ?? 0))} min${date ? ` · ${date}` : ''} (actividad estimada)`
    for (const r of attributedRegions) {
      const minutes = round1((s.durationMinutes ?? 0) * r.resistedFactor)
      if (!(minutes > 0)) { continue }
      sportByRegion.set(r.regionId, round1((sportByRegion.get(r.regionId) ?? 0) + minutes))
      const prevPrec = precisionByRegion.get(r.regionId)
      precisionByRegion.set(r.regionId, prevPrec === 'musculo' ? 'musculo' : r.precision)
      let days = daysByRegion.get(r.regionId)
      if (!days) { days = new Set(); daysByRegion.set(r.regionId, days) }
      days.add(date)
      rowRegions.push({ regionId: r.regionId, contributionKg: minutes, attribution: r.precision })
      const labels = sportLabelsByRegion.get(r.regionId) ?? []
      labels.push({ name: sessionLabel, measuredKg: 0, estimatedKg: 0 })
      sportLabelsByRegion.set(r.regionId, labels)
    }
    audit.push({
      kind: 'actividad', date, exerciseId: s.activityId, exerciseName: null,
      reps: 0, externalKg: null, equivalentKg: null, loadKind: 'estimated',
      volumeMeasuredKg: 0, volumeEstimatedKg: 0, admitted: true, exclusion: null,
      regions: rowRegions,
      source: 'Exposición deportiva estimada en minutos-equivalentes (no son kg de volumen).',
    })
  }

  const byRegion: Record<string, RegionContribution> = {}
  const ids = new Set([...volumeByRegion.keys(), ...setsByRegion.keys(), ...sportByRegion.keys()])
  let maxVolume = 0
  for (const region of ids) {
    const exposure = round1((volumeByRegion.get(region) ?? 0))
    if (exposure > maxVolume) { maxVolume = exposure }
    const perExercise = byRegionExercise.get(region)
    const exercises = perExercise
      ? [...perExercise.entries()]
          .sort((a, b) => (b[1].m + b[1].e) - (a[1].m + a[1].e))
          .slice(0, MAX_EXERCISES_PER_REGION)
          .map(([name, v]) => ({ name, measuredKg: v.m, estimatedKg: v.e }))
      : []
    const measuredLoads = measuredLoadsByRegion.get(region) ?? []
    const estimatedLoads = loadSumByRegion.get(region) ?? []
    // Etiquetas deportivas: solo display en el detalle (actividad, minutos,
    // fecha). No aportan volumen, series ni reps: nunca se mezclan con kg.
    const sportLabels = sportLabelsByRegion.get(region) ?? []
    byRegion[region] = {
      sets: setsByRegion.get(region) ?? 0,
      reps: repsByRegion.get(region) ?? 0,
      days: [...(daysByRegion.get(region) ?? [])].sort(),
      exercises: [...exercises, ...sportLabels],
      volumeMeasuredKg: measuredByRegion.get(region) ?? 0,
      volumeEstimatedKg: estimatedByRegion.get(region) ?? 0,
      volume: round1((measuredByRegion.get(region) ?? 0) + (estimatedByRegion.get(region) ?? 0)),
      // Promedios POR SERIE, y sólo si hay base real de ese tipo.
      avgLoadMeasuredKg: measuredLoads.length ? round1(average(measuredLoads)) : null,
      avgLoadEstimatedKg: estimatedLoads.length ? round1(average(estimatedLoads)) : null,
      sportMinutes: sportByRegion.get(region) ?? 0,
      precision: precisionByRegion.get(region) ?? 'grupo',
    }
  }

  return {
    byRegion,
    maxVolume,
    totalSets: items.length,
    unattributedSets,
    bodyweightSets,
    audit,
    diagnostics: {
      totalProcessed: items.length + sports.length,
      admitted: audit.filter((a) => a.admitted).length,
      excluded: exclusion,
      unattributed: unattributedSets + exclusion['atribucion-no-resuelta'],
      bodyweightCounted: bodyweightSets,
      estimatedCounted,
      sportActivities,
      sportUnattributed,
    },
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function average(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * Activación relativa 0–100 de una región frente a la más trabajada.
 * Es RELATIVA al propio período, no un porcentaje de fibra reclutada.
 */
export function relativeActivation(volume: number, maxVolume: number): number {
  if (!(maxVolume > 0) || !(volume > 0)) { return 0 }
  return Math.max(0, Math.min(100, Math.round((volume / maxVolume) * 100)))
}