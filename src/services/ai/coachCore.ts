// COACH CORE — Orquestador: recibe petición, coordina módulos, devuelve respuesta
import type { UserProfile, TrainingGoal, ExperienceLevel } from '@/types'
import { db } from '@/services/storage/db'
import { resolveGoal, getGoalLabel } from './goalEngine'
import { applyPersonality, type CoachTone } from './coachPersonality'
import { analyzeExercise, analyzeGlobal } from './progressAnalyzer'
import { analyzeRecovery } from './recoveryAnalyzer'
import { analyzeNutrition } from './nutritionEngine'
import { check as safetyCheck } from './safetyLayer'
import { buildTrainingRecommendation, type Recommendation } from './recommendationEngine'
import { buildUserMemory } from './memoryManager'
import { logDecision } from './decisionLogger'
import { buildInsights } from './coachInsights'
import { buildGlobalScore } from './globalScore'

export interface CoachRequest {
  type: 'training' | 'nutrition' | 'recovery' | 'general'
  exerciseId?: string
  exerciseName?: string
  sessionId?: string
}

export interface CoachResponse {
  recommendation: Recommendation
  safety?: { severity: string; message: string; referral?: string }
  memory?: { patterns: string[]; preferences: string[] }
  insights?: { title: string; detail: string; level: string }[]
  score?: number
}

/** Procesar una petición del Coach */
export async function processRequest(request: CoachRequest): Promise<CoachResponse> {
  // 1. Cargar perfil
  const profile = (await db.userProfile.get('me')) as UserProfile | undefined
  const goal: TrainingGoal = (profile?.trainingGoal as TrainingGoal) || 'hypertrophy'
  const level: ExperienceLevel = (profile?.experienceLevel as ExperienceLevel) || 'intermediate'
  const tone = (profile?.coachIntensity || 'ABUELITOS') as CoachTone

  // 2. Safety check primero
  const recovery = await analyzeRecovery()
  const safety = await safetyCheck({
    recovery: recovery.lastCheck ? { pain: recovery.lastCheck.pain, fatigue: recovery.lastCheck.fatigue, energy: recovery.lastCheck.energy } : undefined,
    userProfile: profile,
  })

  if (safety.requiresProfessional && safety.severity === 'critical') {
    return {
      recommendation: {
        type: 'training',
        action: 'stop',
        what: 'Detener y consultar profesional',
        why: safety.message,
        factors: ['seguridad'],
        confidence: 1,
        explanation: safety.message,
        evidenceUsed: ['safety_layer'],
      },
      safety: { severity: safety.severity, message: safety.message, referral: safety.professionalReferral },
    }
  }

  // 3. Goal-driven analysis
  let goalLogic = resolveGoal(goal, level)
  goalLogic = applyPersonality(goalLogic, tone)

  // 4. Progress analysis
  const progress = request.exerciseId
    ? await analyzeExercise(request.exerciseId)
    : await analyzeGlobal()

  // 5. Nutrition analysis
  const nutrition = await analyzeNutrition(profile || {})

  // 6. Build recommendation
  const recommendation = buildTrainingRecommendation({
    goalLogic,
    progress,
    recovery,
    nutrition,
    exercise: request.exerciseName,
    personality: tone,
  })

  // 7. Memory
  const memory = await buildUserMemory()

  // 8. Insights
  const insights = await buildInsights()

  // 9. Score
  const scoreResult = await buildGlobalScore()

  // 10. Log decision
  await logDecision({
    type: 'training',
    context: { goal, level, tone, exerciseId: request.exerciseId },
    decision: {
      what: recommendation.what,
      why: recommendation.why,
      factors: recommendation.factors,
      confidence: recommendation.confidence,
    },
  })

  return {
    recommendation,
    safety: safety.severity !== 'info' ? { severity: safety.severity, message: safety.message, referral: safety.professionalReferral } : undefined,
    memory: {
      patterns: memory.patterns.frequentExercises.slice(0, 3),
      preferences: Object.keys(memory.preferences),
    },
    insights: insights.slice(0, 3).map(i => ({ title: i.title, detail: i.detail, level: i.level })),
    score: scoreResult.score,
  }
}
