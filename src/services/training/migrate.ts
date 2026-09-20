// Migración legacy → modelo oficial (§41). COPIA sin borrar: sessions/setLogs quedan intactos.
import { db } from '@/services/storage/db';
import { setRecordIdFor } from './domain';
import type { TrainingSession, SessionExercise, SetRecord, PostWorkoutSurvey } from './domain';
import type { Session as LegacySession, SetLog as LegacySetLog } from '@/types';

interface LegacyTrainingSessionWithSurvey extends TrainingSession {
  energy?: number;
  fatigue?: number;
  pain?: number;
  mood?: number;
  motivation?: number;
  effort?: number;
  stress?: number;
  painZone?: string;
  painDetail?: string;
  surveyId?: string;
}

export interface MigrationReport {
  sessionsCopied: number;
  sessionsSkipped: number;
  setRecordsCopied: number;
  setRecordsSkipped: number;
  surveysBackfilled: number;
  integrityOk: boolean;
  details: string[];
}

export async function migrateLegacyTrainingData(): Promise<MigrationReport> {
  const rep: MigrationReport = {
    sessionsCopied: 0, sessionsSkipped: 0, setRecordsCopied: 0, setRecordsSkipped: 0,
    surveysBackfilled: 0, integrityOk: true, details: [],
  };
  // 1) sessions -> trainingSessions (estado final según finishedAt)
  const legacySessions = await db.sessions.toArray().catch(() => []) as LegacySession[];
  for (const ls of legacySessions) {
    const id = String(ls.id ?? '');
    if (!id) {continue;}
    const exists = await db.trainingSessions.get(id).catch(() => null);
    if (exists) { rep.sessionsSkipped++; continue; }
    const finished = typeof ls.finishedAt === 'string' ? ls.finishedAt : undefined;
    await db.trainingSessions.put({
      id, sessionId: id, userId: 'me', routineId: String(ls.routineId ?? 'legacy'),
      plannedDay: null, actualDay: null, calendarDate: String(ls.localDate ?? ''),
      sessionStatus: finished ? 'COMPLETED' : 'ABANDONED',
      startedAt: typeof ls.startedAt === 'string' ? ls.startedAt : undefined,
      completedAt: finished, endedAt: finished ?? undefined,
      migratedFrom: 'sessions',
      createdAt: String(ls.createdAt ?? new Date().toISOString()),
      updatedAt: String(ls.updatedAt ?? new Date().toISOString()),
    } as TrainingSession);
    rep.sessionsCopied++;
  }
  // 2) setLogs -> setRecords (+ SessionExercise contenedor por (sessionId, exerciseId))
  const legacyLogs = await db.setLogs.toArray().catch(() => []) as LegacySetLog[];
  const seCache = new Map<string, string>(); // `${sessionId}|${exerciseId}` -> sessionExerciseId
  const ensureSE = async (sessionId: string, exerciseId: string): Promise<string> => {
    const key = `${sessionId}|${exerciseId}`;
    const hit = seCache.get(key);
    if (hit) {return hit;}
    const rows = await db.sessionExercises.where('sessionId').equals(sessionId).toArray().catch(() => [])
    const found = rows.find((r) => String(r.exerciseId) === exerciseId);
    if (found && typeof found.sessionExerciseId === 'string') { seCache.set(key, found.sessionExerciseId); return found.sessionExerciseId; }
    const { v4: uuid } = await import('uuid');
    const seId = uuid();
    const now = new Date().toISOString();
    await db.sessionExercises.put({
      sessionExerciseId: seId, sessionId, exerciseId, order: rows.length,
      planned: false, completed: true, status: 'EXTRA',
      plannedSetCount: 0, actualSetCount: 0, plannedSets: [],
      migratedFrom: 'setLogs', createdAt: now, updatedAt: now,
    } as SessionExercise);
    seCache.set(key, seId);
    return seId;
  };
  for (const l of legacyLogs) {
    const sessionId = String(l.sessionId ?? '');
    const exerciseId = String(l.exerciseId ?? '');
    const order = Number(l.setNumber ?? 0);
    if (!sessionId || !exerciseId || !order) { rep.setRecordsSkipped++; continue; }
    const seId = await ensureSE(sessionId, exerciseId);
    const setRecordId = setRecordIdFor(seId, order);
    const exists = await db.setRecords.get(setRecordId).catch(() => null);
    if (exists) { rep.setRecordsSkipped++; continue; }
    const createdAt = typeof l.createdAt === 'string' ? l.createdAt : new Date().toISOString();
    await db.setRecords.put({
      setRecordId, sessionId, sessionExerciseId: seId, exerciseId, order,
      setType: 'NORMAL',
      plannedReps: Number(l.reps ?? 0), plannedWeight: Number(l.weight ?? 0),
      actualReps: Number(l.reps ?? 0), actualWeight: Number(l.weight ?? 0),
      status: l.completed ? 'COMPLETED' : 'SKIPPED',
      observation: typeof l.notes === 'string' ? l.notes : undefined,
      completedAt: l.completed ? createdAt : undefined,
      migratedFrom: 'setLogs', legacyId: l.id,
      createdAt, updatedAt: createdAt,
    } as SetRecord);
    rep.setRecordsCopied++;
  }
  // 3) encuestas inline en trainingSessions -> postWorkoutSurveys (una sola fuente)
  const sessionsWithInline = await db.trainingSessions.toArray().catch(() => []) as LegacyTrainingSessionWithSurvey[];
  for (const s of sessionsWithInline) {
    if (s.surveyId) {continue;}
    if (typeof s.energy !== 'number' && typeof s.fatigue !== 'number') {continue;}
    const { v4: uuid } = await import('uuid');
    const surveyId = uuid();
    await db.postWorkoutSurveys.put({
      surveyId, sessionId: String(s.sessionId ?? s.id ?? ''),
      userId: 'me', calendarDate: String(s.calendarDate ?? ''),
      energy: Number(s.energy ?? 5), fatigue: Number(s.fatigue ?? 5),
      pain: Number(s.pain ?? 0), mood: Number(s.mood ?? 5),
      motivation: Number(s.motivation ?? 5),
      perceivedExertion: Number(s.effort ?? 5),
      stress: Number(s.stress ?? 5),
      painArea: String(s.painZone ?? ''),
      painObservation: String(s.painDetail ?? ''),
      createdAt: new Date().toISOString(),
    } as PostWorkoutSurvey);
    await db.trainingSessions.put({ ...s, surveyId, updatedAt: new Date().toISOString() });
    rep.surveysBackfilled++;
  }
  // 4) integridad: setRecords huérfanos (sin sessionExercise) y conteos
  const orphans = await db.setRecords.toArray().catch(() => [])
  let orphanCount = 0;
  for (const r of orphans) {
    const se = await db.sessionExercises.get(String(r.sessionExerciseId)).catch(() => null);
    if (!se) {orphanCount++;}
  }
  if (orphanCount > 0) { rep.integrityOk = false; rep.details.push(`setRecords huérfanos: ${orphanCount}`); }
  rep.details.push(`sessions: ${rep.sessionsCopied} copiadas, ${rep.sessionsSkipped} ya existían`);
  rep.details.push(`setRecords: ${rep.setRecordsCopied} copiados, ${rep.setRecordsSkipped} omitidos`);
  rep.details.push(`surveys backfill: ${rep.surveysBackfilled}`);
  try { localStorage.setItem('althea:migration:v5', JSON.stringify({ at: new Date().toISOString(), ...rep, details: undefined })); } catch { /* noop */ }
  return rep;
}

export function wasMigratedV5(): boolean {
  try { return !!localStorage.getItem('althea:migration:v5'); } catch { return false; }
}
