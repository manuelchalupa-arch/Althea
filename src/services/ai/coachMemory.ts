import { db } from '@/services/storage/db'

// Memoria estructurada — no conversaciones completas, solo datos útiles.
// Decisiones + preguntas/respuestas del Coach. Fuente única: Dexie.
// Clasificación obligatoria: hecho / preferencia / decisión / patrón /
// hipótesis / recomendación. Una recomendación o hipótesis NUNCA se guarda
// como hecho.
export type MemoryKind =
  | 'hecho'
  | 'preferencia'
  | 'decision'
  | 'patron'
  | 'hipotesis'
  | 'recomendacion'

export type CoachDecision = {
  id: string
  date: string // YYYY-MM-DD
  type: 'accept' | 'modify' | 'reject' | 'swap' | 'skip' | 'complete' | 'partial' | 'note'
  kind?: MemoryKind
  exercise?: string
  reason?: string
  motive?: string // por qué rechazó/omitió/cambió
  modification?: string // qué cambió el usuario (solo type 'modify')
  contextSnapshot: unknown
  createdAt: string
}

export type CoachQA = {
  id: string
  date: string
  key: string // p.ej. 'pain:hombro', 'gap:why'
  question: string
  answer: string
  createdAt: string
}

const DECISION_TYPES = new Set(['accept', 'modify', 'reject', 'swap', 'skip', 'complete', 'partial', 'note'])
const PREFS_ID = 'coach-prefs'

export function defaultKindFor(type: CoachDecision['type']): MemoryKind {
  if (type === 'complete' || type === 'partial' || type === 'note') { return 'hecho' }
  return 'decision'
}

export async function saveDecision(d: Omit<CoachDecision, 'id' | 'createdAt'>): Promise<CoachDecision> {
  const entry: CoachDecision = {
    ...d,
    kind: d.kind ?? defaultKindFor(d.type),
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }
  await db.coachMemory.put(entry)
  await learnFromHistory(await getAllDecisions())
  return entry
}

/** Solo Dexie (dedupe por id). Sin espejos. */
export async function getAllDecisions(): Promise<CoachDecision[]> {
  let stored: CoachDecision[] = []
  try {
    const rows = await db.coachMemory.toArray().catch(() => [])
    stored = rows.filter((r) => {
      if (!r || !r.date) { return false }
      if (r.type === 'qa' || r.type === 'score' || r.type === 'observation' || r.type === 'prefs') { return false }
      return DECISION_TYPES.has(r.type)
    }) as CoachDecision[]
  } catch { /* noop */ }
  return stored.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function saveAnswer(key: string, question: string, answer: string): Promise<CoachQA> {
  const entry: CoachQA = {
    id: `qa-${key}-${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    key, question, answer: answer.slice(0, 500),
    createdAt: new Date().toISOString(),
  }
  await db.coachMemory.put({ ...entry, type: 'qa' })
  return entry
}

export async function getAnswer(key: string): Promise<CoachQA | null> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await db.coachMemory.where('id').equals(`qa-${key}-${today}`).toArray().catch(() => [])
    const match = rows.find(r => r && r.type === 'qa') as CoachQA | undefined
    if (match) { return match }
    const all = await db.coachMemory.toArray().catch(() => [])
    const mine = all.filter(r => r && r.type === 'qa' && (r as CoachQA).key === key)
      .sort((a, b) => String((a as CoachQA).date) < String((b as CoachQA).date) ? -1 : 1)
    if (mine.length > 0) { return mine[mine.length - 1] as CoachQA }
  } catch { /* noop */ }
  return null
}

export async function getAllAnswers(): Promise<Record<string, CoachQA>> {
  const out: Record<string, CoachQA> = {}
  try {
    const rows = await db.coachMemory.toArray().catch(() => [])
    for (const r of rows) {
      if (r && r.type === 'qa' && (r as CoachQA).key) {
        const qa = r as CoachQA
        const prev = out[qa.key]
        if (!prev || String(qa.date) >= String(prev.date)) { out[qa.key] = qa }
      }
    }
  } catch { /* noop */ }
  return out
}

export async function getPrefs(): Promise<Record<string, unknown>> {
  try {
    const row = await db.coachMemory.get(PREFS_ID).catch(() => null) as ({ prefs?: Record<string, unknown> } | null)
    return { ...(row?.prefs || {}) }
  } catch { return {} }
}

async function savePrefs(prefs: Record<string, unknown>): Promise<void> {
  await db.coachMemory.put({
    id: PREFS_ID, type: 'prefs', date: new Date().toISOString().slice(0, 10),
    prefs, createdAt: new Date().toISOString(),
  })
}

async function learnFromHistory(all: CoachDecision[]): Promise<void> {
  const prefs: Record<string, unknown> = await getPrefs()
  const lunesRechazos = all.filter(d => d.motive?.includes('tiempo') && new Date(d.date).getDay() === 1).length
  if (lunesRechazos >= 2) { prefs.disponibilidadLunes = 'reducida' }
  const byEx: Record<string, number> = {}
  all.filter(d => d.type === 'reject').forEach(d => { if (d.exercise) { byEx[d.exercise] = (byEx[d.exercise] || 0) + 1 } })
  const frecuente = Object.entries(byEx).find(([, c]) => c >= 2)
  if (frecuente) { prefs.ejercicioEvitado = frecuente[0] }
  const swaps: Record<string, number> = {}
  all.filter(d => d.type === 'swap').forEach(d => { if (d.exercise) { swaps[d.exercise] = (swaps[d.exercise] || 0) + 1 } })
  const swapFrec = Object.entries(swaps).find(([, c]) => c >= 2)
  if (swapFrec) { prefs.sustitucionRepetida = swapFrec[0] }
  const mods30 = all.filter(d => d.motive?.includes('30')).length
  if (mods30 >= 2) { prefs.duracionPreferida = 30 }
  await savePrefs(prefs)
}

export async function getLearningInsight(): Promise<string | null> {
  const prefs = await getPrefs()
  if (prefs.disponibilidadLunes) { return 'Noté que los lunes tenés menos tiempo — adapto próximas rutinas.' }
  if (prefs.ejercicioEvitado) { return `Veo que evitás ${prefs.ejercicioEvitado} — te propongo variantes equivalentes.` }
  if (prefs.sustitucionRepetida) { return `Sustituís ${prefs.sustitucionRepetida} seguido — lo tengo en cuenta, sin cambiar tu rutina.` }
  if (prefs.duracionPreferida) { return 'Veo que preferís sesiones de 30 min — priorizo lo esencial.' }
  return null
}

export interface RepeatedDecision { exercise: string; type: string; count: number; lastDate: string }

// Repetición de decisiones (rechazos/sustituciones reiterados): alimenta
// contexto futuro, nunca modifica la rutina automáticamente.
export async function getRepeatedDecisions(minCount = 2): Promise<RepeatedDecision[]> {
  const all = await getAllDecisions()
  const acc = new Map<string, RepeatedDecision>()
  for (const d of all) {
    if (!d.exercise) { continue }
    if (d.type !== 'reject' && d.type !== 'swap' && d.type !== 'skip') { continue }
    const key = `${d.type}:${d.exercise}`
    const cur = acc.get(key) || { exercise: d.exercise, type: d.type, count: 0, lastDate: d.date }
    cur.count += 1
    if (d.date > cur.lastDate) { cur.lastDate = d.date }
    acc.set(key, cur)
  }
  return [...acc.values()]
    .filter(r => r.count >= minCount)
    .sort((a, b) => b.count - a.count || (a.lastDate < b.lastDate ? 1 : -1))
}
