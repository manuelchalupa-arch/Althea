import { describe, it, expect } from 'vitest'
import { buildUnifiedSystemPrompt, validateUnifiedAnswer, type UnifiedContext } from './unifiedPipeline'
import type { EvidenceHit } from './evidence'

const hit: EvidenceHit = {
  source: {
    id: 'method-hipertrofia',
    organization: 'ACSM',
    title: 'Volumen de entrenamiento',
    topics: ['hipertrofia'],
    evidence: 'strong',
    claims: ['10-20 series semanales por grupo muscular'],
    citationLabel: 'ACSM (2011)',
  },
  score: 2,
  matchedClaims: ['10-20 series semanales por grupo muscular'],
}

const baseCtx = {
  intent: 'GENERAL',
  intentResult: { intent: 'GENERAL', confidence: 0.8 },
  context: {},
  evidence: [hit],
  safety: { requiresProfessional: false, severity: 'info', message: '' },
  goalLogic: {},
  tone: 'ABUELITOS',
} as unknown as UnifiedContext

describe('buildUnifiedSystemPrompt', () => {
  it('separa datos personales de conocimiento general', () => {
    const prompt = buildUnifiedSystemPrompt(baseCtx)
    expect(prompt).toContain('DATOS DEL USUARIO')
    expect(prompt).toContain('CONOCIMIENTO GENERAL Y CIENTÍFICO')
    expect(prompt).toContain('NUNCA estimes, completes ni inventes')
    expect(prompt).toContain('CONTEXTO REAL DEL USUARIO')
    expect(prompt).toContain('[method-hipertrofia]')
  })

  it('incluye diario nutricional, recuperación y evolución de medidas reales', () => {
    const context = {
      ...baseCtx.context,
      nutriDaily: { diarioCount: 2, calendario: 'no', objetivo: 'hipertrofia', ultimoAlimento: 'Avena' },
      nutritionContext: {
        weight: 80, height: 180, bmi: 24.7, bmiCategory: 'normal',
        activityLevel: 'moderado', estimatedBMR: 1700, estimatedTDEE: 2600,
        calorieGoal: 2400, weightHistory: [], nutritionPreferences: ['sin lactosa'],
        foodLogCount: 2,
      },
      bodyMeasurements: [
        { date: '2026-10-01', weightKg: 82, waistCm: 88 },
        { date: '2026-11-20', weightKg: 80, bodyFatPct: 18, muscleMassKg: 38, waistCm: 85 },
      ],
      recovery: { lastScore: 82, trend: 'estable', consecutiveLow: 0 },
      mapaMuscular: 'Pecho alto; espalda media',
      sueno: '7.5h',
      energia: '8/10',
    }
    const prompt = buildUnifiedSystemPrompt({ ...baseCtx, context } as unknown as UnifiedContext)
    expect(prompt).toContain('Diario nutricional de hoy: 2 registros')
    expect(prompt).toContain('Última medición corporal (2026-11-20)')
    expect(prompt).toContain('grasa corporal 18%')
    expect(prompt).toContain('Evolución de peso')
    expect(prompt).toContain('Recuperación: 82/100')
    expect(prompt).toContain('Mapa muscular (últimos 30 días)')
  })

  it('sin evidencia igual habilita conocimiento general y evita inventar citas', () => {
    const prompt = buildUnifiedSystemPrompt({ ...baseCtx, evidence: [] } as unknown as UnifiedContext)
    expect(prompt).toContain('Sin evidencia recuperada')
    expect(prompt).toContain('Aunque no haya evidencia listada, respondé')
    expect(prompt).toContain('no inventes citas')
  })
})

describe('validateUnifiedAnswer', () => {
  it('acepta la cita por id y la reescribe como [1]', () => {
    const out = validateUnifiedAnswer('10-20 series por grupo [method-hipertrofia].', [hit])
    expect(out.text).toBe('10-20 series por grupo [1].')
    expect(out.sourcesUsed.map(s => s.id)).toEqual(['method-hipertrofia'])
  })

  it('acepta la cita numérica según el orden de la evidencia', () => {
    const out = validateUnifiedAnswer('La evidencia lo respalda [1].', [hit])
    expect(out.text).toBe('La evidencia lo respalda [1].')
    expect(out.sourcesUsed.map(s => s.id)).toEqual(['method-hipertrofia'])
  })

  it('elimina citas de fuentes que no fueron recuperadas', () => {
    const out = validateUnifiedAnswer('Una afirmación [fuente:inventada] y otra [9].', [hit])
    expect(out.text).not.toContain('inventada')
    expect(out.sourcesUsed).toHaveLength(0)
  })
})
