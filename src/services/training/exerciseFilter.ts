import type { Exercise } from '@/services/exerciseGym'

// Grupo muscular leg family y otros grupos amplios
export const GROUP_MUSCLES: Record<string, string[]> = {
  piernas: ['quads', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
  pecho: ['pectorals'],
  espalda: ['lats', 'upper-back', 'traps'],
  hombros: ['delts', 'traps'],
  brazos: ['biceps', 'triceps', 'forearms'],
  abdomen: ['abs', 'core'],
}

export function musclesForGroup(group: string): string[] {
  const key = group.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  if (GROUP_MUSCLES[key]) return GROUP_MUSCLES[key]
  // singular/plural fallback via GROUP_MAP
  return [key]
}

export interface ExerciseFilters {
  group?: string // "Piernas", "Espalda", etc
  muscle?: string // músculo específico si quiere preciso
  movement?: string // push/pull/squat/hinge/...
  equipment?: string
  difficulty?: string
  query?: string
}

export function matchesGroup(ex: Exercise, group?: string): boolean {
  if (!group) return true
  const want = group.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // piernas family
  const family = GROUP_MUSCLES[want]
  if (family) {
    return family.includes(ex.muscle) || (ex.secondaryMuscles || []).some(m => family.includes(m)) || ex.bodyPart === 'legs'
  }
  // genérico: compara músculo principal, secundarios, bodyPart, categoría
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return norm(ex.muscle) === want || (ex.secondaryMuscles || []).some(m => norm(m) === want) || norm(ex.bodyPart) === want || norm(ex.category) === want
}

export function matchesMovement(ex: Exercise, movement?: string): boolean {
  if (!movement) return true
  const m = movement.toLowerCase()
  return (ex.movementPattern || '').toLowerCase() === m || (ex.category || '').toLowerCase().includes(m)
}

export function matchesEquipment(ex: Exercise, equipment?: string): boolean {
  if (!equipment || equipment === 'todos' || equipment === '__all__') return true
  return ex.equipment.toLowerCase() === equipment.toLowerCase()
}

export function matchesDifficulty(ex: Exercise, difficulty?: string): boolean {
  if (!difficulty) return true
  return (ex.exerciseDifficulty || '').toLowerCase() === difficulty.toLowerCase()
}

export function matchesQuery(ex: Exercise, query?: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return ex.name.toLowerCase().includes(q) || ex.muscle.toLowerCase().includes(q) || ex.bodyPart.toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q) || ex.category.toLowerCase().includes(q) || (ex.secondaryMuscles || []).some(m => m.toLowerCase().includes(q))
}

// Filtra con AND entre filtros (intersección), usando filter (no find) y preservando todos los que cumplen
export function filterExercises(exercises: Exercise[], filters: ExerciseFilters): Exercise[] {
  return exercises.filter(ex => {
    // grupo o músculo específico
    if (filters.group && !matchesGroup(ex, filters.group)) return false
    if (filters.muscle && ex.muscle !== filters.muscle && !(ex.secondaryMuscles || []).includes(filters.muscle)) return false
    if (!matchesMovement(ex, filters.movement)) return false
    if (!matchesEquipment(ex, filters.equipment)) return false
    if (!matchesDifficulty(ex, filters.difficulty)) return false
    if (!matchesQuery(ex, filters.query)) return false
    return true
  })
}

// Helper para rutina: debe aceptar TODOS los que correspondan al filtro, no solo uno (evitar find)
export function filterByMuscleGroup(exercises: Exercise[], group: string): Exercise[] {
  return filterExercises(exercises, { group })
}
