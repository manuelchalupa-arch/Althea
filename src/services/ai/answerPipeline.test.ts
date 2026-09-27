import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  prepareAnswer,
  buildSystemPrompt,
  validateAnswer,
  composeLocalAnswer,
} from './answerPipeline'
import { getEvidenceLibrary, retrieveEvidence, getSourceById } from './evidence'
import { routeIntent, type AiIntent } from './intentRouter'

// Pipeline real del Coach: intención → contexto del usuario → evidencia →
// validación → respuesta con sourcesUsed[]. Nada de esto inventa fuentes.

async function clearAll() {
  await Promise.all(db.tables.map(t => t.clear()))
  localStorage.clear()
}

describe('Evidence — biblioteca real, retrieval honesto', () => {
  it('la biblioteca existe y no se modifica al recuperar', () => {
    const lib = getEvidenceLibrary()
    expect(lib.length).toBeGreaterThan(10)
    const ids = new Set(lib.map(s => s.id))
    expect(ids.size).toBe(lib.length)
    expect(getEvidenceLibrary()).toBe(lib)
  })

  it('cada fuente trae los campos mínimos citables', () => {
    for (const s of getEvidenceLibrary()) {
      expect(s.id).toBeTruthy()
      expect(s.title).toBeTruthy()
      expect(s.organization).toBeTruthy()
      expect(s.citationLabel).toBeTruthy()
      expect(s.evidence).toBeTruthy()
      expect(s.topics.length).toBeGreaterThan(0)
    }
  })

  it('la recuperación devuelve fuentes existentes, ordenadas y acotadas', () => {
    const lib = new Set(getEvidenceLibrary().map(s => s.id))
    const hits = retrieveEvidence({ intent: 'HYPERTROPHY', query: 'volumen semanal para hipertrofia', limit: 3 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThanOrEqual(3)
    for (const h of hits) {
      expect(lib.has(h.source.id)).toBe(true)
      expect(h.score).toBeGreaterThan(0)
    }
    const scores = hits.map(h => h.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('una consulta sin coincidencias no devuelve fuentes inventadas', () => {
    expect(retrieveEvidence({ intent: 'GENERAL', query: 'zxcvbnm qwerty' })).toHaveLength(0)
  })

  it('una consulta de proteínas recupera evidencia de nutrición', () => {
    const hits = retrieveEvidence({ intent: 'NUTRITION', query: '¿cuántas proteínas por kilo necesito?' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some(h => h.source.topics.some(t => /nutric|prote/i.test(t)))).toBe(true)
  })

  it('getSourceById solo resuelve ids reales', () => {
    const real = getEvidenceLibrary()[0].id
    expect(getSourceById(real)?.id).toBe(real)
    expect(getSourceById('fuente-inventada-123')).toBeUndefined()
  })
})

describe('Pipeline — intención, contexto y evidencia', () => {
  beforeEach(async () => { await clearAll() })

  it('E: una pregunta de entrenamiento recupera evidencia de entrenamiento', async () => {
    const prep = await prepareAnswer('¿Cómo aumento mi fuerza en el press banca?', 'Coach IA')
    expect(['STRENGTH', 'TRAINING', 'EXERCISE_SELECTION']).toContain(prep.intent)
    expect(prep.hits.length).toBeGreaterThan(0)
    const prompt = buildSystemPrompt(prep)
    expect(prompt).toContain(prep.hits[0].source.title)
    expect(prompt).toMatch(/NO inventes estudios|No inventes/)
    expect(prep.intentResult.confidence).toBeGreaterThan(0)
  })

  it('F: una pregunta de nutrición recupera evidencia de nutrición', async () => {
    const prep = await prepareAnswer('¿Cuántas proteínas necesito al día?', 'Coach IA')
    expect(prep.intent).toBe('NUTRITION')
    expect(prep.hits.length).toBeGreaterThan(0)
    expect(prep.hits.some(h => h.matchedClaims.length > 0 || h.source.claims.length > 0)).toBe(true)
  })

  it('G: la respuesta recibe el contexto real del usuario (no un contexto genérico)', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', age: 30, weightKg: 80, heightCm: 180,
      experienceLevel: 'intermediate',
    } as never)

    const prep = await prepareAnswer('¿Cómo aumento mi fuerza?', 'Coach IA')
    expect(prep.context).toContain('Nico')
    expect(prep.context).toContain('80')

    const prompt = buildSystemPrompt(prep)
    expect(prompt).toContain('CONTEXTO REAL DEL USUARIO')
    expect(prompt).toContain('Nico')
    expect(prompt).toContain('80')
    // La evidencia va en el prompt junto con el contexto.
    expect(prompt).toContain('EVIDENCIA RECUPERADA')
  })

  it('sin perfil no se inventa un usuario ni datos', async () => {
    const prep = await prepareAnswer('hola', 'Coach IA')
    // sin perfil no hay línea "USUARIO: …" (formatContext solo la emite con datos)
    expect(prep.context).not.toContain('USUARIO:')
    const prompt = buildSystemPrompt(prep)
    expect(prompt).toContain('CONTEXTO REAL DEL USUARIO')
    expect(prompt).not.toContain('undefined')
    expect(prompt).not.toContain('null')
  })

  it('la intención del pipeline coincide con el router', async () => {
    const texto = '¿cuánta agua debo tomar?'
    const prep = await prepareAnswer(texto, 'Coach IA')
    expect(prep.intent).toBe(routeIntent(texto).intent)
    expect(prep.intent).toBe('HYDRATION')
  })
})

describe('Validator — sourcesUsed[] es subconjunto de lo recuperado', () => {
  const hits = retrieveEvidence({ intent: 'HYPERTROPHY', query: 'volumen series hipertrofia', limit: 3 })

  it('convierte las marcas [id] en [n] y registra solo esas fuentes', () => {
    const id = hits[0].source.id
    const out = validateAnswer(`El volumen por grupo muscular importa. [${id}]`, hits)
    expect(out.sourcesUsed.map(s => s.id)).toEqual([id])
    expect(out.text).toContain('[1]')
    expect(out.text).not.toContain(id)
  })

  it('descarta fuentes que no fueron entregadas al modelo (no puede citar lo que no recibió)', () => {
    const allowed = hits[0].source.id
    const out = validateAnswer(`Lo dice [${allowed}] pero también [fuente-inventada-999].`, hits)
    expect(out.sourcesUsed.map(s => s.id)).toEqual([allowed])
    expect(out.text).toContain('[1]')
    expect(out.text).not.toContain('fuente-inventada-999')
    // una fuente real que NO estaba en los hits tampoco puede citarse
    const fuera = getEvidenceLibrary().find(s => !hits.some(h => h.source.id === s.id))!
    const out2 = validateAnswer(`Según [${fuera.id}].`, hits)
    expect(out2.sourcesUsed).toHaveLength(0)
    expect(out2.text).not.toContain(fuera.id)
  })

  it('una respuesta sin citas no registra ninguna fuente', () => {
    const out = validateAnswer('Respuesta directa sin fuentes.', hits)
    expect(out.sourcesUsed).toHaveLength(0)
    expect(out.text).toBe('Respuesta directa sin fuentes.')
  })

  it('repetir la misma marca no duplica la fuente', () => {
    const id = hits[0].source.id
    const out = validateAnswer(`Primera [${id}] y segunda [${id}].`, hits)
    expect(out.sourcesUsed).toHaveLength(1)
    expect(out.text.match(/\[1\]/g)).toHaveLength(2)
  })
})

describe('Respuesta local — evidencia + datos, o honestidad', () => {
  beforeEach(async () => { await clearAll() })

  it('con evidencia disponible la cita en el texto y la registra como usada', async () => {
    const prep = await prepareAnswer('quiero hipertrofia, ¿cuántas series por semana?', 'Coach IA')
    const answer = await composeLocalAnswer('quiero hipertrofia, ¿cuántas series por semana?', prep)
    expect(answer.source).toBe('local')
    expect(answer.sourcesUsed.length).toBeGreaterThan(0)
    expect(answer.text).toContain('[1]')
    expect(answer.text).not.toContain('undefined')
    expect(answer.text).not.toContain('null')
    for (const s of answer.sourcesUsed) {
      expect(prep.hits.some(h => h.source.id === s.id)).toBe(true)
    }
  })

  it('sin evidencia lo declara en vez de inventar una fuente', async () => {
    const prep = await prepareAnswer('zxcvbnm pregunta sin sentido', 'Coach IA')
    expect(prep.hits).toHaveLength(0)
    const answer = await composeLocalAnswer('zxcvbnm pregunta sin sentido', prep)
    expect(answer.sourcesUsed).toHaveLength(0)
    expect(answer.text).toContain('No tengo evidencia en la biblioteca')
    expect(answer.text).not.toContain('[1]')
  })
})

describe('Cobertura de intenciones en el pipeline', () => {
  it('todas las intenciones de dominio reciben evidencia cuando hay coincidencia', async () => {
    const consultas: Array<[AiIntent, string]> = [
      ['HYPERTROPHY', 'series semana hipertrofia'],
      ['STRENGTH', 'fuerza press banca'],
      ['NUTRITION', 'proteínas dieta'],
      ['RECOVERY', 'dormir recuperación'],
    ]
    for (const [intent, query] of consultas) {
      const prep = await prepareAnswer(query, 'Coach IA')
      expect(prep.intent).toBe(intent)
      expect(prep.hits.length, `${intent} debería tener evidencia`).toBeGreaterThan(0)
    }
  })
})
