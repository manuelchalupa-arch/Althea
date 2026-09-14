// GOAL ENGINE — Mapea objetivo del usuario → lógica de recomendación
import type { TrainingGoal, ExperienceLevel } from '@/types'

export interface GoalLogic {
  goal: TrainingGoal
  prioritize: string[]
  avoid: string[]
  nutritionFocus: 'surplus' | 'deficit' | 'maintenance'
  progressionRate: 'aggressive' | 'moderate' | 'conservative'
  toleranceForRisk: number // 0-1
  restBetweenSets: 'short' | 'moderate' | 'long'
  volumePriority: 'low' | 'moderate' | 'high'
  intensityPriority: 'low' | 'moderate' | 'high'
}

const GOAL_CONFIGS: Record<TrainingGoal, GoalLogic> = {
  strength: {
    goal: 'strength',
    prioritize: ['progressive_overload', 'technique', 'multi_joint', 'recovery'],
    avoid: ['excessive_volume', 'premature_intensity', 'isolation_first'],
    nutritionFocus: 'surplus',
    progressionRate: 'aggressive',
    toleranceForRisk: 0.6,
    restBetweenSets: 'long',
    volumePriority: 'low',
    intensityPriority: 'high',
  },
  fat_loss: {
    goal: 'fat_loss',
    prioritize: ['adherence', 'caloric_deficit', 'strength_training', 'protein_intake'],
    avoid: ['extreme_diets', 'excessive_cardio', 'rapid_weight_loss'],
    nutritionFocus: 'deficit',
    progressionRate: 'conservative',
    toleranceForRisk: 0.3,
    restBetweenSets: 'moderate',
    volumePriority: 'moderate',
    intensityPriority: 'moderate',
  },
  hypertrophy: {
    goal: 'hypertrophy',
    prioritize: ['volume', 'proximity_to_failure', 'rom', 'progressive_overload', 'recovery'],
    avoid: ['excessive_strength_focus', 'skipping_legs', 'poor_rom'],
    nutritionFocus: 'surplus',
    progressionRate: 'moderate',
    toleranceForRisk: 0.5,
    restBetweenSets: 'moderate',
    volumePriority: 'high',
    intensityPriority: 'moderate',
  },
  mobility: {
    goal: 'mobility',
    prioritize: ['rom', 'movement_quality', 'control', 'progressions', 'consistency'],
    avoid: ['premature_load', 'hypertrophy_program', 'high_intensity'],
    nutritionFocus: 'maintenance',
    progressionRate: 'conservative',
    toleranceForRisk: 0.2,
    restBetweenSets: 'short',
    volumePriority: 'low',
    intensityPriority: 'low',
  },
  general_health: {
    goal: 'general_health',
    prioritize: ['balance', 'adherence', 'sustainability', 'variety', 'habit_formation'],
    avoid: ['extremes', 'overtraining', 'complexity'],
    nutritionFocus: 'maintenance',
    progressionRate: 'moderate',
    toleranceForRisk: 0.4,
    restBetweenSets: 'moderate',
    volumePriority: 'moderate',
    intensityPriority: 'moderate',
  },
}

export function resolveGoal(goal: TrainingGoal, level?: ExperienceLevel): GoalLogic {
  const base = { ...GOAL_CONFIGS[goal] }

  // Ajustar por nivel de experiencia
  if (level === 'beginner') {
    base.progressionRate = 'conservative'
    base.toleranceForRisk *= 0.7
    base.prioritize = ['technique', 'consistency', 'habit_formation', ...base.prioritize]
  } else if (level === 'advanced') {
    base.progressionRate = base.progressionRate === 'conservative' ? 'moderate' : 'aggressive'
    base.toleranceForRisk = Math.min(1, base.toleranceForRisk * 1.2)
  }

  return base
}

export function getGoalLabel(goal: TrainingGoal): string {
  const labels: Record<TrainingGoal, string> = {
    strength: 'Fuerza',
    fat_loss: 'Pérdida de grasa',
    hypertrophy: 'Hipertrofia',
    mobility: 'Movilidad',
    general_health: 'Salud general',
  }
  return labels[goal]
}
