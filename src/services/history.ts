import { db } from '@/services/storage/db'

// Esquema NoSQL (Dexie) — agnóstico a rutina
// setLogs: { id, sessionId, exerciseId (ID_ejercicio PK), setNumber, weight, reps, completed, createdAt, updatedAt }
// Índice: exerciseId + createdAt (para última ejecución)
// Rutina/ciclo/semana NO son FK de setLogs — solo sessionId es referencia opcional para agrupar, no para filtrar historial

// Relacional equivalente:
// CREATE TABLE exercise_history (
//   id TEXT PRIMARY KEY,
//   exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
//   set_number INT NOT NULL,
//   weight REAL NOT NULL,
//   reps INT NOT NULL,
//   completed BOOLEAN NOT NULL,
//   executed_at TIMESTAMPTZ NOT NULL,
//   session_id TEXT,
//   UNIQUE(exercise_id, executed_at, set_number)
// );
// CREATE INDEX idx_exercise_executed ON exercise_history(exercise_id, executed_at DESC);

// ---- Lectura unificada con deduplicación central (FASE 2) ----
// SetRecord oficial + setLogs legacy (solo-lectura). La migración copia
// legacy→oficial sin borrar, por lo que la misma serie puede existir en
// ambas tablas: aquí se cuenta una sola vez.
//
// Identidad determinista (orden de preferencia):
//  1. setRecordId explícito (oficial) o id legacy;
//  2. sesión + ejercicio + orden de serie;
//  3. ejercicio + fecha + orden + sesión.
// NUNCA se fusiona por coincidencia de peso/repeticiones: dos series
// reales idénticas en distinto orden son registros distintos.
export interface UnifiedSet {
  setRecordId: string
  sessionId: string
  exerciseId: string
  order: number
  weight: number
  reps: number
  date: string
  timestamp: string
  source: 'official' | 'legacy'
}

export function dedupeUnifiedSets(items: UnifiedSet[]): UnifiedSet[] {
  const seen = new Set<string>()
  const out: UnifiedSet[] = []
  // Oficial primero: ante colisión se conserva el registro canónico.
  const sorted = items.slice().sort((a, b) => (a.source === b.source ? 0 : a.source === 'official' ? -1 : 1))
  for (const s of sorted) {
    const keys = [
      s.setRecordId ? `id:${s.setRecordId}` : '',
      s.sessionId && s.exerciseId ? `se:${s.sessionId}|${s.exerciseId}|${s.order}` : '',
      `dx:${s.exerciseId}|${s.date}|${s.order}|${s.sessionId}`,
    ].filter(Boolean)
    if (keys.some(k => seen.has(k))) { continue }
    keys.forEach(k => seen.add(k))
    out.push(s)
  }
  return out
}

async function fetchUnifiedSets(exerciseId?: string, includeDemo = false): Promise<UnifiedSet[]> {
  const [official, legacy] = await Promise.all([
    (exerciseId
      ? db.setRecords.where('exerciseId').equals(exerciseId)
      : db.setRecords.toCollection()
    ).filter((r: { status: string; isDemo?: boolean }) => r.status === 'COMPLETED' && (includeDemo || r.isDemo !== true)).toArray().catch(() => []),
    (exerciseId
      ? db.setLogs.where('exerciseId').equals(exerciseId)
      : db.setLogs.toCollection()
    ).filter(l => l.completed).toArray().catch(() => []),
  ]);
  const a = (official as Array<Record<string, unknown>>).map((r) => ({
    setRecordId: String(r.setRecordId ?? ''),
    sessionId: String(r.sessionId ?? ''),
    exerciseId: String(r.exerciseId ?? ''),
    order: Number(r.order ?? 0),
    weight: Number(r.actualWeight ?? 0), reps: Number(r.actualReps ?? 0),
    date: String(r.completedAt ?? r.createdAt ?? '').slice(0, 10),
    timestamp: String(r.completedAt ?? r.createdAt ?? ''),
    source: 'official' as const,
  }));
  const b = (legacy as Array<Record<string, unknown>>).map((l) => ({
    setRecordId: String(l.id ?? ''),
    sessionId: String(l.sessionId ?? ''),
    exerciseId: String(l.exerciseId ?? ''),
    order: Number(l.setNumber ?? 0),
    weight: Number(l.weight ?? 0), reps: Number(l.reps ?? 0),
    date: String(l.createdAt ?? '').slice(0, 10),
    timestamp: String(l.createdAt ?? ''),
    source: 'legacy' as const,
  }));
  return dedupeUnifiedSets([...a, ...b]);
}

