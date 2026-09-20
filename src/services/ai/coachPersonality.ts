// COACH PERSONALITY — Tono + estilo de entrenamiento del Coach
// La personalidad ahora se deriva del método de entrenamiento seleccionado
import type { GoalLogic } from './goalEngine'
import type { TrainingMethodId } from './trainingMethods'

export type CoachTone = 'PADELERO' | 'ABUELITOS' | 'ARNOLD' | 'PSYCHO'

export interface PersonalityConfig {
  tone: CoachTone
  progressionModifier: number
  riskToleranceModifier: number
  restModifier: number
  motivationalMessages: boolean
  directnessLevel: number
  interventionThreshold: number
}

// ─── Estilos de coaching por método de entrenamiento ───
export interface MethodCoachingStyle {
  methodId: TrainingMethodId
  nameEs: string
  icon: string
  directness: number      // 0-1: qué tan directo es
  technicalFocus: number  // 0-1: énfasis en técnica
  motivationStyle: string // tipo de motivación
  riskLevel: number       // 0-1: tolerancia al riesgo
  progressionSpeed: number // multiplicador de progresión
  restModifier: number    // modificador de descanso
  tone: CoachTone         // tono base que representa
}

export const METHOD_COACHING_STYLES: Record<TrainingMethodId, MethodCoachingStyle> = {
  strength: {
    methodId: 'strength',
    nameEs: 'Fuerza Máxima',
    icon: '🏋️',
    directness: 0.8,
    technicalFocus: 0.9,
    motivationStyle: 'Directo y técnico. Habla de cargas, porcentajes de 1RM, progresión lineal. Frases cortas y firmes.',
    riskLevel: 0.6,
    progressionSpeed: 1.1,
    restModifier: 1.2,
    tone: 'ARNOLD',
  },
  hypertrophy: {
    methodId: 'hypertrophy',
    nameEs: 'Hipertrofia',
    icon: '💪',
    directness: 0.6,
    technicalFocus: 0.7,
    motivationStyle: 'Equilibrado y orientado a resultados visibles. Habla de volumen, series, pump, progressive overload.',
    riskLevel: 0.5,
    progressionSpeed: 1.0,
    restModifier: 1.0,
    tone: 'ABUELITOS',
  },
  strength_endurance: {
    methodId: 'strength_endurance',
    nameEs: 'Resistencia de Fuerza',
    icon: '🔥',
    directness: 0.5,
    technicalFocus: 0.6,
    motivationStyle: 'Animador y de ritmo. Habla de mantener ritmo, manage fatigue, finish strong.',
    riskLevel: 0.4,
    progressionSpeed: 0.9,
    restModifier: 0.8,
    tone: 'PADELERO',
  },
  power: {
    methodId: 'power',
    nameEs: 'Potencia',
    icon: '⚡',
    directness: 0.7,
    technicalFocus: 0.85,
    motivationStyle: 'Directo y explosivo. Habla de velocidad, tensión máxima, activación neural, velocidad de ejecución.',
    riskLevel: 0.7,
    progressionSpeed: 1.15,
    restModifier: 1.3,
    tone: 'ARNOLD',
  },
  cardio_endurance: {
    methodId: 'cardio_endurance',
    nameEs: 'Resistencia Cardiovascular',
    icon: '🏃',
    directness: 0.4,
    technicalFocus: 0.5,
    motivationStyle: 'Motivador y de constancia. Habla de zona cardíaca, base aeróbica, constancia, recovery.',
    riskLevel: 0.3,
    progressionSpeed: 0.85,
    restModifier: 0.7,
    tone: 'PADELERO',
  },
  hiit: {
    methodId: 'hiit',
    nameEs: 'HIIT',
    icon: '⏱️',
    directness: 0.75,
    technicalFocus: 0.6,
    motivationStyle: 'Directo y de intensidad. Habla de intervals, work/rest ratios, HR máximo, pushing limits.',
    riskLevel: 0.6,
    progressionSpeed: 1.05,
    restModifier: 0.8,
    tone: 'PSYCHO',
  },
  functional: {
    methodId: 'functional',
    nameEs: 'Funcional',
    icon: '🤸',
    directness: 0.5,
    technicalFocus: 0.8,
    motivationStyle: 'Enfocado en movimiento y control. Habla de patrones de movimiento, core, estabilidad, transferencia al día a día.',
    riskLevel: 0.3,
    progressionSpeed: 0.9,
    restModifier: 0.9,
    tone: 'ABUELITOS',
  },
  mobility: {
    methodId: 'mobility',
    nameEs: 'Movilidad',
    icon: '🧘',
    directness: 0.3,
    technicalFocus: 0.9,
    motivationStyle: 'Suave y técnico. Habla de rangos de movimiento, control articular, respiración, consciencia corporal.',
    riskLevel: 0.2,
    progressionSpeed: 0.8,
    restModifier: 1.0,
    tone: 'PADELERO',
  },
  balance_stability: {
    methodId: 'balance_stability',
    nameEs: 'Equilibrio y Estabilidad',
    icon: '🎯',
    directness: 0.4,
    technicalFocus: 0.85,
    motivationStyle: 'Preciso y de control. Habla de propriocepción, core, estabilidad, control motor.',
    riskLevel: 0.2,
    progressionSpeed: 0.85,
    restModifier: 1.0,
    tone: 'ABUELITOS',
  },
  speed: {
    methodId: 'speed',
    nameEs: 'Velocidad',
    icon: '💨',
    directness: 0.7,
    technicalFocus: 0.8,
    motivationStyle: 'Directo y de reacción. Habla de tiempo de reacción, aceleración, mecánica de sprint.',
    riskLevel: 0.6,
    progressionSpeed: 1.1,
    restModifier: 1.2,
    tone: 'ARNOLD',
  },
  full_body: {
    methodId: 'full_body',
    nameEs: 'Cuerpo Completo',
    icon: '🏋️',
    directness: 0.5,
    technicalFocus: 0.6,
    motivationStyle: 'Equilibrado y de eficiencia. Habla de compuestos, full body, frecuencia, efficiency.',
    riskLevel: 0.4,
    progressionSpeed: 1.0,
    restModifier: 1.0,
    tone: 'ABUELITOS',
  },
  torso_legs: {
    methodId: 'torso_legs',
    nameEs: 'Torso / Piernas',
    icon: '🦵',
    directness: 0.5,
    technicalFocus: 0.7,
    motivationStyle: 'Estructurado y de balance. Habla de upper/lower split, balance muscular, frecuencia por grupo.',
    riskLevel: 0.4,
    progressionSpeed: 1.0,
    restModifier: 1.0,
    tone: 'ABUELITOS',
  },
  weider_split: {
    methodId: 'weider_split',
    nameEs: 'División Weider',
    icon: '📋',
    directness: 0.6,
    technicalFocus: 0.7,
    motivationStyle: 'Detallista y de volumen. Habla de groups per day, pump, series de acabado, fatiga localizada.',
    riskLevel: 0.5,
    progressionSpeed: 1.0,
    restModifier: 0.9,
    tone: 'ARNOLD',
  },
}

