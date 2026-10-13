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
 * entrenamiento, no mediciones fisiológicas exactas.
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
  /** Ejercicios que aportaron a la región, ordenados por volumen desc. */
  exercises: string[]
}

export interface ContributionItem {
  date: string
  exerciseId: string
  volume: number
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
  /** Región -> ejercicio -> volumen que ese ejercicio le aportó. */
  const byRegionExercise = new Map<string, Map<string, number>>()

  for (const item of items) {
    if (!(item.volume > 0)) { continue }
    const attribution = muscleOf(item.exerciseId)
    if (!attribution) { continue }

    const label = nameOf(item.exerciseId)
    const muscles = [attribution.primary, attribution.secondary?.[0], attribution.secondary?.[1]]

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
    byRegion[region] = { volume: rounded, exercises }
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
