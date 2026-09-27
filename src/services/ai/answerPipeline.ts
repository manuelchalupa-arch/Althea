// PIPELINE DE RESPUESTA DEL COACH — orquestación real:
//
//   Usuario → Intent Router → Context Builder → Evidence Retriever
//           → (LLM con evidencia) → Validator → respuesta + sourcesUsed[]
//
// Sin red (o con forceLocal) el mismo pipeline cierra con el motor local:
// biblioteca de evidencia + datos reales del usuario, y si no hay evidencia
// lo dice. Nunca inventa una fuente ni un dato.

import { buildChatContext } from './chatContext'
import { routeIntent, type AiIntent, type IntentResult } from './intentRouter'
import {
  evidenceForPrompt,
  retrieveEvidence,
  type EvidenceHit,
  type EvidenceSource,
} from './evidence'
import { buildLocalCoachReply } from './chatLocalFallback'
import { todayKey } from '@/utils/dates'

export interface AnswerPreparation {
  intent: AiIntent
  intentResult: IntentResult
  /** Datos reales del usuario, en texto, listos para el prompt. */
  context: string
  /** Fuentes candidatas recuperadas para esta consulta. */
  hits: EvidenceHit[]
}

export interface ValidatedAnswer {
  text: string
  /** Fuentes realmente citadas en la respuesta (subconjunto de las recuperadas). */
  sourcesUsed: EvidenceSource[]
}

async function intentContext(intent: AiIntent): Promise<string[]> {
  const lines: string[] = []
  try {
    if (intent === 'NUTRITION' || intent === 'MEAL_LOG') {
      const { getDiaryEntries } = await import('@/services/storage/diaryStore')
      const entries = await getDiaryEntries(todayKey())
      if (entries.length > 0) {
        const kcal = entries.reduce((a, e) => a + (e.macros?.calories ?? 0), 0)
        const prot = entries.reduce((a, e) => a + (e.macros?.proteins ?? 0), 0)
        lines.push(`Comidas de hoy: ${entries.length} (${entries.map(e => e.name).slice(0, 6).join(', ')})`)
        lines.push(`Totales de hoy: ${Math.round(kcal)} kcal · ${Math.round(prot)} g de proteína`)
      } else {
        lines.push('Comidas de hoy: ninguna registrada todavía')
      }
    }
    if (intent === 'HYDRATION') {
      const { getBottleDailySummary, getCalculatedHydrationGoal } = await import('@/services/recovery/hydrationBottles')
      const [summary, goal] = await Promise.all([
        getBottleDailySummary().catch(() => null),
        getCalculatedHydrationGoal().catch(() => 0),
      ])
      if (summary) {
        lines.push(`Hidratación de hoy: ${summary.totalMl} ml${goal > 0 ? ` de ${goal} ml` : ''}`)
      }
    }
    if (intent === 'PROGRESS' || intent === 'BODY_MEASUREMENTS') {
      const { db } = await import('@/services/storage/db')
      const rows = await db.bodyMeasurements.toArray().catch(() => [])
      const valid = rows
        .filter(r => !r.isDemo && typeof r.weightKg === 'number')
        .sort((a, b) => String(a.localDate).localeCompare(String(b.localDate)))
      if (valid.length > 0) {
        const last = valid[valid.length - 1]
        lines.push(`Último peso registrado: ${last.weightKg} kg (${last.localDate})`)
        lines.push(`Mediciones registradas: ${valid.length}`)
      }
    }
  } catch { /* el contexto opcional nunca rompe la respuesta */ }
  return lines
}

/**
 * Paso 1-3 del pipeline: intención, contexto del usuario y evidencia.
 * Determinista y offline-safe: no llama al LLM.
 */
export async function prepareAnswer(text: string, page: string): Promise<AnswerPreparation> {
  const intentResult = routeIntent(text)
  const baseContext = await buildChatContext(page).catch(() => '')
  const extra = await intentContext(intentResult.intent)
  const context = [baseContext, ...extra].filter(Boolean).join('\n')
  const hits = retrieveEvidence({ intent: intentResult.intent, query: text, limit: 3 })
  return { intent: intentResult.intent, intentResult, context, hits }
}

/**
 * Prompt del sistema con contexto + evidencia. Instruye a citar con [id] sólo
 * las fuentes entregadas; el Validator descarta cualquier otra.
 */
export function buildSystemPrompt(prep: AnswerPreparation): string {
  const rules = `Especialización: ${prep.intent} (confianza ${prep.intentResult.confidence}).

EVIDENCIA RECUPERADA (única permitida para fundamentar):
${evidenceForPrompt(prep.hits)}

REGLAS DE EVIDENCIA:
- Solo podés apoyarte en las fuentes listadas arriba. Si algo no está ahí, decí
  que no tenés evidencia para eso: NO inventes estudios, cifras ni fuentes.
- Cuando uses una afirmación de esas fuentes, cerrá el párrafo con su marca
  [1], [2]… en el mismo orden en que las listé.
- Si no usaste ninguna fuente, no cites ninguna.
- Los datos del usuario son datos propios, no necesitan cita.`

  const contextBlock = prep.context
    ? `CONTEXTO REAL DEL USUARIO:\n${prep.context}\n\nUsá estos datos para personalizar la respuesta.`
    : 'CONTEXTO REAL DEL USUARIO: sin datos disponibles todavía (no asumas valores).'

  return `${rules}\n\n${contextBlock}`
}

const MARKER_RE = /\[(?:fuente:)?([a-z0-9][a-z0-9-]*)\]/gi

/**
 * Validator: la respuesta solo puede reportar como usadas fuentes que fueron
 * realmente recuperadas. Reescribe las marcas [id] como [n] y elimina las que
 * apunten a fuentes inexistentes (el modelo no puede citar lo que no recibió).
 */
export function validateAnswer(rawText: string, hits: EvidenceHit[]): ValidatedAnswer {
  const allowed = new Map(hits.map(h => [h.source.id.toLowerCase(), h.source]))
  const used: EvidenceSource[] = []
  const index = new Map<string, number>()

  let text = rawText.replace(MARKER_RE, (full, id: string) => {
    const source = allowed.get(id.toLowerCase())
    if (!source) { return '' }
    if (!index.has(source.id)) {
      used.push(source)
      index.set(source.id, used.length)
    }
    return `[${index.get(source.id)}]`
  })

  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, sourcesUsed: used }
}

export interface LocalAnswer extends ValidatedAnswer {
  source: 'local'
}

/**
 * Respuesta local (sin red): datos reales del usuario + evidencia de la
 * biblioteca. Si no hay evidencia para la consulta lo declara en vez de
 * inventar una.
 */
export async function composeLocalAnswer(
  text: string,
  prep: AnswerPreparation
): Promise<LocalAnswer> {
  const reply = await buildLocalCoachReply(text)
  const parts = [reply.text]

  if (prep.hits.length > 0) {
    parts.push('', 'Evidencia de la biblioteca de Althea:')
    prep.hits.forEach((h, i) => {
      const claim = h.matchedClaims[0]
      if (claim) { parts.push(`- ${claim} [${h.source.id}]`) }
      else { parts.push(`- ${h.source.title} (${h.source.evidence}) [${h.source.id}]`) }
    })
  } else {
    parts.push('', 'No tengo evidencia en la biblioteca para esa consulta, así que no te doy una respuesta inventada.')
  }

  return { ...validateAnswer(parts.join('\n'), prep.hits), source: 'local' }
}
