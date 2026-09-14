// EXERCISE KNOWLEDGE — DB enriquecida de ejercicios
// Combina ExerciseGymGifsDB + campos extendidos del Coach IA v2
import * as Gym from '@/services/exerciseGym'
import { db } from '@/services/storage/db'

export interface ExerciseKnowledgeEntry {
  id: string
  name: string
  muscle: string
  secondaryMuscles: string[]
  bodyPart: string
  equipment: string
  category: string
  movementPattern?: string
  jointActions?: string[]
  planesOfMotion?: string[]
  stabilityRequirement?: string
  technicalDemand?: string
  difficulty?: string
  objective?: string
  regressions?: string[]
  progressions?: string[]
  commonErrors?: string[]
  biomechanicalNotes?: string
  contraindications?: string[]
}

// Mapa de inferencia: category/muscle → movementPattern (cuando la API no lo provee)
const INFERRED_PATTERN: Record<string, string> = {
  'strength': 'isolation',
  'stretching': 'isolation',
  'cardio': 'carry',
  'plyometrics': 'power',
}

function inferMovementPattern(ex: Gym.Exercise): string {
  const name = (ex.name || '').toLowerCase()
  const muscle = (ex.muscle || '').toLowerCase()
  const cat = (ex.category || '').toLowerCase()
  // Inferencia por nombre
  if (name.includes('press') || name.includes('push') || name.includes('extens')) return 'push'
  if (name.includes('curl') || name.includes('row') || name.includes('pull') || name.includes('remo')) return 'pull'
  if (name.includes('squat') || name.includes('sentadilla') || name.includes('leg press')) return 'squat'
  if (name.includes('deadlift') || name.includes('peso muerto') || name.includes('hip') || name.includes('rdl')) return 'hinge'
  if (name.includes('carry') || name.includes('farmer')) return 'carry'
  // Inferencia por músculo
  if (muscle === 'chest' || muscle === 'shoulders' || muscle === 'triceps') return 'push'
  if (muscle === 'back' || muscle === 'biceps') return 'pull'
  if (muscle === 'quadriceps' || muscle === 'glutes') return 'squat'
  if (muscle === 'hamstrings') return 'hinge'
  return INFERRED_PATTERN[cat] || 'isolation'
}

function inferDifficulty(ex: Gym.Exercise): string {
  const equip = (ex.equipment || '').toLowerCase()
  if (equip === 'bodyweight') return 'beginner'
  if (equip === 'dumbbell' || equip === 'band') return 'intermediate'
  return 'intermediate'
}

/** Enriquecer un ejercicio de la API con campos inferidos */
export function enrichExercise(ex: Gym.Exercise): ExerciseKnowledgeEntry {
  return {
    id: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    secondaryMuscles: ex.secondaryMuscles || [],
    bodyPart: ex.bodyPart,
    equipment: ex.equipment,
    category: ex.category,
    movementPattern: (ex as any).movementPattern || inferMovementPattern(ex),
    difficulty: (ex as any).exerciseDifficulty || inferDifficulty(ex),
    objective: (ex as any).exerciseObjective || (ex.category === 'strength' ? 'hypertrophy' : 'endurance'),
  }
}

/** Enriquecer todos los ejercicios cargados */
export function enrichAll(exercises: Gym.Exercise[]): ExerciseKnowledgeEntry[] {
  return exercises.map(enrichExercise)
}

/** Guardar conocimiento enriquecido en Dexie */
export async function saveExerciseKnowledge(entries: ExerciseKnowledgeEntry[]): Promise<void> {
  for (const e of entries) {
    await db.table('exerciseKnowledge').put(e as never)
  }
}

/** Cargar conocimiento enriquecido desde Dexie */
export async function loadExerciseKnowledge(): Promise<ExerciseKnowledgeEntry[]> {
  return db.table('exerciseKnowledge').toArray().catch(() => []) as Promise<ExerciseKnowledgeEntry[]>
}
