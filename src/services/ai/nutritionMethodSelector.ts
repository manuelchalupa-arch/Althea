// NUTRITION METHOD SELECTOR — Motor de selección inteligente de estrategias nutricionales
// Analiza al usuario, entrenamiento y contexto para recomendar el método más adecuado
import type {
  NutritionMethodId, NutritionUserProfile, NutritionMethodRecommendation,
  NutritionMethodScore, MixedNutritionMethod,
} from './nutritionMethods'
import { NUTRITION_METHODS, getNutritionMethod } from './nutritionMethodsDB'
import { checkNutritionCompatibility } from './nutritionCompatibilityEngine'
import { createMixedNutritionMethod } from './mixedNutritionBuilder'
import { checkNutritionSafety } from './nutritionSafety'

/** Seleccionar métodos nutricionales para un usuario */
export function selectNutritionMethods(profile: NutritionUserProfile, trainingMethodId?: string | null): NutritionMethodRecommendation {
  const goal = (profile.trainingGoal || 'health') as string
  const level = (profile.experienceLevel || 'beginner') as string
  const weight = profile.weightKg || 70
  const trainingType = resolveTrainingType(profile, trainingMethodId)
  const days = profile.daysPerWeek || 3
  const restrictions = profile.nutritionPrefs?.restrictions || []
  const allergies = profile.nutritionPrefs?.allergies || []
  const disliked = profile.nutritionPrefs?.dislikedFoods || []
  const healthConditions = profile.healthConditions || []
  const adherenceHistory = profile.adherenceHistory || []

  // 1. Puntuar cada método
  const scores = NUTRITION_METHODS.map(m => ({
    method: m,
    score: scoreMethod(m, goal, level, weight, trainingType, days, restrictions, allergies, disliked, healthConditions, adherenceHistory, profile),
  }))

  // 2. Separar por categoría
  const patterns = scores.filter(s => s.method.category === 'pattern')
  const distributions = scores.filter(s => s.method.category === 'distribution')
  const macros = scores.filter(s => s.method.category === 'macronutrient')
  const restrictive = scores.filter(s => s.method.category === 'restrictive')

  // 3. Seleccionar patrón principal
  patterns.sort((a, b) => b.score.score - a.score.score)
  const primary = patterns[0]?.method.id as NutritionMethodId || 'mediterranean'

  // 4. Estrategias secundarias (score > 0.5)
  const secondary = [...distributions, ...macros]
    .filter(s => s.score.score > 0.5)
    .sort((a, b) => b.score.score - a.score.score)
    .map(s => s.method.id as NutritionMethodId)
    .slice(0, 2)

  // 5. Complementarios (patterns 2°, distribuciones que complementan)
  const complementary = patterns
    .filter((s, i) => i > 0 && s.score.score > 0.4)
    .map(s => s.method.id as NutritionMethodId)
    .slice(0, 2)

  // 6. No recomendados (restricciones, health conditions, bajo score)
  const notRecommended = scores
    .filter(s => s.score.score < 0.2 || s.method.safety.requiresSupervision)
    .map(s => s.method.id as NutritionMethodId)

  // 7. Seguridad
  const safetyWarnings = collectSafetyWarnings(profile, primary, secondary, trainingType)

  // 8. Justificación
  const justification = buildJustification(primary, secondary, complementary, goal, level, trainingType, days, profile)

  // 9. Método mixto
  const mixed = shouldCreateMixedNutritionMethod(primary, secondary, complementary, goal, trainingType, profile)
    ? createMixedNutritionMethod(primary, secondary, complementary, goal, trainingType, profile, justification)
    : undefined

  // 10. Confidence
  const confidence = calculateConfidence(profile)

  // 11. Factors
  const factors = buildFactorsList(goal, level, trainingType, days, weight, restrictions, allergies)

  return {
    primary,
    secondary,
    complementary,
    notRecommended: [...new Set(notRecommended)],
    mixed,
    justification,
    confidence,
    factors,
    safetyWarnings,
  }
}