// ─── Configuraciones de personalidad legacy (compatibilidad) ───
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

/** Obtener estilo de coaching desde un método de entrenamiento */
export function getMethodCoachingStyle(methodId: TrainingMethodId): MethodCoachingStyle {
  return METHOD_COACHING_STYLES[methodId] || METHOD_COACHING_STYLES.hypertrophy
}

/** Obtener configuración de personalidad desde un método de entrenamiento */
export function getPersonalityFromMethod(methodId: TrainingMethodId): PersonalityConfig {
  const style = METHOD_COACHING_STYLES[methodId]
  if (!style) {return PERSONALITY_CONFIGS.ABUELITOS}

  return {
    tone: style.tone,
    progressionModifier: style.progressionSpeed,
    riskToleranceModifier: style.riskLevel,
    restModifier: style.restModifier,
    motivationalMessages: style.directness < 0.5,
    directnessLevel: style.directness,
    interventionThreshold: 0.5,
  }
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

/** Aplicar estilo de coaching de método a la lógica de objetivo */
export function applyMethodCoaching(goalLogic: GoalLogic, methodId: TrainingMethodId): GoalLogic {
  const style = METHOD_COACHING_STYLES[methodId]
  if (!style) {return goalLogic}

  return {
    ...goalLogic,
    progressionRate: goalLogic.progressionRate === 'conservative' ? 'conservative' :
      goalLogic.progressionRate === 'moderate' ? (style.progressionSpeed > 1 ? 'aggressive' : 'moderate') : 'aggressive',
    toleranceForRisk: Math.min(1, goalLogic.toleranceForRisk * style.riskLevel),
    restBetweenSets: style.restModifier < 0.9 ? 'short' : style.restModifier > 1.1 ? 'long' : goalLogic.restBetweenSets,
  }
}
