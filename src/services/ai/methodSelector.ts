// METHOD SELECTOR — Motor de selección inteligente de métodos de entrenamiento
// Analiza al usuario y determina qué método es más apropiado
import type { TrainingMethodId, UserProfile, MethodRecommendation, MixedMethod } from './trainingMethods'
import { TRAINING_METHODS, getMethod, getStructureMethods, getTrainingMethods } from './trainingMethodsDB'
import { checkCompatibility } from './compatibilityEngine'

/** Analizar al usuario y recomendar métodos */
export function selectMethods(profile: UserProfile, recentVolume?: number, recentFatigue?: number): MethodRecommendation {
  const goal = (profile.trainingGoal || 'hypertrophy') as string
  const level = (profile.experienceLevel || 'intermediate') as string
  const days = getAvailableDays(profile)
  const sessionMin = profile.sessionDurationMin || 60
  const hasEquipment = profile.equipment || ['barbell', 'dumbbell']
  const limitations = profile.limitations || []
  const painAreas = profile.painAreas || []

  // 1. Evaluar cada método
  const scores = TRAINING_METHODS.map(m => ({
    method: m,
    score: scoreMethod(m, goal, level, days, sessionMin, hasEquipment, limitations, painAreas, recentVolume, recentFatigue),
  }))

  // 2. Separar por categoría
  const structures = scores.filter(s => s.method.category === 'structure')
  const training = scores.filter(s => s.method.category !== 'structure' && s.method.category !== 'preparation')
  const prep = scores.filter(s => s.method.category === 'preparation')

  // 3. Seleccionar estructura principal
  structures.sort((a, b) => b.score - a.score)
  const primaryStructure = structures[0]?.method.id as TrainingMethodId || 'full_body'

  // 4. Seleccionar método de entrenamiento principal
  training.sort((a, b) => b.score - a.score)
  const primaryTraining = training[0]?.method.id as TrainingMethodId || 'hypertrophy'

  // 5. Métodos secundarios (score > 0.5)
  const secondary = training
    .filter((s, i) => i > 0 && s.score > 0.5)
    .map(s => s.method.id as TrainingMethodId)

  // 6. Métodos complementarios (preparación)
  const complementary = prep
    .filter(s => s.score > 0.3)
    .map(s => s.method.id as TrainingMethodId)

  // 7. Métodos no recomendados
  const notRecommended = scores
    .filter(s => s.score < 0.2)
    .map(s => s.method.id as TrainingMethodId)

  // 8. Construir justificación
  const justification = buildJustification(primaryStructure, primaryTraining, secondary, complementary, goal, level, days, sessionMin)

  // 9. Decidir si crear método mixto
  const mixed = shouldCreateMixedMethod(primaryStructure, primaryTraining, secondary, goal, level, days, sessionMin, recentFatigue)
    ? createMixedMethod(primaryStructure, primaryTraining, secondary, complementary, goal, level, days, sessionMin, justification)
    : undefined

  // 10. Confidence basada en cuántos factores conocemos
  const confidence = calculateConfidence(profile, recentVolume, recentFatigue)

  return {
    primary: primaryTraining,
    secondary,
    complementary,
    notRecommended,
    mixed,
    justification,
    confidence,
    factors: buildFactorsList(goal, level, days, sessionMin, hasEquipment, limitations, painAreas),
  }
}