// Lectura unificada: SetRecord oficial + setLogs legacy (solo-lectura). Clave: userId+exerciseId.
export async function unifiedCompletedSets(exerciseId: string): Promise<Array<{ setNumber: number; weight: number; reps: number; completed: boolean; createdAt: string; sessionId: string }>> {
  const sets = await fetchUnifiedSets(exerciseId)
  return sets.map((s) => ({
    setNumber: s.order, weight: s.weight, reps: s.reps,
    completed: true, createdAt: s.timestamp, sessionId: s.sessionId,
  }));
}

// Lectura unificada global (todos los ejercicios), deduplicada.
export async function unifiedAllCompletedSets(): Promise<Array<{ exerciseId: string; weight: number; reps: number; createdAt: string; sessionId: string; setNumber: number }>> {
  const sets = await fetchUnifiedSets()
  return sets
    .filter(s => s.exerciseId && s.timestamp)
    .map((s) => ({
      exerciseId: s.exerciseId, weight: s.weight, reps: s.reps,
      createdAt: s.timestamp, sessionId: s.sessionId, setNumber: s.order,
    }));
}

export async function getLastExecutionByExercise(exerciseId: string){
  // Última ejecución REAL: agrupa por sesión y elige la sesión con
  // timestamp máximo. Dos sesiones del mismo día siguen separadas.
  const logs = await unifiedCompletedSets(exerciseId)
  if(logs.length===0) {return null}
  const bySession = new Map<string, typeof logs>()
  for (const l of logs) {
    const key = l.sessionId || `date:${l.createdAt.slice(0, 10)}`
    const arr = bySession.get(key) || []
    arr.push(l)
    bySession.set(key, arr)
  }
  let best: typeof logs | null = null
  let bestTs = ''
  for (const arr of bySession.values()) {
    const ts = arr.map(x => x.createdAt).sort().reverse()[0] || ''
    if (!best || ts > bestTs) { best = arr; bestTs = ts }
  }
  const lastSets = (best || []).slice().sort((a,b)=> a.setNumber - b.setNumber)
  const first = lastSets[0]
  const sessionId = first?.sessionId || ''
  return {
    date: bestTs.slice(0,10),
    timestamp: bestTs,
    sessionId,
    sets: lastSets.map(s=> ({ setNumber: s.setNumber, weight: s.weight, reps: s.reps, completed: s.completed }))
  }
}

export function generateSeedSerie(exerciseId: string, setNumber: number){
  // Seed determinístico por ID_ejercicio + setNumber, siempre múltiplos de 5 en kilogramos
  const hash = Array.from(exerciseId).reduce((a,c)=> a + c.charCodeAt(0), 0) + setNumber*7
  const base = 20 + (hash % 12)*5 // 20..80 múltiplo 5
  const weight = Math.round(base/5)*5
  const reps = 8 + (hash % 5) // 8-12
  return { weight, reps, createdAt: new Date(Date.now() - 86400000).toISOString(), isSeed: true }
}

export async function getLastSerieWithSource(exerciseId: string, setNumber: number){
  const logs = (await unifiedCompletedSets(exerciseId)).filter(l=> l.setNumber===setNumber)
  if(logs.length===0){
    const seed = generateSeedSerie(exerciseId, setNumber)
    return { ...seed, isSeed: true, source: 'seed' }
  }
  logs.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return { ...logs[0], isSeed: false, source: 'real' }
}

// Para Prueba A/B/C: no se borra al cambiar/eliminar rutina — routineId no es parte de la query
export async function countHistory(exerciseId: string){
  return db.setLogs.where('exerciseId').equals(exerciseId).count()
}

// Reinicio SELECTIVO del historial de entrenamiento.
// Borra solo ejecución de sesiones (oficial + legacy). No toca perfil, rutinas,
// nutrición, recuperación, hidratación, sueño, coach ni configuración.
// Requiere confirmación explícita en UI antes de llamar.
export const TRAINING_HISTORY_TABLES = [
  'trainingSessions', 'sessionExercises', 'setRecords', 'sessionEvents',
  'postWorkoutSurveys', 'negativeSets', 'exerciseObservations',
  'sessions', 'setLogs', 'exerciseRecords',
] as const

export async function resetTrainingHistory(): Promise<void> {
  for (const t of TRAINING_HISTORY_TABLES) {
    await db.table(t).clear().catch(() => {})
  }
}

// Formato unificado para PR service: weight, reps, date, setRecordId.
export async function unifiedSetsForPR(exerciseId: string): Promise<Array<{ weight: number; reps: number; date: string; setRecordId: string; order?: number; sessionId: string }>> {
  const sets = await fetchUnifiedSets(exerciseId)
  return sets
    .filter(s => s.weight > 0 && s.reps > 0 && s.date)
    .map((s) => ({
      weight: s.weight, reps: s.reps, date: s.date,
      setRecordId: s.setRecordId, order: s.order, sessionId: s.sessionId,
    }))
}