/** Puntuar un método para un usuario específico */
function scoreMethod(
  method: ReturnType<typeof getNutritionMethod> & {},
  goal: string, level: string, weight: number,
  trainingType: string, days: number,
  restrictions: string[], allergies: string[], disliked: string[],
  healthConditions: string[], adherenceHistory: { method: string; days: number; score: number }[],
  profile: NutritionUserProfile,
): NutritionMethodScore {
  let goalFit = 0.5
  let trainingFit = 0.5
  let preferenceFit = 0.5
  let sustainability = 0.5
  let evidence = 0.5
  let safety = 1.0
  let complexity = 0.5

  // Goal fit
  if (method.suitability.goals.includes(goal as any)) {goalFit += 0.3}
  else {goalFit -= 0.2}

  // Training fit
  if (method.suitability.trainingTypes.includes(trainingType as any)) {trainingFit += 0.3}
  else {trainingFit -= 0.2}

  // Training adaptation exists
  if (method.trainingAdaptation[trainingType as keyof typeof method.trainingAdaptation]) {trainingFit += 0.1}

  // Experience level
  const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 }
  const reqLevel = levelOrder[method.requirements.minExperienceLevel] || 0
  const userLevel = levelOrder[level as keyof typeof levelOrder] || 0
  if (userLevel >= reqLevel) {sustainability += 0.15}
  else {sustainability -= 0.3}

  // Adherence history with this method
  const hist = adherenceHistory.find(h => h.method === method.id)
  if (hist && hist.score > 7) {sustainability += 0.2}
  else if (hist && hist.score < 4) {sustainability -= 0.3}

  // Restrictions
  const hasRestriction = restrictions.some(r =>
    method.characteristics.restrictions.some(mr => mr.toLowerCase().includes(r.toLowerCase()))
  )
  if (hasRestriction) {preferenceFit -= 0.4}

  // Allergies
  const hasAllergy = allergies.some(a =>
    method.characteristics.key_foods.some(f => f.toLowerCase().includes(a.toLowerCase()))
  )
  if (hasAllergy) {preferenceFit -= 0.3}

  // Disliked foods
  const hasDisliked = disliked.some(d =>
    method.characteristics.key_foods.some(f => f.toLowerCase().includes(d.toLowerCase()))
  )
  if (hasDisliked) {preferenceFit -= 0.15}

  // Health conditions
  const hasContraindication = healthConditions.some(h =>
    method.requirements.contraindications.some(c => c.toLowerCase().includes(h.toLowerCase()))
  )
  if (hasContraindication) {safety -= 0.5}

  // Safety: contraindications
  if (method.safety.requiresSupervision) {safety -= 0.2}

  // Evidence
  if (method.evidence.level === 'strong') {evidence += 0.3}
  else if (method.evidence.level === 'moderate') {evidence += 0.15}
  else if (method.evidence.level === 'limited') {evidence -= 0.1}
  else if (method.evidence.level === 'insufficient') {evidence -= 0.25}

  // Complexity (restrictive = high complexity)
  if (method.category === 'restrictive') {complexity -= 0.2}
  if (method.characteristics.restrictions.length > 3) {complexity -= 0.15}

  // Calculate total score
  const totalScore = (
    goalFit * 0.25 +
    trainingFit * 0.20 +
    preferenceFit * 0.15 +
    sustainability * 0.15 +
    evidence * 0.10 +
    safety * 0.10 +
    complexity * 0.05
  )

  const reason = `goal=${goalFit.toFixed(2)} training=${trainingFit.toFixed(2)} pref=${preferenceFit.toFixed(2)} sustain=${sustainability.toFixed(2)} evidence=${evidence.toFixed(2)} safety=${safety.toFixed(2)}`

  return {
    methodId: method.id,
    score: Math.max(0, Math.min(1, totalScore)),
    breakdown: { goalFit, trainingFit, preferenceFit, sustainability, evidence, safety, complexity },
    reason,
  }
}

/** Resolver tipo de entrenamiento desde perfil o método de entrenamiento */
function resolveTrainingType(profile: NutritionUserProfile, trainingMethodId?: string | null): string {
  if (profile.trainingType) {return profile.trainingType}
  if (trainingMethodId) {
    const typeMap: Record<string, string> = {
      strength: 'strength', hypertrophy: 'hypertrophy', strength_endurance: 'endurance',
      power: 'strength', cardio_endurance: 'endurance', hiit: 'hiit',
      functional: 'functional', mobility: 'mobility', balance_stability: 'functional',
      speed: 'strength', full_body: 'mixed', torso_legs: 'mixed', weider_split: 'mixed',
    }
    return typeMap[trainingMethodId] || 'general'
  }
  const goal = profile.trainingGoal || 'health'
  const goalTypeMap: Record<string, string> = {
    strength: 'strength', hypertrophy: 'hypertrophy', fat_loss: 'mixed',
    performance: 'mixed', health: 'general', maintenance: 'general', recomposition: 'mixed',
  }
  return goalTypeMap[goal] || 'general'
}

