import { db } from '@/services/storage/db'

// Memoria estructurada — no conversaciones completas, solo datos útiles.
// Decisiones + preguntas/respuestas del Coach. Dexie es fuente primaria;
// localStorage es espejo de lectura rápida (ambos se fusionan al leer).
export type CoachDecision = {
  id: string
  date: string // YYYY-MM-DD
  type: 'accept'|'modify'|'reject'|'swap'|'skip'|'complete'|'partial'|'note'
  exercise?: string
  reason?: string
  motive?: string // por qué rechazó/omitió/cambió
  contextSnapshot: any
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

const KEY = 'coachMemory'
const PREFS_KEY = 'coachPrefs'
const QA_KEY = 'coachQA'

const DECISION_TYPES = new Set(['accept','modify','reject','swap','skip','complete','partial','note'])

export async function saveDecision(d: Omit<CoachDecision,'id'|'createdAt'>): Promise<CoachDecision> {
  const entry: CoachDecision = { ...d, id: `dec-${Date.now()}`, createdAt: new Date().toISOString() }
  // Dexie es primario
  try { await db.coachMemory.put(entry) } catch { /* noop */ }
  // Espejo en localStorage
  try {
    const all: CoachDecision[] = JSON.parse(localStorage.getItem(KEY)||'[]')
    all.push(entry)
    localStorage.setItem(KEY, JSON.stringify(all.slice(-200)))
  } catch { /* noop */ }
  // Aprender de historial (lee de localStorage para prefs)
  try {
    const all: CoachDecision[] = JSON.parse(localStorage.getItem(KEY)||'[]')
    learnFromHistory(all)
  } catch { /* noop */ }
  return entry
}

export function getDecisions(): CoachDecision[] {
  try { return JSON.parse(localStorage.getItem(KEY)||'[]') } catch { return [] }
}

/** Fusiona Dexie + espejo local (dedupe por id). La memoria sobrevive al borrado de caché. */
export async function getAllDecisions(): Promise<CoachDecision[]> {
  let stored: CoachDecision[] = []
  try {
    const rows = await db.coachMemory.toArray().catch(() => [])
    stored = rows.filter((r) => {
      if (!r || !r.date) {return false}
      if (r.type === 'qa' || r.type === 'score' || r.type === 'observation') {return false}
      return DECISION_TYPES.has(r.type)
    }) as CoachDecision[]
  } catch { /* noop */ }
  // Merge con localStorage (dedupe)
  const local = getDecisions()
  const seen = new Set(stored.map(d => d.id))
  const merged = [...stored]
  for (const l of local) {
    if (!seen.has(l.id)) {merged.push(l)}
  }
  return merged.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function saveAnswer(key: string, question: string, answer: string): Promise<CoachQA> {
  const entry: CoachQA = {
    id: `qa-${key}-${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    key, question, answer: answer.slice(0, 500),
    createdAt: new Date().toISOString(),
  }
  // Dexie es primario
  try { await db.coachMemory.put({ ...entry, type: 'qa' }) } catch { /* noop */ }
  // Espejo en localStorage
  try {
    const all = JSON.parse(localStorage.getItem(QA_KEY) || '{}')
    all[key] = entry
    localStorage.setItem(QA_KEY, JSON.stringify(all))
  } catch { /* noop */ }
  return entry
}

export async function getAnswer(key: string): Promise<CoachQA | null> {
  // Dexie es primario
  try {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await db.coachMemory.where('id').equals(`qa-${key}-${today}`).toArray().catch(() => [])
    const match = rows.find(r => r && r.type === 'qa') as CoachQA | undefined
    if (match) {return match}
    // Buscar en todo el historial
    const all = await db.coachMemory.toArray().catch(() => [])
    const mine = all.filter(r => r && r.type === 'qa' && (r as CoachQA).key === key)
      .sort((a, b) => String((a as CoachQA).date) < String((b as CoachQA).date) ? -1 : 1)
    if (mine.length > 0) {return mine[mine.length - 1] as CoachQA}
  } catch { /* noop */ }
  // Fallback a localStorage
  try {
    const all = JSON.parse(localStorage.getItem(QA_KEY) || '{}')
    return all[key] || null
  } catch { return null }
}

export async function getAllAnswers(): Promise<Record<string, CoachQA>> {
  const out: Record<string, CoachQA> = {}
  // Dexie es primario
  try {
    const rows = await db.coachMemory.toArray().catch(() => [])
    for (const r of rows) {
      if (r && r.type === 'qa' && (r as CoachQA).key) {
        const qa = r as CoachQA
        const prev = out[qa.key]
        if (!prev || String(qa.date) >= String(prev.date)) {out[qa.key] = qa}
      }
    }
  } catch { /* noop */ }
  // Merge con localStorage
  try {
    const local = JSON.parse(localStorage.getItem(QA_KEY) || '{}')
    for (const k of Object.keys(local)) {
      if (!out[k]) {out[k] = local[k]}
    }
  } catch { /* noop */ }
  return out
}

export function getPrefs(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}') } catch { return {} }
}

function learnFromHistory(all: CoachDecision[]) {
  const prefs: Record<string, unknown> = getPrefs()
  const lunesRechazos = all.filter(d => d.motive?.includes('tiempo') && new Date(d.date).getDay() === 1).length
  if (lunesRechazos >= 2) {prefs.disponibilidadLunes = 'reducida'}
  const byEx: Record<string, number> = {}
  all.filter(d => d.type === 'reject').forEach(d => { if (d.exercise) {byEx[d.exercise] = (byEx[d.exercise] || 0) + 1} })
  const frecuente = Object.entries(byEx).find(([, c]) => c >= 2)
  if (frecuente) {prefs.ejercicioEvitado = frecuente[0]}
  const mods30 = all.filter(d => d.motive?.includes('30')).length
  if (mods30 >= 2) {prefs.duracionPreferida = 30}
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function getLearningInsight(): string | null {
  const prefs = getPrefs()
  if (prefs.disponibilidadLunes) {return 'Noté que los lunes tenés menos tiempo — adapto próximas rutinas.'}
  if (prefs.ejercicioEvitado) {return `Veo que evitás ${prefs.ejercicioEvitado} — te propongo variantes equivalentes.`}
  if (prefs.duracionPreferida) {return 'Veo que preferís sesiones de 30 min — priorizo lo esencial.'}
  return null
}
