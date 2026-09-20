// VARIANT SERVICE — Wrapper around substitutionEngine for training context
// Proporciona variantes inteligentes considerando dolor, restricciones, equipamiento, historial
import { findAlternatives, type SubstitutionReason, type SubstitutionResult } from './substitutionEngine'
import type { UserProfile } from '@/types'
import * as Gym from '@/services/exerciseGym'
import { db } from '@/services/storage/db'

export interface VariantOption {
  exerciseId: string
  name: string
  score: number
  reason: string
  type: 'equivalent' | 'partial' | 'variant' | 'regression' | 'progression'
  muscle: string
  equipment: string
  pattern?: string
  gifUrl?: string
}

export interface VariantContext {
  originalExerciseId: string
  reason: SubstitutionReason
  painZone?: string
  painLevel?: 'mild' | 'moderate' | 'severe'
}

/** Obtener variantes inteligentes para un ejercicio en contexto de entrenamiento */
export async function getVariantsForExercise(
  context: VariantContext,
  userProfile: UserProfile | null
): Promise<VariantOption[]> {
  // Obtener todos los ejercicios de la biblioteca
  const allExercises = (await Gym.fetchAll()).exercises
  
  // Determinar razón de sustitución
  let reason: 'pain' | 'equipment' | 'limitation' | 'dislike' | 'progression' | 'regression' = 'pain'
  if (context.reason === 'equipment') reason = 'equipment'
  else if (context.reason === 'limitation') reason = 'limitation'
  else if (context.reason === 'user_request') reason = 'dislike'
  else if (context.reason === 'progression') reason = 'progression'
  else if (context.reason === 'regression') reason = 'regression'
  
  // Obtener resultado del motor de sustitución
  const result: SubstitutionResult = await findAlternatives(
    context.originalExerciseId,
    allExercises,
    reason,
    userProfile ? {
      excludedExercises: userProfile.excludedExercises,
      preferences: userProfile.preferences,
      limitations: userProfile.limitations,
      painAreas: userProfile.painAreas,
      equipment: userProfile.equipment,
      level: userProfile.level,
    } : undefined
  )
  
  // Mapear a VariantOption con info adicional para UI
  return result.alternatives.map(alt => ({
    exerciseId: alt.exercise.id,
    name: alt.exercise.name,
    score: alt.score,
    reason: alt.reason,
    type: alt.type,
    muscle: alt.exercise.muscle,
    equipment: alt.exercise.equipment,
    pattern: alt.exercise.movementPattern ?? '',
    gifUrl: alt.exercise.gifUrl,
  }))
}

/** Registrar decisión de variante (aceptada/modificada/rechazada) */
export async function recordVariantDecision(
  sessionId: string,
  originalExerciseId: string,
  chosenExerciseId: string | null,
  decision: 'accepted' | 'rejected' | 'modified',
  reason?: string
): Promise<void> {
  const { v4: uuid } = await import('uuid')
  const now = new Date().toISOString()
  
  const obsType = decision === 'accepted' ? 'VARIANT_ACCEPTED' : decision === 'modified' ? 'VARIANT_MODIFIED' : 'VARIANT_REJECTED'
  
  // Evitar duplicados: buscar observación existente con misma sesión, ejercicio y decisión
  const existing = await db.exerciseObservations
    .where('sessionId').equals(sessionId)
    .and(o => o.sessionExerciseId === originalExerciseId && o.type === obsType)
    .first()
  if (existing) {
    return
  }

  // Registrar en exerciseObservations o exerciseReplacements según el modelo
  try {
    await db.exerciseObservations.put({
      observationId: uuid(),
      sessionId,
      sessionExerciseId: originalExerciseId,
      type: obsType,
      text: reason || `Variante ${decision}: ${chosenExerciseId || 'ninguna'}`,
      createdAt: now,
      updatedAt: now,
    })
  } catch (e) {
    console.warn('Failed to record variant decision:', e)
  }
}

