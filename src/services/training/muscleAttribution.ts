import { db } from '@/services/storage/db'
import { listCustomExercises } from './customExercises'

// Atribución muscular real por ejercicio (FASE 5): primario + secundarios
// desde datos de biblioteca (personalizados, seed español) o null cuando
// no hay información (nunca se inventa un porcentaje).
export interface MuscleAttribution { primary: string; secondary: string[] }
export interface MuscleResolver {
  muscleOf: (exerciseId: string) => MuscleAttribution | null
  partOf: (exerciseId: string) => string | null
}

export async function buildMuscleResolver(basePartMap: Record<string, string>): Promise<MuscleResolver> {
  const [seeds, customs] = await Promise.all([
    db.exercises.toArray().catch(() => []),
    listCustomExercises().catch(() => []),
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
      return null
    },
    partOf: (id: string) => basePartMap[id] || null,
  }
}
