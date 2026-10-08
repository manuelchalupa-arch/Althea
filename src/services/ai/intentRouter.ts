import { stripAccents } from '@/utils/format'
// ROUTER DE INTENCIONES — primer eslabón del pipeline del Coach.
//
// Determinista (sin red, sin LLM): clasifica la consulta en una de las
// intenciones de dominio del producto. La intención decide qué contexto local
// se inyecta y qué evidencia se recupera. Si ninguna intención coincide se
// devuelve GENERAL y el pipeline lo trata como consulta general (sin inventar).

export type AiIntent =
  | 'TRAINING'
  | 'HYPERTROPHY'
  | 'STRENGTH'
  | 'POWER'
  | 'ENDURANCE'
  | 'MOBILITY'
  | 'WARMUP'
  | 'RECOVERY'
  | 'PERIODIZATION'
  | 'EXERCISE_SELECTION'
  | 'NUTRITION'
  | 'MEAL_LOG'
  | 'HYDRATION'
  | 'BODY_MEASUREMENTS'
  | 'PROGRESS'
  | 'GENERAL'

export const AI_INTENTS: AiIntent[] = [
  'TRAINING', 'HYPERTROPHY', 'STRENGTH', 'POWER', 'ENDURANCE', 'MOBILITY', 'WARMUP',
  'RECOVERY', 'PERIODIZATION', 'EXERCISE_SELECTION', 'NUTRITION', 'MEAL_LOG', 'HYDRATION',
  'BODY_MEASUREMENTS', 'PROGRESS', 'GENERAL',
]

export interface IntentResult {
  intent: AiIntent
  /** 0-1. Depende de cuántas señales de la intención coincidieron. */
  confidence: number
  /** Términos que dispararon la intención (para depurar/explicar). */
  matched: string[]
}

interface IntentRule {
  intent: AiIntent
  terms: string[]
}

const RULES: IntentRule[] = [
  {
    intent: 'MEAL_LOG',
    terms: ['comí', 'comi hoy', 'registrar comida', 'anotar comida', 'agregué comida', 'agregue comida',
      'qué comí', 'que comi', 'comida registrada', 'registré', 'registre', 'cargar comida'],
  },
  {
    intent: 'HYDRATION',
    terms: ['agua', 'hidrata', 'hidratarme', 'beber', 'botella', 'vaso', 'litro', 'ml', 'sed', 'líquido', 'liquido'],
  },
  {
    intent: 'BODY_MEASUREMENTS',
    terms: ['peso actual', 'pesarme', 'mi peso', 'medidas', 'medición', 'medicion', 'cintura', 'circunferencia',
      'imc', 'grasa corporal', 'porcentaje de grasa', 'composición corporal', 'composicion corporal'],
  },
  {
    intent: 'PROGRESS',
    terms: ['progreso', 'avance', 'evolución', 'evolucion', 'resultados', 'histórico', 'historico',
      'cómo voy', 'como voy', 'mejoré', 'mejore', 'comparar semanas', 'informe', 'resumen del período'],
  },
  {
    intent: 'PERIODIZATION',
    terms: ['periodización', 'periodizacion', 'mesociclo', 'bloque', 'ciclo de entrenamiento', 'deload',
      'descarga', 'planificación', 'planificacion', 'fase de carga'],
  },
  {
    intent: 'WARMUP',
    terms: ['calentamiento', 'calentar', 'activación', 'activacion', 'pre-entreno', 'pre entreno',
      'antes de entrenar', 'warm up', 'warmup'],
  },
  {
    intent: 'MOBILITY',
    terms: ['movilidad', 'flexibilidad', 'estirar', 'estiramiento', 'elongación', 'elongacion',
      'rango de movimiento', 'movilizar', 'tensión muscular', 'tension muscular'],
  },
  {
    intent: 'RECOVERY',
    terms: ['dolor', 'duele', 'recuper', 'descansar', 'descanso', 'sueño', 'sueno',
      'dormir', 'fatiga', 'cansancio', 'lesión', 'lesion', 'sobreentrenamiento', 'agotado'],
  },
  {
    intent: 'EXERCISE_SELECTION',
    terms: ['qué ejercicio', 'que ejercicio', 'cuáles ejercicios', 'cuales ejercicios', 'reemplazar',
      'sustituir', 'sustituir', 'alternativa', 'ejercicio para', 'máquina', 'maquina', 'mancuerna', 'barra'],
  },
  {
    intent: 'POWER',
    terms: ['potencia', 'velocidad', 'explosivo', 'explosividad', 'salto', 'pliometría', 'pliometria',
      'arrancada', 'prone'],
  },
  {
    intent: 'ENDURANCE',
    terms: ['resistencia', 'cardio', 'fondo', 'carrera', 'correr', 'trote', 'bicicleta', '5k', '10k',
      'maratón', 'maraton', 'zona 2'],
  },
  {
    intent: 'HYPERTROPHY',
    terms: ['hipertrofia', 'masa muscular', 'agrandar', 'volumen muscular', 'bombeo', 'definir músculo',
      'definir musculo', 'crecer músculo', 'crecer musculo', 'series por músculo'],
  },
  {
    intent: 'STRENGTH',
    terms: ['fuerza', '1rm', 'máximo', 'maximo', 'pesado', 'aguantar peso', 'press banca', 'sentadilla',
      'peso muerto', 'frontera'],
  },
  {
    intent: 'NUTRITION',
    terms: ['dieta', 'macros', 'macro', 'calorías', 'calorias', 'kcal', 'proteína', 'proteina', 'proteínas',
      'carbohidrato', 'grasas', 'comer', 'comida', 'alimentación', 'alimentacion', 'almuerzo', 'cena',
      'desayuno', 'merienda', 'snack', 'ayuno', 'suplemento', 'creatina'],
  },
  {
    intent: 'TRAINING',
    terms: ['entreno', 'entrenar', 'entrenamiento', 'rutina', 'serie', 'series', 'repetición', 'repeticion',
      'reps', 'carga', 'técnica', 'tecnica', 'progresión', 'progresion', 'rpe', 'intensidad', 'volumen',
      'día de entreno', 'sesión'],
  },
]

