import { describe, it, expect } from 'vitest'
import { routeIntent, queryTokens, AI_INTENTS, type AiIntent } from './intentRouter'

// Router de intenciones: determinista, sin red. Una intención por consulta y
// las 16 intenciones del dominio tienen al menos una frase que las activa.

describe('Intent Router — 16 intenciones de dominio', () => {
  const cases: Array<[string, AiIntent]> = [
    ['¿cómo organizo mis series y repeticiones?', 'TRAINING'],
    ['quiero hipertrofia, ¿cómo hago?', 'HYPERTROPHY'],
    ['cómo subo mi fuerza en el press banca', 'STRENGTH'],
    ['¿cómo trabajo la potencia?', 'POWER'],
    ['quiero mejorar mi resistencia corriendo', 'ENDURANCE'],
    ['¿cómo mejoro mi movilidad?', 'MOBILITY'],
    ['¿qué hago de calentamiento?', 'WARMUP'],
    ['tengo dolor de espalda', 'RECOVERY'],
    ['¿cómo armo la periodización del bloque?', 'PERIODIZATION'],
    ['¿qué ejercicio hago para pecho?', 'EXERCISE_SELECTION'],
    ['¿qué como hoy para mi dieta?', 'NUTRITION'],
    ['registrar comida del almuerzo', 'MEAL_LOG'],
    ['¿cuánta agua debo tomar?', 'HYDRATION'],
    ['quiero pesarme y ver mis medidas', 'BODY_MEASUREMENTS'],
    ['¿cómo voy con mi progreso?', 'PROGRESS'],
    ['hola, ¿qué tal?', 'GENERAL'],
  ]

  for (const [phrase, expected] of cases) {
    it(`"${phrase}" → ${expected}`, () => {
      expect(routeIntent(phrase).intent).toBe(expected)
    })
  }

  it('cubre las 16 intenciones del producto', () => {
    const found = new Set(cases.map(([, intent]) => intent))
    expect(found.size).toBe(AI_INTENTS.length)
    for (const intent of AI_INTENTS) { expect(found.has(intent)).toBe(true) }
  })

  it('es determinista: la misma frase siempre da la misma intención', () => {
    const a = routeIntent('¿cuántas proteínas necesito al día?')
    const b = routeIntent('¿cuántas proteínas necesito al día?')
    expect(a).toEqual(b)
  })

  it('una consulta de nutrición no se clasifica como entrenamiento', () => {
    expect(routeIntent('¿cuántas proteínas necesito al día?').intent).toBe('NUTRITION')
    expect(routeIntent('armame una rutina de 4 días').intent).toBe('TRAINING')
  })

  it('sin señales cae en GENERAL con confianza baja (no inventa una intención)', () => {
    const r = routeIntent('xyzw qqq')
    expect(r.intent).toBe('GENERAL')
    expect(r.confidence).toBeLessThan(0.5)
    expect(r.matched).toHaveLength(0)
  })

  it('texto vacío devuelve confianza 0', () => {
    expect(routeIntent('   ').confidence).toBe(0)
  })

  it('los tokens para retrieval excluyen palabras vacías y bajan plurales', () => {
    const tokens = queryTokens('¿cuántas proteínas necesito?')
    expect(tokens).toContain('proteinas')
    expect(tokens).toContain('proteina')
    expect(tokens).not.toContain('que')
    expect(tokens).not.toContain('las')
  })
})
