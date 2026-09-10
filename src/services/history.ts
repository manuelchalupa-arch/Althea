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

// Lectura unificada: SetRecord oficial + setLogs legacy (solo-lectura). Clave: userId+exerciseId.
export async function unifiedCompletedSets(exerciseId: string): Promise<Array<{ setNumber: number; weight: number; reps: number; completed: boolean; createdAt: string; sessionId: string }>> {
  const [official, legacy] = await Promise.all([
    db.table('setRecords').where('exerciseId').equals(exerciseId).filter((r: { status: string }) => r.status === 'COMPLETED').toArray().catch(() => []),
    db.setLogs.where('exerciseId').equals(exerciseId).filter(l => l.completed).toArray().catch(() => []),
  ]);
  const a = (official as Array<Record<string, unknown>>).map((r) => ({
    setNumber: Number(r.order ?? 0), weight: Number(r.actualWeight ?? 0), reps: Number(r.actualReps ?? 0),
    completed: true, createdAt: String(r.completedAt ?? r.createdAt ?? ''), sessionId: String(r.sessionId ?? ''),
  }));
  const b = (legacy as Array<{ setNumber: number; weight: number; reps: number; completed: boolean; createdAt: string; sessionId: string }>).map((l) => ({
    setNumber: l.setNumber, weight: l.weight, reps: l.reps, completed: l.completed, createdAt: l.createdAt, sessionId: l.sessionId,
  }));
  return [...a, ...b];
}

export async function getLastExecutionByExercise(exerciseId: string){
  // última sesión donde se completó al menos una serie de ese ejercicio
  const logs = await unifiedCompletedSets(exerciseId)
  if(logs.length===0) return null
  // agrupa por sessionId + createdAt para encontrar última ejecución
  logs.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const lastDate = logs[0].createdAt.slice(0,10)
  // todos los sets de esa última fecha
  const lastSets = logs.filter(l=> l.createdAt.slice(0,10)===lastDate).sort((a,b)=> a.setNumber - b.setNumber)
  return {
    date: lastDate,
    timestamp: logs[0].createdAt,
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

export async function getLastSerie(exerciseId: string, setNumber: number){
  const logs = (await unifiedCompletedSets(exerciseId)).filter(l=> l.setNumber===setNumber)
  if(logs.length===0) return generateSeedSerie(exerciseId, setNumber) as any
  logs.sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return logs[0] // {weight, reps, createdAt}
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
