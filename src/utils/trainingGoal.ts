// Objetivo de entrenamiento — normalización a vocabulario canónico (TrainingGoal, inglés).
// Fuente de verdad: UserProfile.trainingGoal. goal/goalPrimary quedan como legacy read-only.
// Mapeo determinista para datos antiguos (documentado, sin inventar valores).

export type TrainingGoalInput = {
  trainingGoal?: unknown
  goal?: unknown
  goalPrimary?: unknown
}

const VALID_TRAINING_GOALS = ['strength', 'fat_loss', 'hypertrophy', 'mobility', 'general_health'] as const

export function isValidTrainingGoal(value: unknown): value is string {
  return typeof value === 'string' && (VALID_TRAINING_GOALS as readonly string[]).includes(value)
}

// Mapeo exacto Goal (español legacy) → TrainingGoal (canónico inglés).
// 'resistencia', 'recomposicion', 'mantenimiento' y 'personalizado' no tienen equivalente exacto:
// se resuelven a general_health (default conservador, sin inventar semántica).
export const GOAL_TO_TRAINING_GOAL: Record<string, string> = {
  fuerza: 'strength',
  hipertrofia: 'hypertrophy',
  perdida_peso: 'fat_loss',
  movilidad: 'mobility',
  resistencia: 'general_health',
  recomposicion: 'general_health',
  mantenimiento: 'general_health',
  personalizado: 'general_health',
}

// Mapeo por keywords de goalPrimary (texto libre del onboarding en español).
// Orden importa: se evalúa déficit antes que hipertrofia/fuerza (misma lógica que nutrition.ts).
const GOAL_PRIMARY_RULES: { keywords: string[]; outcome: string }[] = [
  { keywords: ['fat_loss', 'grasa', 'perder', 'bajar'], outcome: 'fat_loss' },
  { keywords: ['hypertrophy', 'hipertrofia', 'masa', 'ganar'], outcome: 'hypertrophy' },
  { keywords: ['strength', 'fuerza', 'force'], outcome: 'strength' },
  { keywords: ['mobility', 'movilidad'], outcome: 'mobility' },
]

/**
 * Resolver el objetivo de entrenamiento canónico a partir de un perfil.
 * Prioridad: 1) trainingGoal válido → 2) goal legacy (mapa exacto) → 3) goalPrimary (keywords).
 * Returns undefined solo si no hay valor resoluble; los callers aplican su default.
 */
export function resolveTrainingGoal(profile?: TrainingGoalInput | null): string | undefined {
  if (!profile) {return undefined}
  if (isValidTrainingGoal(profile.trainingGoal)) {return profile.trainingGoal}
  if (typeof profile.goal === 'string' && GOAL_TO_TRAINING_GOAL[profile.goal]) {
    return GOAL_TO_TRAINING_GOAL[profile.goal]
  }
  if (typeof profile.goalPrimary === 'string') {
    const g = profile.goalPrimary.toLowerCase()
    for (const rule of GOAL_PRIMARY_RULES) {
      if (rule.keywords.some(k => g.includes(k))) {return rule.outcome}
    }
  }
  return undefined
}