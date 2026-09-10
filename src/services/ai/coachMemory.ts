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

export function saveDecision(d: Omit<CoachDecision,'id'|'createdAt'>){
  const all: CoachDecision[] = JSON.parse(localStorage.getItem(KEY)||'[]')
  const entry: CoachDecision = { ...d, id: `dec-${Date.now()}`, createdAt: new Date().toISOString() }
  all.push(entry)
  localStorage.setItem(KEY, JSON.stringify(all.slice(-200))) // límite 200
  // también intenta Dexie para persistencia extra
  try{ db.table('coachMemory').put(entry).catch(()=>{}) }catch{}
  learnFromHistory(all)
  return entry
}

export function getDecisions(): CoachDecision[]{
  try{ return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}
}

/** Fusiona Dexie + espejo local (dedupe por id). La memoria sobrevive al borrado de caché. */
export async function getAllDecisions(): Promise<CoachDecision[]> {
  const local = getDecisions()
  let stored: CoachDecision[] = []
  try {
    const rows = await db.table('coachMemory').toArray().catch(() => [])
    stored = (rows as any[]).filter((r) => r && (r.type === 'accept' || r.type === 'modify' || r.type === 'reject' || r.type === 'swap' || r.type === 'skip' || r.type === 'complete' || r.type === 'partial' || r.type === 'note') && r.date)
  } catch { /* noop */ }
  const seen = new Set(local.map((d) => d.id))
  const merged = [...local]
  for (const s of stored) {
    if (!seen.has(s.id)) merged.push(s)
  }
  return merged.sort((a, b) => (a.date < b.date ? -1 : 1))
}

const QA_KEY = 'coachQA'

export async function saveAnswer(key: string, question: string, answer: string): Promise<CoachQA> {
  const entry: CoachQA = {
    id: `qa-${key}-${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    key, question, answer: answer.slice(0, 500),
    createdAt: new Date().toISOString(),
  }
  try {
    const all = JSON.parse(localStorage.getItem(QA_KEY) || '{}')
    all[key] = entry
    localStorage.setItem(QA_KEY, JSON.stringify(all))
  } catch { /* noop */ }
  try { await db.table('coachMemory').put({ ...entry, type: 'qa' } as never) } catch { /* noop */ }
  return entry
}

export async function getAnswer(key: string): Promise<CoachQA | null> {
  try {
    const rows = await db.table('coachMemory').where('id').equals(`qa-${key}-${new Date().toISOString().slice(0, 10)}`).toArray().catch(() => [])
    if (rows.length > 0) return rows[rows.length - 1] as unknown as CoachQA
    const all = await db.table('coachMemory').toArray().catch(() => []) as any[]
    const mine = all.filter((r) => r && r.type === 'qa' && r.key === key).sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1))
    if (mine.length > 0) return mine[mine.length - 1] as unknown as CoachQA
  } catch { /* noop */ }
  try {
    const all = JSON.parse(localStorage.getItem(QA_KEY) || '{}')
    return all[key] || null
  } catch { return null }
}

export async function getAllAnswers(): Promise<Record<string, CoachQA>> {
  const out: Record<string, CoachQA> = {}
  try {
    const rows = await db.table('coachMemory').toArray().catch(() => []) as any[]
    for (const r of rows) {
      if (r && r.type === 'qa' && r.key) {
        const prev = out[r.key]
        if (!prev || String(r.date) >= String(prev.date)) out[r.key] = r as unknown as CoachQA
      }
    }
  } catch { /* noop */ }
  try {
    const local = JSON.parse(localStorage.getItem(QA_KEY) || '{}')
    for (const k of Object.keys(local)) {
      if (!out[k]) out[k] = local[k]
    }
  } catch { /* noop */ }
  return out
}

export function getPrefs(): any{
  try{ return JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')}catch{return {}}
}

function learnFromHistory(all: CoachDecision[]){
  const prefs:any = getPrefs()
  // Si rechaza 2 veces lunes por tiempo
  const lunesRechazos = all.filter(d=> d.motive?.includes('tiempo') && new Date(d.date).getDay()===1).length
  if(lunesRechazos>=2) prefs.disponibilidadLunes='reducida'
  // Si rechaza mismo ejercicio 2 veces
  const byEx:Record<string,number>={}; all.filter(d=>d.type==='reject').forEach(d=>{ if(d.exercise) byEx[d.exercise]=(byEx[d.exercise]||0)+1 })
  const frecuente = Object.entries(byEx).find(([,c])=> c>=2)
  if(frecuente) prefs.ejercicioEvitado = frecuente[0]
  // Si modifica a 30 min frecuente
  const mods30 = all.filter(d=> d.motive?.includes('30')).length
  if(mods30>=2) prefs.duracionPreferida = 30
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function getLearningInsight(): string | null {
  const prefs = getPrefs()
  if(prefs.disponibilidadLunes) return 'Noté que los lunes tenés menos tiempo — adapto próximas rutinas.'
  if(prefs.ejercicioEvitado) return `Veo que evitás ${prefs.ejercicioEvitado} — te propongo variantes equivalentes.`
  if(prefs.duracionPreferida) return 'Veo que preferís sesiones de 30 min — priorizo lo esencial.'
  return null
}
