// SUBSTITUTION ENGINE — Sustitución inteligente multi-factor
// No solo "mismo músculo": analiza patrón, equipamiento, nivel, restricción, motivo
import type { UserProfile } from '@/types'
import * as Gym from '@/services/exerciseGym'
import { enrichExercise, type ExerciseKnowledgeEntry } from './exerciseKnowledge'

export type SubstitutionReason =
  | 'user_request'
  | 'pain'
  | 'equipment'
  | 'fatigue'
  | 'dislike'
  | 'limitation'
  | 'progression'
  | 'regression'

export interface SubstitutionResult {
  original: ExerciseKnowledgeEntry
  alternatives: Array<{
    exercise: ExerciseKnowledgeEntry
    score: number
    reason: string
    type: 'equivalent' | 'partial' | 'variant' | 'regression' | 'progression'
  }>
}

/** Evaluar compatibilidad entre dos ejercicios */
function compatibilityScore(original: ExerciseKnowledgeEntry, candidate: ExerciseKnowledgeEntry): number {
  let score = 0
  // Mismo patrón de movimiento (30 pts)
  if (original.movementPattern && candidate.movementPattern) {
    if (original.movementPattern === candidate.movementPattern) score += 30
    else score += 5 // patrones relacionados
  }
  // Mismo grupo muscular (25 pts)
  if (original.muscle === candidate.muscle) score += 25
  else if (original.secondaryMuscles?.includes(candidate.muscle)) score += 15
  // Mismo equipamiento (15 pts)
  if (original.equipment === candidate.equipment) score += 15
  // Misma parte corporal (15 pts)
  if (original.bodyPart === candidate.bodyPart) score += 15
  // Misma categoría (10 pts)
  if (original.category === candidate.category) score += 10
  // Misma dificultad (5 pts)
  if (original.difficulty === candidate.difficulty) score += 5
  return Math.min(100, score)
}

/** Encontrar alternativas dado un ejercicio original y contexto */
export async function findAlternatives(
  originalId: string,
  allExercises: Gym.Exercise[],
  reason: SubstitutionReason,
  userProfile?: Partial<UserProfile>,
): Promise<SubstitutionResult> {
  const originalEx = allExercises.find(e => e.id === originalId)
  if (!originalEx) return { original: enrichExercise(allExercises[0] || {} as Gym.Exercise), alternatives: [] }
  const original = enrichExercise(originalEx)

  // Filtrar candidatos
  const candidates = allExercises.filter(e => {
    if (e.id === originalId) return false
    // Excluir ejercicios del usuario
    if (userProfile?.excludedExercises?.includes(e.id)) return false
    // Excluir ejercicios con dolor
    if (userProfile?.preferences?.painExercises?.includes(e.id)) return false
    return true
  })

  // Evaluar y rankear
  const alternatives = candidates.map(c => {
    const enriched = enrichExercise(c)
    const score = compatibilityScore(original, enriched)
    let type: SubstitutionResult['alternatives'][0]['type'] = 'equivalent'
    if (reason === 'progression') type = 'progression'
    else if (reason === 'regression') type = 'regression'
    else if (score < 50) type = 'partial'

    return {
      exercise: enriched,
      score,
      reason: `Compatibilidad ${score}%. Mismo patrón: ${original.movementPattern === enriched.movementPattern}.`,
      type,
    }
  })

  // Filtrar por threshold mínimo y ordenar
  const ranked = alternatives
    .filter(a => a.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return { original, alternatives: ranked }
}
