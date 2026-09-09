import { db } from '@/services/storage/db'

// Memoria estructurada — no conversaciones completas, solo datos útiles
export type CoachDecision = {
  id: string
  date: string // YYYY-MM-DD
  type: 'accept'|'modify'|'reject'
  exercise?: string
  reason?: string
  motive?: string // por qué rechazó
  contextSnapshot: any
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
