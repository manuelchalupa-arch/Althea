// COMPATIBILITY ENGINE — Determina qué métodos pueden combinarse
import type { TrainingMethodId, MethodCompatibility } from './trainingMethods'
import { getMethod } from './trainingMethodsDB'

// Matriz de compatibilidad predefinida
const COMPATIBILITY_MATRIX: MethodCompatibility[] = [
  // Fuerza + Hipertrofia
  { methodA: 'strength', methodB: 'hypertrophy', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.2, notes: 'Combinación clásica. Fuerza en ejercicios principales, hipertrofia en accesorios.' },
  // Fuerza + Potencia
  { methodA: 'strength', methodB: 'power', compatible: true, interference: 'low', recoveryImpact: 'significant', volumeMultiplier: 1.1, notes: 'Compatible pero demandante. Priorizar calidad técnica en ambos.' },
  // Fuerza + HIIT
  { methodA: 'strength', methodB: 'hiit', compatible: true, interference: 'moderate', recoveryImpact: 'significant', volumeMultiplier: 0.9, notes: 'Posible interferencia. Reducir volumen de fuerza si se agrega HIIT.' },
  // Fuerza + Cardio
  { methodA: 'strength', methodB: 'cardio_endurance', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.0, notes: 'Compatible si el cardio es de baja-moderada intensidad.' },
  // Fuerza + Funcional
  { methodA: 'strength', methodB: 'functional', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.1, notes: 'Buena combinación para condición física general.' },
  // Fuerza + Movilidad
  { methodA: 'strength', methodB: 'mobility', compatible: true, interference: 'none', recoveryImpact: 'minimal', volumeMultiplier: 1.0, notes: 'Excelente combinación. Movilidad mejora rango en fuerza.' },
  // Fuerza + Equilibrio
  { methodA: 'strength', methodB: 'balance_stability', compatible: true, interference: 'none', recoveryImpact: 'minimal', volumeMultiplier: 1.0, notes: 'Compatible. Estabilidad mejora calidad de ejercicios compuestos.' },
  // Fuerza + Velocidad
  { methodA: 'strength', methodB: 'speed', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.0, notes: 'Compatible para atletas. Entrenar velocidad fresco, fuerza después.' },

  // Hipertrofia + HIIT
  { methodA: 'hypertrophy', methodB: 'hiit', compatible: true, interference: 'moderate', recoveryImpact: 'significant', volumeMultiplier: 0.85, notes: 'Posible interferencia. Limitar HIIT a 2x/semana y reducir volumen.' },
  // Hipertrofia + Cardio
  { methodA: 'hypertrophy', methodB: 'cardio_endurance', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 0.95, notes: 'Compatible con cardio moderado. Evitar cardio excesivo pre-entreno.' },
  // Hipertrofia + Funcional
  { methodA: 'hypertrophy', methodB: 'functional', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.0, notes: 'Buena combinación para recomposición corporal.' },
  // Hipertrofia + Movilidad
  { methodA: 'hypertrophy', methodB: 'mobility', compatible: true, interference: 'none', recoveryImpact: 'minimal', volumeMultiplier: 1.0, notes: 'Excelente. Movilidad post-entreno mejora recuperación.' },
  // Hipertrofia + Fuerza-Resistencia
  { methodA: 'hypertrophy', methodB: 'strength_endurance', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.0, notes: 'Puede combinarse en sesiones separadas o mismo día con orden correcto.' },

  // HIIT + Cardio
  { methodA: 'hiit', methodB: 'cardio_endurance', compatible: true, interference: 'moderate', recoveryImpact: 'significant', volumeMultiplier: 0.8, notes: 'No hacer HIIT y cardio largo el mismo día. Separar 48h.' },
  // HIIT + Funcional
  { methodA: 'hiit', methodB: 'functional', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 0.9, notes: 'Puede integrarse HIIT en sesiones funcionales.' },

  // Funcional + Movilidad
  { methodA: 'functional', methodB: 'mobility', compatible: true, interference: 'none', recoveryImpact: 'minimal', volumeMultiplier: 1.0, notes: 'Combinación natural. Movilidad es parte del entrenamiento funcional.' },
  // Funcional + Equilibrio
  { methodA: 'functional', methodB: 'balance_stability', compatible: true, interference: 'none', recoveryImpact: 'minimal', volumeMultiplier: 1.0, notes: 'Combinación natural. Estabilidad es componente del funcional.' },
  // Funcional + Velocidad
  { methodA: 'functional', methodB: 'speed', compatible: true, interference: 'low', recoveryImpact: 'moderate', volumeMultiplier: 1.0, notes: 'Compatible para preparación deportiva.' },

  // Potencia + Velocidad
  { methodA: 'power', methodB: 'speed', compatible: true, interference: 'low', recoveryImpact: 'significant', volumeMultiplier: 1.0, notes: 'Ambos demandan sistema nervioso. No en el mismo día.' },

  // Incompatibilidades
  { methodA: 'hiit', methodB: 'power', compatible: true, interference: 'high', recoveryImpact: 'significant', volumeMultiplier: 0.8, notes: 'Alta interferencia. HIIT antes de potencia reduce calidad explosiva.' },
]