/** Puntuar un método para un usuario específico */
function scoreMethod(
  method: ReturnType<typeof getMethod> & {},
  goal: string,
  level: string,
  days: number,
  sessionMin: number,
  equipment: string[],
  limitations: string[],
  painAreas: string[],
  recentVolume?: number,
  recentFatigue?: number,
): number {
  let score = 0.5 // base

  // Objetivo compatible
  if (method.suitability.goals.includes(goal as any)) score += 0.25
  else score -= 0.2

  // Nivel compatible
  const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 }
  const reqLevel = levelOrder[method.requirements.minExperienceLevel] || 0
  const userLevel = levelOrder[level as keyof typeof levelOrder] || 1
  if (userLevel >= reqLevel) score += 0.15
  else score -= 0.3

  // Días disponibles
  if (days >= method.requirements.minDaysPerWeek && days <= method.requirements.maxDaysPerWeek) score += 0.1
  else if (days < method.requirements.minDaysPerWeek) score -= 0.2
  else score -= 0.1

  // Tiempo de sesión
  if (sessionMin >= method.requirements.minSessionMinutes) score += 0.05
  else score -= 0.15

  // Equipamiento
  const hasRequired = method.requirements.requiredEquipment.every(e =>
    e === 'none' || e === 'bodyweight' || equipment.includes(e)
  )
  if (hasRequired) score += 0.05
  else score -= 0.15

  // Limitaciones y dolor
  if (limitations.length > 0 && method.requirements.technicalDemand === 'high') score -= 0.1
  if (painAreas.length > 0 && method.requirements.neuromuscularDemand === 'high') score -= 0.1

  // Fatiga reciente
  if (recentFatigue != null && recentFatigue > 7 && method.requirements.cardiovascularDemand === 'high') score -= 0.1
  if (recentFatigue != null && recentFatigue > 7 && method.requirements.neuromuscularDemand === 'high') score -= 0.1

  // Volumen reciente alto → favorecer métodos menos demandantes
  if (recentVolume != null && recentVolume > 15 && method.requirements.neuromuscularDemand === 'high') score -= 0.05

  return Math.max(0, Math.min(1, score))
}

/** Obtener días disponibles del perfil */
function getAvailableDays(profile: UserProfile): number {
  if (profile.schedule?.availableDays) return profile.schedule.availableDays.length
  if (profile.cycle?.weekMap) return profile.cycle.weekMap.filter(d => d !== null).length
  return 3 // default
}

