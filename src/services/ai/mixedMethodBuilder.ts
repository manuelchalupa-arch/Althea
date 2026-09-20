// MIXED METHOD BUILDER — Construye métodos mixtos personalizados
import type { TrainingMethodId, MixedMethod } from './trainingMethods'
import { getMethod } from './trainingMethodsDB'

/** Crear método mixto personalizado combinando componentes */
export function createMixedMethod(
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
export function determinePhase(goal: string, level: string): MixedMethod['phase'] {
  if (level === 'beginner') {return 'base'}
  if (goal === 'fat_loss') {return 'build'}
  if (goal === 'strength') {return 'peak'}
  return 'build'
}