/** Verificar compatibilidad entre dos métodos */
export function checkCompatibility(methodA: TrainingMethodId, methodB: TrainingMethodId): MethodCompatibility {
  // Buscar en la matriz
  const found = COMPATIBILITY_MATRIX.find(
    c => (c.methodA === methodA && c.methodB === methodB) ||
         (c.methodA === methodB && c.methodB === methodA)
  )
  if (found) return found

  // Si no está en la matriz, inferir por categoría
  const mA = getMethod(methodA)
  const mB = getMethod(methodB)
  if (!mA || !mB) {
    return {
      methodA, methodB,
      compatible: false,
      interference: 'high',
      recoveryImpact: 'significant',
      volumeMultiplier: 0.7,
      notes: 'No hay información de compatibilidad. Se recomienda precaución.',
    }
  }

  // Ambos de alta demanda neuromuscular → interferencia moderada
  if (mA.requirements.neuromuscularDemand === 'high' && mB.requirements.neuromuscularDemand === 'high') {
    return {
      methodA, methodB,
      compatible: true,
      interference: 'moderate',
      recoveryImpact: 'significant',
      volumeMultiplier: 0.9,
      notes: 'Ambos métodos demandan el sistema nervioso. Separar en días distintos.',
    }
  }

  // Ambos de alta demanda cardiovascular → interferencia moderada
  if (mA.requirements.cardiovascularDemand === 'high' && mB.requirements.cardiovascularDemand === 'high') {
    return {
      methodA, methodB,
      compatible: true,
      interference: 'moderate',
      recoveryImpact: 'significant',
      volumeMultiplier: 0.85,
      notes: 'Ambos métodos demandan el sistema cardiovascular. No hacer el mismo día.',
    }
  }

  // Uno de preparación → siempre compatible
  if (mA.category === 'preparation' || mB.category === 'preparation') {
    return {
      methodA, methodB,
      compatible: true,
      interference: 'none',
      recoveryImpact: 'minimal',
      volumeMultiplier: 1.0,
      notes: 'Los métodos de preparación son compatibles con casi todo.',
    }
  }

  // Default: compatible con interferencia baja
  return {
    methodA, methodB,
    compatible: true,
    interference: 'low',
    recoveryImpact: 'moderate',
    volumeMultiplier: 1.0,
    notes: 'Compatible. Monitorear recuperación y volumen total.',
  }
}

/** Verificar si una lista de métodos es compatible como grupo */
export function checkGroupCompatibility(methods: TrainingMethodId[]): {
  compatible: boolean
  totalInterference: number // 0-1
  totalRecoveryImpact: number // 0-1
  recommendations: string[]
} {
  const recommendations: string[] = []
  let totalInterference = 0
  let totalRecoveryImpact = 0
  let pairs = 0

  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const compat = checkCompatibility(methods[i], methods[j])
      pairs++
      if (compat.interference === 'high') totalInterference += 1
      else if (compat.interference === 'moderate') totalInterference += 0.5
      else if (compat.interference === 'low') totalInterference += 0.2

      if (compat.recoveryImpact === 'significant') totalRecoveryImpact += 1
      else if (compat.recoveryImpact === 'moderate') totalRecoveryImpact += 0.5
      else totalRecoveryImpact += 0.1

      if (!compat.compatible) {
        recommendations.push(`${methods[i]} + ${methods[j]}: ${compat.notes}`)
      } else if (compat.interference !== 'none') {
        recommendations.push(`${methods[i]} + ${methods[j]}: ${compat.notes}`)
      }
    }
  }

  return {
    compatible: totalInterference / Math.max(1, pairs) < 0.7,
    totalInterference: pairs > 0 ? totalInterference / pairs : 0,
    totalRecoveryImpact: pairs > 0 ? totalRecoveryImpact / pairs : 0,
    recommendations,
  }
}

/** Obtener volumen ajustado al combinar métodos */
export function getAdjustedVolume(methods: TrainingMethodId[], baseVolume: number): number {
  let multiplier = 1
  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const compat = checkCompatibility(methods[i], methods[j])
      multiplier *= compat.volumeMultiplier
    }
  }
  return Math.round(baseVolume * multiplier)
}
