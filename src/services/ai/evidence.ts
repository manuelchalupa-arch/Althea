// CAPA DE EVIDENCIA — biblioteca real de fuentes + retrieval por consulta.
//
// Reglas de producto que este módulo garantiza:
//  - NO inventa fuentes: todo sale de colecciones que ya existen en la app
//    (SCIENTIFIC_SOURCES, documentos de knowledge/, evidencia de métodos de
//    nutrición). Agregar una fuente nueva es agregarla a esas colecciones.
//  - Cada fuente trae los claims (fragmentos) que pueden sostener una respuesta;
//    el retrieval devuelve solo las fuentes que realmente matchean la consulta.
//  - La respuesta final registra sourcesUsed[] = estas fuentes citadas, nunca
//    el listado completo de "todas las fuentes".

import { SCIENTIFIC_SOURCES } from './metExpenditure'
import { NUTRITION_METHODS } from './nutritionMethodsDB'
import knowledgeIndex from '@/data/knowledge/index'
import { queryTokens, type AiIntent } from './intentRouter'

/** Fuente citable. `url` es opcional: las citas bibliográficas no siempre tienen. */
export interface EvidenceSource {
  id: string
  organization: string
  title: string
  url?: string
  domain?: string
  topics: string[]
  /** Nivel de evidencia declarado por la fuente ("strong", "Guideline"...). */
  evidence: string
  /** Fragmentos reales de la fuente que se pueden usar como fundamento. */
  claims: string[]
  version?: string
  /** Cómo se cita en la respuesta visible. */
  citationLabel: string
}

export interface EvidenceHit {
  source: EvidenceSource
  score: number
  /** Claims de esa fuente que matchearon la consulta. */
  matchedClaims: string[]
}

interface KnowledgeDoc {
  id: string
  title: string
  source: string
  author?: string
  date?: string
  topic: string
  evidenceLevel: string
  chunks: Array<{ content: string; tags?: string[]; citation?: string }>
}

function domainOf(url?: string): string | undefined {
  if (!url) { return undefined }
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return undefined }
}

function buildLibrary(): EvidenceSource[] {
  const out: EvidenceSource[] = []

  // 1) Fuentes científicas con URL (position stands, guías, compendios).
  for (const s of SCIENTIFIC_SOURCES) {
    out.push({
      id: s.id,
      organization: s.organization,
      title: s.name,
      url: s.url,
      domain: domainOf(s.url),
      topics: [s.topic],
      evidence: s.evidenceLevel,
      claims: [],
      version: s.year ? String(s.year) : undefined,
      citationLabel: `${s.organization}${s.year ? ` (${s.year})` : ''} — ${s.name}`,
    })
  }

  // 2) Documentos de la base de conocimiento: traen los claims reales.
  for (const raw of knowledgeIndex as KnowledgeDoc[]) {
    if (!raw?.id) { continue }
    const claims = (raw.chunks ?? []).map(c => c.content).filter(Boolean)
    const tags = [...new Set((raw.chunks ?? []).flatMap(c => c.tags ?? []))]
    const firstCitation = raw.chunks?.find(c => c.citation)?.citation
    out.push({
      id: raw.id,
      organization: raw.author || raw.source,
      title: raw.title,
      topics: [raw.topic, ...tags],
      evidence: raw.evidenceLevel,
      claims,
      version: raw.date,
      citationLabel: firstCitation || raw.source,
    })
  }

  // 3) Evidencia declarada por los métodos de nutrición (citas literales).
  for (const m of NUTRITION_METHODS) {
    const sources = m.evidence?.sources ?? []
    if (sources.length === 0) { continue }
    out.push({
      id: `method-${m.id}`,
      organization: m.name,
      title: m.nameEs || m.name,
      topics: ['nutrición', 'nutricion', m.category ?? '', ...((m as { goals?: string[] }).goals ?? [])],
      evidence: m.evidence?.level ?? 'expert_opinion',
      claims: m.evidence?.notesEs ? [m.evidence.notesEs] : [],
      citationLabel: sources.join(' · '),
    })
  }

  return out
}

let library: EvidenceSource[] | null = null

/** Biblioteca de evidencia cargada (idéntica en memoria, construida una vez). */
export function getEvidenceLibrary(): EvidenceSource[] {
  if (!library) { library = buildLibrary() }
  return library
}

export function getSourceById(id: string): EvidenceSource | undefined {
  return getEvidenceLibrary().find(s => s.id === id)
}

