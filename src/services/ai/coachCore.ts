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
import { selectMethods } from './methodSelector'
import type { MethodRecommendation } from './trainingMethods'
import { selectNutritionMethods } from './nutritionMethodSelector'
import type { NutritionMethodRecommendation } from './nutritionMethods'

export interface CoachRequest {
  type: 'training' | 'nutrition' | 'recovery' | 'general' | 'method_selection'
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
  methodRecommendation?: MethodRecommendation
  nutritionMethodRecommendation?: NutritionMethodRecommendation
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

  // 11. Method selection (siempre, para tener recomendación metodológica)
  let methodRecommendation: MethodRecommendation | undefined
  try {
    const recentFatigue = recovery.lastCheck?.fatigue
    const sessions: any[] = await db.table('trainingSessions').toArray().catch(() => [])
    const recentSessions = sessions.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus)).slice(-5)
    const recentVolume = recentSessions.reduce((a, s) => a + Number(s.totalVolume || 0), 0) / Math.max(1, recentSessions.length)
    methodRecommendation = selectMethods(profile || {}, recentVolume || undefined, recentFatigue)
  } catch { /* noop */ }

  // 12. Nutrition method selection
  let nutritionMethodRecommendation: NutritionMethodRecommendation | undefined
  try {
    const userProfile = await db.userProfile.get('me') as any
    const trainingMethodId = userProfile?.cycle?.methodId || methodRecommendation?.primary
    nutritionMethodRecommendation = selectNutritionMethods(profile || {}, trainingMethodId)
  } catch { /* noop */ }

  return {
    recommendation,
    safety: safety.severity !== 'info' ? { severity: safety.severity, message: safety.message, referral: safety.professionalReferral } : undefined,
    memory: {
      patterns: memory.patterns.frequentExercises.slice(0, 3),
      preferences: Object.keys(memory.preferences),
    },
    insights: insights.slice(0, 3).map(i => ({ title: i.title, detail: i.detail, level: i.level })),
    score: scoreResult.score,
    methodRecommendation,
    nutritionMethodRecommendation,
  }
}
