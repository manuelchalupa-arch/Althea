// COACH PERSONALITY — 4 tonos que modifican LÓGICA, no solo comunicación
import type { GoalLogic } from './goalEngine'

export type CoachTone = 'PADELERO' | 'ABUELITOS' | 'ARNOLD' | 'PSYCHO'

export interface PersonalityConfig {
  tone: CoachTone
  progressionModifier: number // multiplicador sobre el base
  riskToleranceModifier: number
  restModifier: number // multiplicador de descanso entre series
  motivationalMessages: boolean
  directnessLevel: number // 0-1
  interventionThreshold: number // 0-1: qué tan pronto interviene
}

const PERSONALITY_CONFIGS: Record<CoachTone, PersonalityConfig> = {
  PADELERO: {
    tone: 'PADELERO',
    progressionModifier: 0.85,
    riskToleranceModifier: 0.8,
    restModifier: 1.0,
    motivationalMessages: true,
    directnessLevel: 0.3,
    interventionThreshold: 0.7,
  },
  ABUELITOS: {
    tone: 'ABUELITOS',
    progressionModifier: 1.0,
    riskToleranceModifier: 1.0,
    restModifier: 1.0,
    motivationalMessages: false,
    directnessLevel: 0.5,
    interventionThreshold: 0.5,
  },
  ARNOLD: {
    tone: 'ARNOLD',
    progressionModifier: 1.1,
    riskToleranceModifier: 1.15,
    restModifier: 0.9,
    motivationalMessages: false,
    directnessLevel: 0.7,
    interventionThreshold: 0.4,
  },
  PSYCHO: {
    tone: 'PSYCHO',
    progressionModifier: 1.2,
    riskToleranceModifier: 1.3,
    restModifier: 0.85,
    motivationalMessages: false,
    directnessLevel: 0.9,
    interventionThreshold: 0.3,
  },
}

export function getPersonalityConfig(tone: CoachTone): PersonalityConfig {
  return PERSONALITY_CONFIGS[tone] || PERSONALITY_CONFIGS.ABUELITOS
}

/** Aplicar personalidad a la lógica de objetivo */
export function applyPersonality(goalLogic: GoalLogic, tone: CoachTone): GoalLogic {
  const config = getPersonalityConfig(tone)
  return {
    ...goalLogic,
    progressionRate: goalLogic.progressionRate === 'conservative' ? 'conservative' :
      goalLogic.progressionRate === 'moderate' ? (config.progressionModifier > 1 ? 'aggressive' : 'moderate') : 'aggressive',
    toleranceForRisk: Math.min(1, goalLogic.toleranceForRisk * config.riskToleranceModifier),
    restBetweenSets: config.restModifier < 0.9 ? 'short' : config.restModifier > 1.1 ? 'long' : goalLogic.restBetweenSets,
  }
}