/** Etiquetas de tema que una intención del Coach activa. */
const INTENT_TOPICS: Record<AiIntent, string[]> = {
  TRAINING: ['entrenamiento', 'training', 'hypertrophy', 'strength'],
  HYPERTROPHY: ['hipertrofia', 'hypertrophy', 'entrenamiento', 'training'],
  STRENGTH: ['fuerza', 'strength', 'entrenamiento', 'training'],
  POWER: ['potencia', 'power', 'entrenamiento'],
  ENDURANCE: ['resistencia', 'endurance', 'cardio'],
  MOBILITY: ['movilidad', 'mobility', 'flexibilidad'],
  WARMUP: ['calentamiento', 'movilidad', 'mobility'],
  RECOVERY: ['recuperación', 'recuperacion', 'recovery', 'sueño', 'descanso'],
  PERIODIZATION: ['periodización', 'periodizacion', 'hipertrofia', 'fuerza'],
  EXERCISE_SELECTION: ['entrenamiento', 'training', 'biomecánica', 'biomechanics'],
  NUTRITION: ['nutrición', 'nutricion', 'nutrition', 'dieta'],
  MEAL_LOG: ['nutrición', 'nutricion', 'nutrition'],
  HYDRATION: ['hidratación', 'hidratacion', 'nutrición', 'nutrition'],
  BODY_MEASUREMENTS: ['peso', 'mediciones', 'nutrición', 'nutrition'],
  PROGRESS: ['progreso', 'entrenamiento', 'hipertrofia'],
  GENERAL: [],
}

/** Comparación sin acentos ni mayúsculas: "Proteína" matchea "proteina". */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function scoreSource(source: EvidenceSource, tokens: string[], intentTopics: string[]): { score: number; matchedClaims: string[] } {
  let score = 0
  const matchedClaims: string[] = []

  const title = norm(source.title)
  const topics = source.topics.map(t => norm(String(t)))

  for (const t of tokens) {
    if (title.includes(t)) { score += 3 }
    if (topics.some(topic => topic.includes(t))) { score += 2 }
    for (const claim of source.claims) {
      if (norm(claim).includes(t)) {
        score += 1
        if (!matchedClaims.includes(claim)) { matchedClaims.push(claim) }
      }
    }
  }

  // Alineación con la intención: la consulta de nutrición no debe traer
  // fuentes de fuerza y viceversa.
  if (intentTopics.length > 0 && topics.some(topic => intentTopics.some(it => topic.includes(norm(it))))) {
    score += 4
  }

  // Documentos con claims son más útiles que listados solo con URL.
  if (source.claims.length > 0 && score > 0) { score += 1 }

  return { score, matchedClaims }
}

/**
 * Recupera las fuentes realmente pertinentes a una consulta.
 * Devuelve [] cuando no hay evidencia: el pipeline responde con datos del
 * usuario o declara que no tiene fundamento. Nunca inventa una fuente.
 */
export function retrieveEvidence(opts: { intent: AiIntent; query: string; limit?: number }): EvidenceHit[] {
  const limit = opts.limit ?? 3
  const tokens = queryTokens(opts.query)
  const intentTopics = INTENT_TOPICS[opts.intent] ?? []

  const hits: EvidenceHit[] = []
  for (const source of getEvidenceLibrary()) {
    const { score, matchedClaims } = scoreSource(source, tokens, intentTopics)
    if (score <= 0) { continue }
    hits.push({ source, score, matchedClaims })
  }

  hits.sort((a, b) =>
    b.score - a.score ||
    b.source.claims.length - a.source.claims.length ||
    a.source.id.localeCompare(b.source.id)
  )

  const top = hits.slice(0, limit)
  // Los claims que matchearon van primero; si ninguno matcheó se usa la
  // primera parte del claim principal (la fuente sigue siendo real).
  return top.map(h => ({
    ...h,
    matchedClaims: h.matchedClaims.length > 0
      ? h.matchedClaims.slice(0, 2)
      : h.source.claims.slice(0, 1),
  }))
}

/** Fuentes reales → texto listo para el prompt del LLM. */
export function evidenceForPrompt(hits: EvidenceHit[]): string {
  if (hits.length === 0) { return 'Sin evidencia disponible para esta consulta.' }
  return hits.map((h, i) => {
    const claims = h.matchedClaims.length > 0
      ? h.matchedClaims.map(c => `  - ${c}`).join('\n')
      : '  - (sin fragmentos citables; usar solo el título/nivel de evidencia)'
    return `[${i + 1}] ${h.source.title} — ${h.source.organization} (${h.source.evidence})\n    Cita: ${h.source.citationLabel}${h.source.url ? `\n    URL: ${h.source.url}` : ''}\n${claims}`
  }).join('\n\n')
}
