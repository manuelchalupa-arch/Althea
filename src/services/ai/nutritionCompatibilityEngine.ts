// NUTRITION COMPATIBILITY ENGINE — Verifica compatibilidad entre métodos nutricionales
import type { NutritionMethodId, NutritionCompatibility } from './nutritionMethods'
import { getNutritionMethod } from './nutritionMethodsDB'

// Matriz de compatibilidad predefinida
const NUTRITION_COMPATIBILITY_MATRIX: NutritionCompatibility[] = [
  // Mediterráneo + alta en proteína
  { methodA: 'mediterranean', methodB: 'high_protein', compatible: true, interference: 'none', synergy: 'Excelente sinergia: patrón equilibrado con énfasis proteico para composición corporal', notes: 'Combinación natural y respaldada por evidencia' },
  // Mediterráneo + around_training
  { methodA: 'mediterranean', methodB: 'around_training', compatible: true, interference: 'none', synergy: 'Distribución temporal potencia los beneficios del patrón mediterráneo', notes: 'Ideal para atletas' },
  // Mediterráneo + carb_cycling
  { methodA: 'mediterranean', methodB: 'carb_cycling', compatible: true, interference: 'low', synergy: 'Periodización de carbos con base mediterránea saludable', notes: 'Para atletas con entrenamiento periodizado' },
  // Mediterráneo + intermittent_fasting
  { methodA: 'mediterranean', methodB: 'intermittent_fasting', compatible: true, interference: 'low', synergy: 'Posible combinar si el usuario prefiere menos comidas', notes: 'Evaluar distribución proteica en ventana' },
  // Flexitariana + alta en proteína
  { methodA: 'flexitarian', methodB: 'high_protein', compatible: true, interference: 'none', synergy: 'Plant-based con énfasis proteico — incluir fuentes animales cuando se necesita', notes: 'Muy buena combinación para recomposición' },
  // Flexitariana + around_training
  { methodA: 'flexitarian', methodB: 'around_training', compatible: true, interference: 'none', synergy: 'Distribución temporal con base flexitariana flexible', notes: 'Adaptable a diferentes contextos' },
  // Vegana + alta en proteína
  { methodA: 'vegan', methodB: 'high_protein', compatible: true, interference: 'low', synergy: 'Proteína vegetal alta requiere planificación de fuentes complementarias', notes: 'Requiere conocimiento de combinación proteica' },
  // Vegana + around_training
  { methodA: 'vegan', methodB: 'around_training', compatible: true, interference: 'low', synergy: 'Timing可以帮助在有限 ventana内达到 proteína', notes: 'Ventana más amplia recomendada' },
  // DASH + alta en proteína
  { methodA: 'dash', methodB: 'high_protein', compatible: true, interference: 'none', synergy: 'Proteína magra es compatible con DASH', notes: 'Proteínas magras favorecen el patrón' },
  // Keto + around_training
  { methodA: 'keto', methodB: 'around_training', compatible: true, interference: 'moderate', synergy: 'Timing puede ayudar pero la restricción de carbos limita el rendimiento', notes: 'Evaluar rendimiento cuidadosamente' },
  // IF + around_training
  { methodA: 'intermittent_fasting', methodB: 'around_training', compatible: true, interference: 'low', synergy: 'Ventana alimentaria centrada en entreno', notes: 'Entrenar dentro de la ventana ideal' },
  // IF + high_protein
  { methodA: 'intermittent_fasting', methodB: 'high_protein', compatible: true, interference: 'low', synergy: 'Proteína alta dentro de la ventana — posible pero requiere esfuerzo', notes: 'Distribuir en 2-3 comidas' },
  // Carb_cycling + high_protein
  { methodA: 'carb_cycling', methodB: 'high_protein', compatible: true, interference: 'none', synergy: 'Proteína constante + carbos variables = excelente para composición', notes: 'Combinación avanzada para atletas' },
  // Incompatibilidades
  { methodA: 'keto', methodB: 'carb_cycling', compatible: false, interference: 'high', synergy: '', notes: 'Cetosis estricta incompatible con periodización de carbohidratos' },
  { methodA: 'keto', methodB: 'vegan', compatible: true, interference: 'high', synergy: 'Ceto vegano posible pero extremadamente restrictivo', notes: 'Requiere supervisión profesional — no recomendado generalmente' },
  { methodA: 'whole30', methodB: 'intermittent_fasting', compatible: false, interference: 'high', synergy: '', notes: 'Ambos son restrictivos — no combinar' },
  { methodA: 'whole30', methodB: 'high_protein', compatible: true, interference: 'low', synergy: 'Whole30 ya incluye proteína, pero temporal', notes: 'Protocolo de 30 días, no permanente' },
  { methodA: 'paleo', methodB: 'dash', compatible: true, interference: 'moderate', synergy: 'Paleo limita granos/lácteos que DASH incluye', notes: 'Adaptar para mantener beneficios de ambos' },
]

/** Verificar compatibilidad entre dos métodos nutricionales */
export function checkNutritionCompatibility(methodA: NutritionMethodId, methodB: NutritionMethodId): NutritionCompatibility {
  const found = NUTRITION_COMPATIBILITY_MATRIX.find(
    c => (c.methodA === methodA && c.methodB === methodB) ||
         (c.methodA === methodB && c.methodB === methodA)
  )
  if (found) return found

  // Inferir por categoría
  const mA = getNutritionMethod(methodA)
  const mB = getNutritionMethod(methodB)
  if (!mA || !mB) {
    return {
      methodA, methodB,
      compatible: false,
      interference: 'high',
      synergy: '',
      notes: 'Sin información de compatibilidad — se recomienda precaución',
    }
  }

  // Ambos restrictivos → interferencia moderada
  if (mA.category === 'restrictive' && mB.category === 'restrictive') {
    return {
      methodA, methodB,
      compatible: false,
      interference: 'high',
      synergy: '',
      notes: 'Ambos métodos son restrictivos — no combinar',
    }
  }

  // Ambos son patrones base → interferencia baja
  if (mA.category === 'pattern' && mB.category === 'pattern') {
    return {
      methodA, methodB,
      compatible: true,
      interference: 'low',
      synergy: 'Combinación de patrones puede ser beneficiosa',
      notes: 'Seleccionar elementos de cada uno',
    }
  }

  // Pattern + distribution/macronutrient → generalmente compatible
  if (mA.category === 'pattern' && (mB.category === 'distribution' || mB.category === 'macronutrient') ||
      mB.category === 'pattern' && (mA.category === 'distribution' || mA.category === 'macronutrient')) {
    return {
      methodA, methodB,
      compatible: true,
      interference: 'none',
      synergy: 'El patrón provee la base y la estrategia optimiza',
      notes: 'Combinación natural',
    }
  }

  // Default
  return {
    methodA, methodB,
    compatible: true,
    interference: 'low',
    synergy: '',
    notes: 'Compatible — monitorear adherencia y resultados',
  }
}

/** Verificar si una lista de métodos es compatible como grupo */
export function checkGroupNutritionCompatibility(methods: NutritionMethodId[]): {
  compatible: boolean
  totalInterference: number
  recommendations: string[]
} {
  const recommendations: string[] = []
  let totalInterference = 0
  let pairs = 0

  for (let i = 0; i < methods.length; i++) {
    for (let j = i + 1; j < methods.length; j++) {
      const compat = checkNutritionCompatibility(methods[i], methods[j])
      pairs++
      if (compat.interference === 'high') totalInterference += 1
      else if (compat.interference === 'moderate') totalInterference += 0.5
      else if (compat.interference === 'low') totalInterference += 0.2

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
    recommendations,
  }
}
