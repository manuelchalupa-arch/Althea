// Atribución muscular REAL para el mapa de Progreso.
// Fuentes, en orden de precedencia (una sola fuente de verdad por ejercicio):
//   1. Ejercicios creados por el usuario (secondaryMuscles / muscleBreakdown)
//   2. Seed local `db.exercises` (muscles[] / groupMain)
//   3. Biblioteca activa ExerciseGymGifsDB (id "muscle/slug" + secondaryMuscles)
// Cuando ninguna fuente conoce el ejercicio → null. NUNCA se inventa un
// porcentaje ni un músculo: el volumen sin atribución se contabiliza aparte.
import { db } from '@/services/storage/db'
import { listCustomExercises } from './customExercises'
import { fetchMuscleMap } from '@/services/exerciseGym'

export interface MuscleAttribution { primary: string; secondary: string[] }
export interface MuscleResolver {
  muscleOf: (exerciseId: string) => MuscleAttribution | null
  partOf: (exerciseId: string) => string | null
  sourceOf: (exerciseId: string) => 'custom' | 'seed' | 'library' | null
}

/** Primary deducido del id "muscle/slug" de la biblioteca activa. */
function primaryFromId(exerciseId: string): string | null {
  const slash = exerciseId.indexOf('/')
  if (slash <= 0) { return null }
  const head = exerciseId.slice(0, slash).trim().toLowerCase()
  return head.length ? head : null
}

export async function buildMuscleResolver(basePartMap: Record<string, string>): Promise<MuscleResolver> {
  const [seeds, customs, library] = await Promise.all([
    db.exercises.toArray().catch(() => []),
    listCustomExercises().catch(() => []),
    fetchMuscleMap().catch(() => ({} as Record<string, { primary: string; secondary: string[] }>)),
  ])
  const seedById = new Map(seeds.map(s => [s.id, s]))
  const customById = new Map(customs.map(c => [c.id, c]))
  return {
    muscleOf: (id: string) => {
      const c = customById.get(id)
      if (c?.muscle) { return { primary: c.muscle, secondary: c.secondaryMuscles || [] } }
      const s = seedById.get(id)
      if (s) {
        const muscles = (s.muscles || []).filter(Boolean)
        const primary = muscles[0] || s.groupMain
        if (primary) { return { primary, secondary: muscles.slice(1) } }
      }
      const lib = library[id]
      if (lib?.primary) { return { primary: lib.primary, secondary: lib.secondary || [] } }
      const fromId = primaryFromId(id)
      if (fromId) { return { primary: fromId, secondary: lib?.secondary || [] } }
      return null
    },
    partOf: (id: string) => basePartMap[id] || null,
    sourceOf: (id: string) => {
      if (customById.get(id)?.muscle) { return 'custom' }
      if (seedById.get(id) && ((seedById.get(id)?.muscles || []).length || seedById.get(id)?.groupMain)) { return 'seed' }
      if (library[id]?.primary) { return 'library' }
      if (primaryFromId(id)) { return 'library' }
      return null
    },
  }
}
