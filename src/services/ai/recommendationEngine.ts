// RECOMMENDATION ENGINE — Genera respuesta final con explicación y evidencia
import type { TrainingGoal, ExperienceLevel } from '@/types'
import type { GoalLogic } from './goalEngine'
import type { ProgressResult } from './progressAnalyzer'
import type { RecoveryContext } from './recoveryAnalyzer'
import type { NutritionContext } from './nutritionEngine'

export interface Recommendation {
  type: 'training' | 'nutrition' | 'recovery'
  action: string
  what: string
  why: string
  factors: string[]
  confidence: number
  explanation: string
  evidenceUsed: string[]
}

/** Construir recomendación de entrenamiento */
export function buildTrainingRecommendation(params: {
  goalLogic: GoalLogic
  progress: ProgressResult
  recovery: RecoveryContext
  nutrition: NutritionContext
  exercise?: string
  personality?: string
}): Recommendation {
  const { goalLogic, progress, recovery, nutrition, exercise } = params
  const factors: string[] = []
  let action = 'maintain'
  let what = ''
  let confidence = 0.5

  // Evaluar progreso
  if (progress.trend === 'improving') {
    factors.push('progreso positivo')
    confidence += 0.1
  } else if (progress.trend === 'plateau') {
    factors.push('posible plateau')
    confidence -= 0.05
  } else if (progress.trend === 'declining') {
    factors.push('progreso en descenso')
    confidence -= 0.1
  }

  // Evaluar recuperación
  if (recovery.lastScore != null) {
    if (recovery.lastScore >= 70) {
      factors.push('buena recuperación')
      confidence += 0.1
    } else if (recovery.lastScore < 50) {
      factors.push('recuperación baja')
      confidence -= 0.15
    }
  }

  // Evaluar coherencia nutrición-entrenamiento
  if (nutrition.gap) {
    factors.push(`alerta nutricional: ${nutrition.gap}`)
    confidence -= 0.1
  }

  // Decisión basada en lógica de objetivo
  if (progress.trend === 'plateau' && recovery.lastScore != null && recovery.lastScore >= 60) {
    action = 'modify'
    what = 'Considerar variación de estímulo'
    factors.push('plateau detectado con recuperación adecuada')
  } else if (recovery.lastScore != null && recovery.lastScore < 50) {
    action = 'deload'
    what = 'Reducir volumen o intensidad'
    factors.push('recuperación insuficiente')
  } else if (progress.trend === 'improving') {
    action = 'progress'
    what = 'Mantener o aumentar carga'
    factors.push('progreso favorable')
  } else {
    what = 'Mantener plan actual'
    factors.push('sin cambios significativos detectados')
  }

  return {
    type: 'training',
    action,
    what,
    why: `Basado en: ${factors.join(', ')}`,
    factors,
    confidence: Math.max(0.3, Math.min(0.95, confidence)),
    explanation: `Tu progreso está ${progress.trend === 'improving' ? 'positivo' : progress.trend === 'plateau' ? 'estancado' : 'en descenso'}. La recuperación ${recovery.lastScore != null && recovery.lastScore >= 60 ? 'es adecuada' : 'requiere atención'}. ${nutrition.gap || 'Nutrición dentro de rangos esperados.'}`,
    evidenceUsed: factors,
  }
}
