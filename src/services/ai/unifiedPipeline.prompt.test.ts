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
