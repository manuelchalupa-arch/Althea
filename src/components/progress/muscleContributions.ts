/**
 * CONTRIBUCIONES POR REGIÓN — prepara el dato que recibe el atlas muscular.
 *
 * Resuelve, para cada región del atlas, cuánto volumen la trabajó y con qué
 * ejercicios, teniendo en cuenta el rol real de cada músculo en el ejercicio:
 *
 *   primary × 1 · secondary[0] × 0.5 · secondary[1] × 0.25
 *
 * Esas ponderaciones son LAS MISMAS que usa `muscleLoadOf`
 * (services/training/metrics.ts): no se cambian acá para que la tabla de
 * grupos y el atlas cuenten igual. Son ESTIMACIONES basadas en el registro de
 * entrenamiento, no mediciones fisiológicas exactas. Los pesos viven SOLO en
 * `ROLE_WEIGHTS` (este archivo) y en `muscleLoadOf`; no se duplican.
 *
 * Cada item de entrada equivale a UNA serie completada. Por eso, además del
 * volumen ponderado, se acumulan por región:
 *   - sets: cantidad de series que trabajaron la región (conteo directo: la
 *     serie existió y el músculo participó en ella);
 *   - reps: repeticiones registradas en esas series (sin ponderar);
 *   - days: fechas (YYYY-MM-DD) con actividad en la región.
 * El volumen sí se pondera por rol; sets/reps/days describen participación,
 * no carga. Nada de esto es una medición fisiológica.
 *
 * Reglas anti-invención (igual que el resto del módulo):
 *   - ejercicio sin atribución conocida → se ignora (ya queda en
 *     `unmappedVolume` del conteo de grupos);
 *   - músculo que no resuelve a ninguna región (cardio, cuerpo completo) →
 *     no genera contribución;
 *   - nombre de ejercicio desconocido → no se muestra, no se inventa.
 */
import { resolveMuscleIds } from './muscleVocabulary'

export interface RegionContribution {
  /** Volumen ponderado acumulado de la región (kg × reps repartidos por rol). */
  volume: number
  /** Series completadas que trabajaron la región (conteo directo). */
  sets: number
  /** Repeticiones registradas en esas series (conteo directo). */
  reps: number
  /** Fechas YYYY-MM-DD con actividad en la región, ordenadas. */
  days: string[]
  /** Ejercicios que aportaron a la región, ordenados por volumen desc. */
  exercises: string[]
}

export interface ContributionItem {
  date: string
  exerciseId: string
  volume: number
  /** Repeticiones de la serie (conteo directo, sin ponderar). */
  reps: number
}

export interface ContributionResult {
  byRegion: Record<string, RegionContribution>
  /** Mayor volumen entre todas las regiones; base para la activación relativa. */
  maxVolume: number
}

/** Máximo de ejercicios listados por región (el atlas muestra 4). */
const MAX_EXERCISES_PER_REGION = 6

/** Mismos pesos que `muscleLoadOf`: primary, secondary[0], secondary[1]. */
const ROLE_WEIGHTS = [1, 0.5, 0.25] as const

export function buildRegionContributions(
  items: ContributionItem[],
  muscleOf: (exerciseId: string) => { primary: string; secondary: string[] } | null,
  nameOf: (exerciseId: string) => string | null,
): ContributionResult {
  const volumeByRegion = new Map<string, number>()
  const setsByRegion = new Map<string, number>()
  const repsByRegion = new Map<string, number>()
  const daysByRegion = new Map<string, Set<string>>()
  /** Región -> ejercicio -> volumen que ese ejercicio le aportó. */
  const byRegionExercise = new Map<string, Map<string, number>>()

  for (const item of items) {
    if (!(item.volume > 0)) { continue }
    const attribution = muscleOf(item.exerciseId)
    if (!attribution) { continue }

    const label = nameOf(item.exerciseId)
    const muscles = [attribution.primary, attribution.secondary?.[0], attribution.secondary?.[1]]
    const reps = Number(item.reps) > 0 ? Number(item.reps) : 0

    for (let i = 0; i < muscles.length; i++) {
      const muscle = muscles[i]
      if (!muscle) { continue }
      const weight = ROLE_WEIGHTS[i] ?? 0
      const contribution = item.volume * weight
      if (!(contribution > 0)) { continue }

      const regions = resolveMuscleIds(muscle)
      if (regions.length === 0) { continue }

      for (const region of regions) {
        volumeByRegion.set(region, (volumeByRegion.get(region) ?? 0) + contribution)
        setsByRegion.set(region, (setsByRegion.get(region) ?? 0) + 1)
        repsByRegion.set(region, (repsByRegion.get(region) ?? 0) + reps)
        if (item.date) {
          let days = daysByRegion.get(region)
          if (!days) { days = new Set(); daysByRegion.set(region, days) }
          days.add(item.date)
        }
        if (!label) { continue }
        let perExercise = byRegionExercise.get(region)
        if (!perExercise) {
          perExercise = new Map()
          byRegionExercise.set(region, perExercise)
        }
        perExercise.set(label, (perExercise.get(label) ?? 0) + contribution)
      }
    }
  }

  const byRegion: Record<string, RegionContribution> = {}
  let maxVolume = 0
  for (const [region, volume] of volumeByRegion) {
    const rounded = Math.round(volume * 10) / 10
    if (rounded > maxVolume) { maxVolume = rounded }
    const perExercise = byRegionExercise.get(region)
    const exercises = perExercise
      ? [...perExercise.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_EXERCISES_PER_REGION)
          .map(([name]) => name)
      : []
    byRegion[region] = {
      volume: rounded,
      sets: setsByRegion.get(region) ?? 0,
      reps: repsByRegion.get(region) ?? 0,
      days: [...(daysByRegion.get(region) ?? [])].sort(),
      exercises,
    }
  }

  return { byRegion, maxVolume }
}

/**
 * Activación relativa 0–100 de una región frente a la más trabajada.
 *
 * Es una escala RELATIVA del propio período, no un porcentaje de fibra
 * reclutada. El atlas la usa sólo para modular la opacidad del relleno.
 */
export function relativeActivation(volume: number, maxVolume: number): number {
  if (!(maxVolume > 0) || !(volume > 0)) { return 0 }
  return Math.max(0, Math.min(100, Math.round((volume / maxVolume) * 100)))
}