/** Crear método mixto personalizado */
function createMixedMethod(
  structure: TrainingMethodId,
  training: TrainingMethodId,
  secondary: TrainingMethodId[],
  complementary: TrainingMethodId[],
  goal: string,
  level: string,
  days: number,
  sessionMin: number,
  baseJustification: string,
): MixedMethod {
  const components: MixedMethod['components'] = []

  // Componente principal: método de entrenamiento
  const primaryMethod = getMethod(training)
  components.push({
    methodId: training,
    weight: secondary.length > 0 ? 0.5 : 0.7,
    purpose: primaryMethod?.descriptionEs || training,
  })

  // Componentes secundarios
  if (secondary.length > 0) {
    const secMethod = getMethod(secondary[0])
    components.push({
      methodId: secondary[0],
      weight: 0.2,
      purpose: secMethod?.descriptionEs || secondary[0],
    })
  }

  // Complementos (movilidad, equilibrio)
  if (complementary.length > 0) {
    const compMethod = getMethod(complementary[0])
    components.push({
      methodId: complementary[0],
      weight: 0.15,
      purpose: compMethod?.descriptionEs || complementary[0],
    })
  }

  // Estructura
  const structureMethod = getMethod(structure)
  components.push({
    methodId: structure,
    weight: components.reduce((a, c) => a + c.weight, 0) > 0.85 ? 0.1 : 0.15,
    purpose: `Estructura: ${structureMethod?.nameEs || structure}`,
  })

  // Normalizar pesos
  const totalWeight = components.reduce((a, c) => a + c.weight, 0)
  components.forEach(c => { c.weight = Math.round((c.weight / totalWeight) * 100) / 100 })

  // Determinar fase
  const phase = determinePhase(goal, level)

  // Distribution string
  const distribution = components
    .map(c => {
      const m = getMethod(c.methodId)
      return `${Math.round(c.weight * 100)}% ${m?.nameEs || c.methodId}`
    })
    .join(', ')

  return {
    id: `mixed-${Date.now()}`,
    name: `Método Mixto: ${components.map(c => getMethod(c.methodId)?.nameEs || c.methodId).join(' + ')}`,
    components,
    structure: {
      daysPerWeek: days,
      sessionMinutes: sessionMin,
      distribution,
    },
    justification: baseJustification,
    phase,
    dynamic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/** Determinar fase según objetivo y nivel */
function determinePhase(goal: string, level: string): MixedMethod['phase'] {
  if (level === 'beginner') return 'base'
  if (goal === 'fat_loss') return 'build'
  if (goal === 'strength') return 'peak'
  return 'build'
}

/** Determinar si se debe crear un método mixto */
function shouldCreateMixedMethod(
  structure: TrainingMethodId,
  training: TrainingMethodId,
  secondary: TrainingMethodId[],
  goal: string,
  level: string,
  days: number,
  sessionMin: number,
  fatigue?: number,
): boolean {
  // Crear mixto si hay métodos secundarios relevantes
  if (secondary.length > 0) return true
  // Si el objetivo es general_health, siempre mixto
  if (goal === 'general_health') return true
  // Si hay poco tiempo pero múltiples necesidades
  if (sessionMin < 45 && days <= 3) return true
  // Si fatiga es alta, combinar con movilidad
  if (fatigue != null && fatigue > 6) return true
  return false
}

/** Construir justificación en español */
function buildJustification(
  structure: TrainingMethodId,
  training: TrainingMethodId,
  secondary: TrainingMethodId[],
  complementary: TrainingMethodId[],
  goal: string,
  level: string,
  days: number,
  sessionMin: number,
): string {
  const structureMethod = getMethod(structure)
  const trainingMethod = getMethod(training)

  let text = `Basado en tu objetivo (${goal}), nivel (${level}), ${days} días disponibles y ${sessionMin} min por sesión, `

  text += `recomiendo ${trainingMethod?.nameEs || training} como método principal `

  if (structure !== 'full_body') {
    text += `con estructura ${structureMethod?.nameEs || structure} `
  } else {
    text += `con estructura cuerpo completo `
  }

  if (secondary.length > 0) {
    const secMethods = secondary.map(id => getMethod(id)?.nameEs || id)
    text += `combinado con ${secMethods.join(', ')} `
  }

  if (complementary.length > 0) {
    const compMethods = complementary.map(id => getMethod(id)?.nameEs || id)
    text += `e incluyendo ${compMethods.join(', ')} como complemento `
  }

  text += `para maximizar resultados y mantener la recuperación adecuada.`

  return text
}

/** Calcular confianza de la recomendación */
function calculateConfidence(profile: UserProfile, recentVolume?: number, recentFatigue?: number): number {
  let confidence = 0.5

  if (profile.trainingGoal) confidence += 0.1
  if (profile.experienceLevel) confidence += 0.1
  if (profile.schedule?.availableDays) confidence += 0.1
  if (profile.sessionDurationMin) confidence += 0.05
  if (profile.equipment) confidence += 0.05
  if (recentVolume != null) confidence += 0.05
  if (recentFatigue != null) confidence += 0.05

  return Math.min(1, confidence)
}

/** Construir lista de factores analizados */
function buildFactorsList(
  goal: string,
  level: string,
  days: number,
  sessionMin: number,
  equipment: string[],
  limitations: string[],
  painAreas: string[],
): string[] {
  const factors = [
    `Objetivo: ${goal}`,
    `Nivel: ${level}`,
    `Días: ${days}/semana`,
    `Sesión: ${sessionMin} min`,
    `Equipamiento: ${equipment.join(', ')}`,
  ]
  if (limitations.length > 0) factors.push(`Limitaciones: ${limitations.join(', ')}`)
  if (painAreas.length > 0) factors.push(`Dolor: ${painAreas.join(', ')}`)
  return factors
}
