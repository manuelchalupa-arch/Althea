// MIXED NUTRITION BUILDER — Construye estrategias nutricionales mixtas personalizadas
import type { NutritionMethodId, NutritionUserProfile, MixedNutritionMethod } from './nutritionMethods'
import { getNutritionMethod } from './nutritionMethodsDB'

/** Crear método mixto nutricional personalizado */
export function createMixedNutritionMethod(
  primary: NutritionMethodId,
  secondary: NutritionMethodId[],
  complementary: NutritionMethodId[],
  goal: string,
  trainingType: string,
  profile: NutritionUserProfile,
  baseJustification: string,
): MixedNutritionMethod {
  const components: MixedNutritionMethod['components'] = []
  const primaryMethod = getNutritionMethod(primary)

  // Componente principal: patrón alimentario
  components.push({
    methodId: primary,
    weight: secondary.length > 0 ? 0.40 : 0.60,
    purpose: primaryMethod?.descriptionEs || primary,
    contribution: `Base del patrón alimentario: ${primaryMethod?.characteristics.energyApproach || ''}`,
  })

  // Componentes secundarios: estrategias de distribución/macros
  if (secondary.length > 0) {
    const secMethod = getNutritionMethod(secondary[0])
    components.push({
      methodId: secondary[0],
      weight: 0.30,
      purpose: secMethod?.descriptionEs || secondary[0],
      contribution: `Estrategia: ${secMethod?.characteristics.timingRelevance || 'distribución'}`,
    })
  }

  if (secondary.length > 1) {
    const sec2Method = getNutritionMethod(secondary[1])
    components.push({
      methodId: secondary[1],
      weight: 0.15,
      purpose: sec2Method?.descriptionEs || secondary[1],
      contribution: `Optimización: ${sec2Method?.characteristics.proteinStrategy || 'macros'}`,
    })
  }

  // Complementarios
  if (complementary.length > 0) {
    const compMethod = getNutritionMethod(complementary[0])
    components.push({
      methodId: complementary[0],
      weight: 0.15,
      purpose: compMethod?.descriptionEs || complementary[0],
      contribution: `Complemento: ${compMethod?.characteristics.key_foods?.join(', ') || 'alimentos clave'}`,
    })
  }

  // Normalizar pesos
  const totalWeight = components.reduce((a, c) => a + c.weight, 0)
  components.forEach(c => { c.weight = Math.round((c.weight / totalWeight) * 100) / 100 })

  // Calcular defaults fusionados
  const strategy = mergeStrategies(primary, secondary, complementary, goal, trainingType, profile)

  // Key principles
  const keyPrinciples = extractKeyPrinciples(primary, secondary, goal, trainingType)

  // Phase
  const phase = determineNutritionPhase(profile)

  return {
    id: `mixed-nutrition-${Date.now()}`,
    name: `Estrategia Mixta: ${components.map(c => getNutritionMethod(c.methodId)?.nameEs || c.methodId).join(' + ')}`,
    components,
    strategy,
    justification: baseJustification,
    phase,
    dynamic: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/** Fusionar estrategias de múltiples métodos */
function mergeStrategies(
  primary: NutritionMethodId,
  secondary: NutritionMethodId[],
  complementary: NutritionMethodId[],
  goal: string,
  trainingType: string,
  profile: NutritionUserProfile,
): MixedNutritionMethod['strategy'] {
  const all = [primary, ...secondary, ...complementary].map(id => getNutritionMethod(id)).filter(Boolean)
  if (all.length === 0) {
    return {
      calorieModifier: 1.0, proteinPerKg: [1.4, 1.8], carbPercentage: [40, 50],
      fatPercentage: [25, 35], mealFrequency: [3, 5], timingStrategy: 'Distribución equilibrada',
      keyPrinciples: ['Sostenibilidad', 'Adecuación nutricional'],
    }
  }

  const primaryMethod = getNutritionMethod(primary)

  // Proteína: tomar el rango más alto
  const proteinRanges = all.map(m => m!.defaults.proteinPerKg)
  const proteinPerKg: [number, number] = [
    Math.max(...proteinRanges.map(r => r[0])),
    Math.max(...proteinRanges.map(r => r[1])),
  ]

  // Calorías: promedio de modificadores
  const calorieModifiers = all.map(m => m!.defaults.calorieModifier)
  const calorieModifier = calorieModifiers.reduce((a, b) => a + b, 0) / calorieModifiers.length

  // Carbos y grasas: preferir el método principal
  const carbPercentage: [number, number] = primaryMethod?.defaults.carbPercentage || [40, 50]
  const fatPercentage: [number, number] = primaryMethod?.defaults.fatPercentage || [25, 35]

  // Meal frequency: rango combinado
  const mealRanges = all.map(m => m!.defaults.mealFrequency)
  const mealFrequency: [number, number] = [
    Math.max(...mealRanges.map(r => r[0])),
    Math.min(...mealRanges.map(r => r[1]), 6),
  ]

  // Timing strategy
  const timingMethods = all.filter(m => m!.category === 'distribution')
  const timingStrategy = timingMethods.length > 0
    ? timingMethods.map(m => m!.characteristics.timingRelevance).join(' + ')
    : 'Distribución regular de comidas'

  // Adaptar según entrenamiento
  const trainingAdapt = primaryMethod?.trainingAdaptation[trainingType as keyof typeof primaryMethod.trainingAdaptation]

  return {
    calorieModifier: trainingAdapt?.calorieModifier || calorieModifier,
    proteinPerKg: trainingAdapt?.proteinModifier
      ? [proteinPerKg[0] * trainingAdapt.proteinModifier, proteinPerKg[1] * trainingAdapt.proteinModifier]
      : proteinPerKg,
    carbPercentage,
    fatPercentage,
    mealFrequency,
    timingStrategy,
    keyPrinciples: extractKeyPrinciples(primary, secondary, goal, trainingType),
  }
}

/** Extraer principios clave */
function extractKeyPrinciples(primary: NutritionMethodId, secondary: NutritionMethodId[], goal: string, trainingType: string): string[] {
  const principles: string[] = []
  const primaryMethod = getNutritionMethod(primary)

  if (primaryMethod) {
    principles.push(`Patrón: ${primaryMethod.nameEs}`)
    if (primaryMethod.characteristics.key_foods.length > 0) {
      principles.push(`Alimentos clave: ${primaryMethod.characteristics.key_foods.slice(0, 3).join(', ')}`)
    }
  }

  if (secondary.includes('high_protein')) {principles.push('Proteína como prioridad')}
  if (secondary.includes('around_training')) {principles.push('Timing peri-entrenamiento')}
  if (secondary.includes('carb_cycling')) {principles.push('Periodización de carbohidratos')}
  if (secondary.includes('intermittent_fasting')) {principles.push('Restricción temporal')}

  if (goal === 'fat_loss') {principles.push('Déficit moderado sostenible')}
  if (goal === 'muscle_gain') {principles.push('Superávit calórico controlado')}
  if (goal === 'recomposition') {principles.push('Recomposición: déficit/superávit según día')}

  if (trainingType === 'hypertrophy' || trainingType === 'strength') {principles.push('Proteína post-entreno')}
  if (trainingType === 'endurance') {principles.push('Carbohidratos suficientes')}

  return principles
}

/** Determinar fase nutricional */
function determineNutritionPhase(profile: NutritionUserProfile): MixedNutritionMethod['phase'] {
  if (!profile.adherenceHistory || profile.adherenceHistory.length === 0) {return 'initial'}
  const avgAdherence = profile.adherenceHistory.reduce((a, h) => a + h.score, 0) / profile.adherenceHistory.length
  if (avgAdherence < 5) {return 'adjustment'}
  if (avgAdherence >= 8) {return 'maintenance'}
  return 'adaptation'
}