/** Palabras vacías que no aportan intención. */
const STOPWORDS = new Set([
  'que', 'como', 'cual', 'cuales', 'como', 'para', 'por', 'con', 'sin', 'una', 'uno', 'unos', 'unas',
  'los', 'las', 'del', 'al', 'el', 'la', 'lo', 'en', 'de', 'y', 'o', 'u', 'mi', 'me', 'te', 'se', 'es',
  'son', 'ser', 'hay', 'puedo', 'podes', 'puede', 'hoy', 'ayer', 'gracias', 'hola', 'the', 'and',
])

/**
 * Intenciones específicas ganan a las genéricas con la misma señal:
 * "registrar comida" es MEAL_LOG aunque también aparezca "comida" (NUTRITION),
 * y "agua" es HYDRATION aunque la consulta mencione "comida".
 */
const GENERIC: AiIntent[] = ['TRAINING', 'NUTRITION', 'GENERAL']

function normalize(text: string): string {
  return stripAccents(text.toLowerCase())
    .replace(/[^\wñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clasifica la consulta en una intención de dominio.
 * Determinístico: mismos datos → misma intención, siempre.
 */
export function routeIntent(input: string): IntentResult {
  const text = normalize(input)
  if (!text) {
    return { intent: 'GENERAL', confidence: 0, matched: [] }
  }

  const scores = new Map<AiIntent, { score: number; matched: string[] }>()
  for (const rule of RULES) {
    const matched = rule.terms.filter(term => text.includes(normalize(term)))
    if (matched.length === 0) { continue }
    const prev = scores.get(rule.intent) ?? { score: 0, matched: [] }
    // Los términos más largos pesan más: "recuperación" > "peso".
    const weight = matched.reduce((a, t) => a + (t.length >= 9 ? 1.5 : 1), 0)
    scores.set(rule.intent, { score: prev.score + weight, matched: [...prev.matched, ...matched] })
  }

  if (scores.size === 0) {
    return { intent: 'GENERAL', confidence: 0.3, matched: [] }
  }

  const ranked = [...scores.entries()].sort((a, b) => {
    const bump = (intent: AiIntent, score: number) => score + (GENERIC.includes(intent) ? 0 : 3)
    return bump(b[0], b[1].score) - bump(a[0], a[1].score)
  })
  const [intent, data] = ranked[0]
  const confidence = Math.min(0.95, 0.45 + data.score * 0.12)
  return { intent, confidence: Math.round(confidence * 100) / 100, matched: data.matched }
}

/** Tokens útiles del texto (sin palabras vacías), para el retrieval de evidencia. */
export function queryTokens(input: string): string[] {
  const text = normalize(input)
  const words = text.split(' ').filter(w => w.length >= 3 && !STOPWORDS.has(w))
  const out = new Set<string>(words)
  // Plural → singular ("proteínas" → "proteina"): las fuentes suelen estar en singular.
  for (const w of words) {
    if (w.length > 4 && w.endsWith('s')) { out.add(w.slice(0, -1)) }
  }
  return [...out]
}