/** Determinar si se debe crear método mixto */
function shouldCreateMixedNutritionMethod(
  primary: NutritionMethodId,
  secondary: NutritionMethodId[],
  complementary: NutritionMethodId[],
  goal: string,
  trainingType: string,
  profile: NutritionUserProfile,
): boolean {
  if (secondary.length > 0) {return true}
  if (trainingType === 'hypertrophy' || trainingType === 'strength') {return true}
  if (goal === 'fat_loss' || goal === 'recomposition') {return true}
  if (profile.nutritionPrefs?.mealFrequency && profile.nutritionPrefs.mealFrequency >= 5) {return true}
  return false
}

/** Recopilar advertencias de seguridad (usa nutritionSafety.ts) */
function collectSafetyWarnings(
  profile: NutritionUserProfile,
  primary: NutritionMethodId,
  secondary: NutritionMethodId[],
  trainingType: string,
): string[] {
  const warnings: string[] = []

  // Usar el módulo completo de seguridad
  const safetyResult = checkNutritionSafety(profile, primary, secondary)

  // Agregar alertas críticas y de warning
  for (const alert of safetyResult.alerts) {
    if (alert.severity === 'critical' || alert.severity === 'warning') {
      warnings.push(alert.message)
    }
  }

  // También marcar métodos bloqueados en notRecommended
  for (const blocked of safetyResult.blockedMethods) {
    warnings.push(`Método bloqueado: ${getNutritionMethod(blocked)?.nameEs || blocked} — requiere supervisión profesional`)
  }

  // Detectar combinación peligrosa: déficit extremo + HIIT frecuente
  if (profile.trainingGoal === 'fat_loss' && (trainingType === 'hiit' || trainingType === 'endurance')) {
    const calorieMod = getNutritionMethod(primary)?.defaults.calorieModifier || 1.0
    if (calorieMod < 0.85) {
      warnings.push('Combinación de déficit energético significativo con entrenamiento de alta demanda — evaluar recuperación')
    }
  }

  return warnings
}

/** Construir justificación */
function buildJustification(
  primary: NutritionMethodId, secondary: NutritionMethodId[],
  complementary: NutritionMethodId[], goal: string, level: string,
  trainingType: string, days: number, profile: NutritionUserProfile,
): string {
  const primaryMethod = getNutritionMethod(primary)
  let text = `Para tu objetivo (${goal}), nivel (${level}), entrenamiento ${trainingType} ${days} días/semana `
  text += `y tus preferencias, voy a utilizar un patrón ${primaryMethod?.nameEs || primary} `

  if (secondary.length > 0) {
    const secNames = secondary.map(id => getNutritionMethod(id)?.nameEs || id)
    text += `combinado con estrategias de ${secNames.join(', ')} `
  }

  if (complementary.length > 0) {
    const compNames = complementary.map(id => getNutritionMethod(id)?.nameEs || id)
    text += `e incluyendo ${compNames.join(', ')} como complemento `
  }

  if (profile.weightKg) {
    const proteinRange = primaryMethod?.defaults.proteinPerKg || [1.2, 1.6]
    text += `. Proteína estimada: ${proteinRange[0]}-${proteinRange[1]} g/kg (${Math.round(proteinRange[0] * profile.weightKg)}-${Math.round(proteinRange[1] * profile.weightKg)}g/día). `
  }

  text += `La estrategia prioriza sostenibilidad y adecuación nutricional.`
  return text
}

/** Calcular confianza */
function calculateConfidence(profile: NutritionUserProfile): number {
  let confidence = 0.4
  if (profile.trainingGoal) {confidence += 0.1}
  if (profile.weightKg) {confidence += 0.1}
  if (profile.nutritionPrefs?.restrictions) {confidence += 0.05}
  if (profile.adherenceHistory && profile.adherenceHistory.length > 0) {confidence += 0.1}
  if (profile.recoveryScore) {confidence += 0.05}
  return Math.min(1, confidence)
}

/** Construir lista de factores */
function buildFactorsList(
  goal: string, level: string, trainingType: string,
  days: number, weight: number,
  restrictions: string[], allergies: string[],
): string[] {
  const factors = [
    `Objetivo: ${goal}`,
    `Nivel: ${level}`,
    `Entrenamiento: ${trainingType}`,
    `Frecuencia: ${days} días/semana`,
    `Peso: ${weight}kg`,
  ]
  if (restrictions.length > 0) {factors.push(`Restricciones: ${restrictions.join(', ')}`)}
  if (allergies.length > 0) {factors.push(`Alergias: ${allergies.join(', ')}`)}
  return factors
}