/** Obtener sugerencias de variante basadas en dolor registrado */
export async function getVariantsForPain(
  exerciseId: string,
  painZone: string,
  painLevel: 'mild' | 'moderate' | 'severe',
  userProfile: UserProfile | null
): Promise<VariantOption[]> {
  if (painLevel === 'severe') {
    // Para dolor severo, solo regresiones (menos demandantes)
    const result = await findAlternatives(
      exerciseId,
      (await Gym.fetchAll()).exercises,
      'regression',
      userProfile ? {
        excludedExercises: userProfile.excludedExercises,
        preferences: userProfile.preferences,
        limitations: userProfile.limitations,
        painAreas: userProfile.painAreas,
        equipment: userProfile.equipment,
        level: userProfile.level,
      } : undefined
    )
    
    return result.alternatives
      .filter(a => a.type === 'regression' || a.type === 'partial')
      .map(alt => ({
        exerciseId: alt.exercise.id,
        name: alt.exercise.name,
        score: alt.score,
        reason: `Regresión por dolor severo en ${painZone}: ${alt.reason}`,
        type: alt.type,
        muscle: alt.exercise.muscle,
        equipment: alt.exercise.equipment,
pattern: alt.exercise.movementPattern ?? '',
        gifUrl: alt.exercise.gifUrl,
      }))
  }
  
  // Dolor leve/moderado: equivalentes y variantes
const result = await findAlternatives(
      exerciseId,
      (await Gym.fetchAll()).exercises,
      'pain',
    userProfile ? {
      excludedExercises: userProfile.excludedExercises,
      preferences: userProfile.preferences,
      limitations: userProfile.limitations,
      painAreas: userProfile.painAreas,
      equipment: userProfile.equipment,
      level: userProfile.level,
    } : undefined
  )
  
  return result.alternatives.map(alt => ({
    exerciseId: alt.exercise.id,
    name: alt.exercise.name,
    score: alt.score,
    reason: `Alternativa por dolor en ${painZone}: ${alt.reason}`,
    type: alt.type,
    muscle: alt.exercise.muscle,
    equipment: alt.exercise.equipment,
    pattern: alt.exercise.movementPattern ?? '',
    gifUrl: alt.exercise.gifUrl,
  }))
}

/** Verificar si un ejercicio es compatible con restricciones del usuario */
export function isExerciseCompatible(
  exercise: { id: string; equipment: string; muscle: string; pattern: string; level: string },
  userProfile: UserProfile | null
): { compatible: boolean; reasons: string[] } {
  if (!userProfile) return { compatible: true, reasons: [] }
  
  const reasons: string[] = []
  
  // Excluidos
  if (userProfile.excludedExercises?.includes(exercise.id)) {
    reasons.push('Ejercicio excluido por el usuario')
  }
  
  // Equipamiento no disponible
  const hasEquipment = userProfile.equipment?.some(eq => 
    eq.toLowerCase().includes(exercise.equipment.toLowerCase()) ||
    exercise.equipment.toLowerCase().includes(eq.toLowerCase())
  )
  if (!hasEquipment && exercise.equipment !== 'peso_corporal') {
    reasons.push(`Equipamiento no disponible: ${exercise.equipment}`)
  }
  
  // Limitaciones
  if (userProfile.limitations?.some(l => l.toLowerCase().includes(exercise.muscle.toLowerCase()))) {
    reasons.push(`Limitación en ${exercise.muscle}`)
  }
  
  // Dolor
  if (userProfile.painAreas?.some(p => p.toLowerCase().includes(exercise.muscle.toLowerCase()))) {
    reasons.push(`Dolor en ${exercise.muscle}`)
  }
  
  // Nivel
  const levelOrder = { principiante: 0, intermedio: 1, avanzado: 2 }
  const userLevel = levelOrder[userProfile.level as keyof typeof levelOrder] ?? 0
  const exLevel = levelOrder[exercise.level as keyof typeof levelOrder] ?? 0
  if (exLevel > userLevel + 1) {
    reasons.push(`Nivel demasiado avanzado (${exercise.level})`)
  }
  
  return {
    compatible: reasons.length === 0,
    reasons,
  }
}