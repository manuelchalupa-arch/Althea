// STORE CENTRAL — única vía para mutar TrainingSession (§4, §48).
// Fuente de verdad en sesión activa: TrainingSession + SessionExercise + SetRecord (Dexie).
// activeSessionId: máximo una sesión activa por usuario (§10).
import { v4 as uuid } from 'uuid';
import { db } from '@/services/storage/db';
import {
  assertTransitionSession, setRecordIdFor,
  type SessionStatus, type SessionExerciseStatus, type SetRecordStatus, type SetType,
  type TrainingSession, type SessionExercise, type SetRecord,
  type NegativeSet, type ExerciseObservation, type ExerciseReplacement,
  type SessionEvent, type SessionEventType, type PostWorkoutSurvey,
} from './domain';

const ACTIVE_ID_KEY = 'althea:session:activeId';
const USER_ID = 'me';

export function getActiveSessionId(): string | null {
  try { return localStorage.getItem(ACTIVE_ID_KEY); } catch { return null; }
}
function setActiveSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_ID_KEY, id);
    else localStorage.removeItem(ACTIVE_ID_KEY);
  } catch { /* noop */ }
}

const FINAL_STATES: SessionStatus[] = ['COMPLETED', 'PARTIAL', 'CANCELLED', 'ABANDONED'];
const ACTIVE_STATES: SessionStatus[] = ['READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETING'];

export async function getSession(sessionId: string): Promise<TrainingSession | null> {
  const s = await db.table('trainingSessions').get(sessionId).catch(() => null);
  return (s as TrainingSession) || null;
}

export async function getActiveSession(): Promise<TrainingSession | null> {
  const id = getActiveSessionId();
  if (!id) return null;
  const s = await getSession(id);
  if (!s) { setActiveSessionId(null); return null; }
  if (FINAL_STATES.includes(s.sessionStatus)) { setActiveSessionId(null); return null; }
  return s;
}

export async function logEvent(
  sessionId: string, type: SessionEventType,
  extra?: { fromStatus?: SessionStatus; toStatus?: SessionStatus; metadata?: Record<string, unknown> },
): Promise<void> {
  const ev: SessionEvent = {
    eventId: uuid(), sessionId, type,
    fromStatus: extra?.fromStatus, toStatus: extra?.toStatus,
    timestamp: new Date().toISOString(), metadata: extra?.metadata,
  };
  await db.table('sessionEvents').put(ev as never);
}

// Crea READY. Si ya hay sesión activa, la recupera (no duplica, §10).
export async function createSession(input: {
  routineId: string; routineName?: string;
  plannedDay: number | null; plannedDayName?: string | null;
  actualDay: number | null; actualDayName?: string | null;
  calendarDate: string; cycleId?: string; weekNumber?: number;
  plannedMuscleGroups?: string[];
  dayChange?: { reason: string; comment?: string };
  plannedExercises: Array<{ exId: string; name: string; sets: number; reps: number; weight: number; muscle?: string; gifUrl?: string; routineExerciseId?: string }>;
}): Promise<TrainingSession> {
  const existing = await getActiveSession();
  if (existing) return existing;
  if (!input.routineId) throw new Error('READY sin routineId');
  const now = new Date().toISOString();
  const sessionId = uuid();
  // Dexie keyPath de trainingSessions es `id`: se duplica sessionId en id (misma identidad).
  const s: TrainingSession & { id: string } = {
    id: sessionId, sessionId, userId: USER_ID, routineId: input.routineId,
    cycleId: input.cycleId, weekNumber: input.weekNumber,
    plannedDay: input.plannedDay, plannedDayName: input.plannedDayName ?? null,
    actualDay: input.actualDay, actualDayName: input.actualDayName ?? null,
    calendarDate: input.calendarDate, routineName: input.routineName,
    sessionStatus: 'READY',
    plannedExerciseCount: input.plannedExercises.length,
    plannedSets: input.plannedExercises.reduce((a, e) => a + e.sets, 0),
    plannedMuscleGroups: input.plannedMuscleGroups ?? [],
    dayChange: input.dayChange ? { ...input.dayChange, at: now } : undefined,
    resumeCount: 0,
    createdAt: now, updatedAt: now,
  };
  await db.table('trainingSessions').put(s as never);
  // Snapshot planificado: un SessionExercise por ejercicio (la rutina original no se toca).
  for (let i = 0; i < input.plannedExercises.length; i++) {
    const p = input.plannedExercises[i];
    const se: SessionExercise = {
      sessionExerciseId: uuid(), sessionId, exerciseId: p.exId,
      routineExerciseId: p.routineExerciseId, order: i,
      planned: true, completed: false, status: 'PENDING',
      plannedSetCount: p.sets, actualSetCount: 0,
      plannedSets: Array.from({ length: p.sets }, (_, k) => ({ order: k + 1, reps: p.reps, weight: p.weight, setType: 'NORMAL' as SetType })),
      createdAt: now, updatedAt: now,
    };
    await db.table('sessionExercises').put(se as never);
    // SetRecords PENDING pre-creados con id estable (confirma = upsert, nunca duplica).
    for (const ps of se.plannedSets) {
      const rec: SetRecord = {
        setRecordId: setRecordIdFor(se.sessionExerciseId, ps.order),
        sessionId, sessionExerciseId: se.sessionExerciseId, exerciseId: p.exId,
        order: ps.order, setType: ps.setType ?? 'NORMAL',
        plannedReps: ps.reps, plannedWeight: ps.weight,
        actualReps: ps.reps, actualWeight: ps.weight,
        status: 'PENDING', createdAt: now, updatedAt: now,
      };
      await db.table('setRecords').put(rec as never);
    }
  }
  await logEvent(sessionId, 'SESSION_CREATED', { toStatus: 'READY', metadata: { plannedDay: input.plannedDay, actualDay: input.actualDay } });
  setActiveSessionId(sessionId);
  return s;
}

// ÚNICA función de transición (§4). Lanza si es inválida; registra evento; actualiza timestamps.
export async function transitionSession(
  sessionId: string, target: SessionStatus,
  opts?: { reason?: string; comment?: string },
): Promise<TrainingSession> {
  const s = await getSession(sessionId);
  if (!s) throw new Error(`Sesión inexistente: ${sessionId}`);
  assertTransitionSession(s.sessionStatus, target);
  const now = new Date().toISOString();
  const nx: TrainingSession = { ...s, sessionStatus: target, updatedAt: now };
  if (target === 'IN_PROGRESS') {
    if (!s.startedAt) nx.startedAt = now;
    nx.resumedAt = s.sessionStatus === 'PAUSED' ? now : s.resumedAt;
    if (s.sessionStatus === 'PAUSED' && s.pausedAt) {
      const pausedSec = Math.max(0, Math.round((Date.now() - new Date(s.pausedAt).getTime()) / 1000));
      nx.totalPausedDurationSec = (s.totalPausedDurationSec ?? 0) + pausedSec;
      nx.resumeCount = (s.resumeCount ?? 0) + 1;
    }
    nx.pausedAt = undefined;
  }
  if (target === 'PAUSED') nx.pausedAt = now;
  if (target === 'COMPLETING') nx.completingAt = now;
  if (target === 'COMPLETED' || target === 'PARTIAL') {
    if (!s.startedAt) throw new Error('No se puede finalizar sin startedAt');
    nx.completedAt = now;
    nx.endedAt = now;
  }
  if (target === 'CANCELLED') {
    nx.cancelledAt = now; nx.endedAt = now;
    if (opts?.reason) nx.cancelReason = opts.reason;
    if (opts?.comment) nx.cancelComment = opts.comment;
  }
  if (target === 'ABANDONED') {
    nx.abandonedAt = now; nx.endedAt = now;
    if (opts?.reason) nx.abandonReason = opts.reason;
    if (opts?.comment) nx.abandonComment = opts.comment;
  }
  await db.table('trainingSessions').put(nx as never);
  const evType: Record<string, SessionEventType> = {
    IN_PROGRESS: s.sessionStatus === 'PAUSED' ? 'SESSION_RESUMED' : 'SESSION_STARTED',
    PAUSED: 'SESSION_PAUSED', COMPLETING: 'SESSION_COMPLETING',
    COMPLETED: 'SESSION_COMPLETED', PARTIAL: 'SESSION_PARTIAL',
    CANCELLED: 'SESSION_CANCELLED', ABANDONED: 'SESSION_ABANDONED',
  };
  await logEvent(sessionId, evType[target] ?? 'SESSION_COMPLETING', {
    fromStatus: s.sessionStatus, toStatus: target, metadata: opts ? { ...opts } : undefined,
  });
  if (FINAL_STATES.includes(target)) setActiveSessionId(null);
  else setActiveSessionId(sessionId);
  return nx;
}

// Actualización parcial SIN cambio de estado (posición, contadores). No toca sessionStatus.
export async function updateSession(sessionId: string, patch: Partial<TrainingSession>): Promise<TrainingSession> {
  const s = await getSession(sessionId);
  if (!s) throw new Error(`Sesión inexistente: ${sessionId}`);
  if (patch.sessionStatus && patch.sessionStatus !== s.sessionStatus) {
    throw new Error('updateSession no cambia estado: usar transitionSession');
  }
  const nx = { ...s, ...patch, sessionId: s.sessionId, updatedAt: new Date().toISOString() };
  await db.table('trainingSessions').put(nx as never);
  return nx;
}

export async function getSessionExercises(sessionId: string): Promise<SessionExercise[]> {
  const rows = await db.table('sessionExercises').where('sessionId').equals(sessionId).toArray().catch(() => []);
  return (rows as SessionExercise[]).sort((a, b) => a.order - b.order);
}

export async function getSetRecords(sessionExerciseId: string): Promise<SetRecord[]> {
  const rows = await db.table('setRecords').where('sessionExerciseId').equals(sessionExerciseId).toArray().catch(() => []);
  return (rows as SetRecord[]).sort((a, b) => a.order - b.order);
}

// Confirma serie: upsert por setRecordId estable (idempotente ante recarga, §18).
export async function confirmSetRecord(input: {
  sessionId: string; sessionExerciseId: string; exerciseId: string; order: number;
  actualReps: number; actualWeight: number; setType?: SetType; observation?: string;
}): Promise<SetRecord> {
  const now = new Date().toISOString();
  const id = setRecordIdFor(input.sessionExerciseId, input.order);
  const prev = await db.table('setRecords').get(id).catch(() => null) as SetRecord | null;
  const rec: SetRecord = {
    setRecordId: id, sessionId: input.sessionId, sessionExerciseId: input.sessionExerciseId,
    exerciseId: input.exerciseId, order: input.order, setType: input.setType ?? prev?.setType ?? 'NORMAL',
    plannedReps: prev?.plannedReps ?? input.actualReps, plannedWeight: prev?.plannedWeight ?? input.actualWeight,
    actualReps: input.actualReps, actualWeight: input.actualWeight,
    status: 'COMPLETED', observation: input.observation ?? prev?.observation,
    completedAt: now, createdAt: prev?.createdAt ?? now, updatedAt: now,
  };
  await db.table('setRecords').put(rec as never);
  await logEvent(input.sessionId, 'SET_COMPLETED', { metadata: { sessionExerciseId: input.sessionExerciseId, order: input.order } });
  await refreshSessionExerciseProgress(input.sessionExerciseId);
  return rec;
}

export async function skipSetRecord(sessionExerciseId: string, order: number, observation?: string): Promise<void> {
  const prev = await db.table('setRecords').get(setRecordIdFor(sessionExerciseId, order)).catch(() => null) as SetRecord | null;
  if (!prev) return;
  const now = new Date().toISOString();
  await db.table('setRecords').put({ ...prev, status: 'SKIPPED' as SetRecordStatus, observation: observation ?? prev.observation, updatedAt: now } as never);
  await logEvent(prev.sessionId, 'SET_SKIPPED', { metadata: { sessionExerciseId, order } });
  await refreshSessionExerciseProgress(sessionExerciseId);
}

// Agrega serie extra (actualSets): crea SetRecord con orden = max+1.
export async function addExtraSet(sessionExerciseId: string, reps: number, weight: number, setType: SetType = 'NORMAL'): Promise<SetRecord> {
  const prev = await db.table('setRecords').get(setRecordIdFor(sessionExerciseId, 0)).catch(() => null);
  const all = await getSetRecords(sessionExerciseId);
  const se = await db.table('sessionExercises').get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) throw new Error('SessionExercise inexistente');
  const order = (all.length ? Math.max(...all.map((r) => r.order)) : 0) + 1;
  void prev;
  const now = new Date().toISOString();
  const rec: SetRecord = {
    setRecordId: setRecordIdFor(sessionExerciseId, order), sessionId: se.sessionId,
    sessionExerciseId, exerciseId: se.exerciseId, order, setType,
    plannedReps: reps, plannedWeight: weight, actualReps: reps, actualWeight: weight,
    status: 'PENDING', createdAt: now, updatedAt: now,
  };
  await db.table('setRecords').put(rec as never);
  await db.table('sessionExercises').put({ ...se, actualSetCount: order, status: se.status === 'PENDING' ? 'IN_PROGRESS' : se.status, updatedAt: now } as never);
  return rec;
}

export async function refreshSessionExerciseProgress(sessionExerciseId: string): Promise<SessionExercise | null> {
  const se = await db.table('sessionExercises').get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) return null;
  const sets = await getSetRecords(sessionExerciseId);
  const doneCount = sets.filter((r) => r.status === 'COMPLETED').length;
  const skippedAll = sets.length > 0 && sets.every((r) => r.status === 'SKIPPED');
  let status: SessionExerciseStatus = se.status;
  if (se.status !== 'SKIPPED' && se.status !== 'REPLACED' && se.status !== 'EXTRA') {
    if (skippedAll) status = 'SKIPPED';
    else if (doneCount === 0) status = sets.some((r) => r.status !== 'PENDING') ? 'IN_PROGRESS' : 'PENDING';
    else if (doneCount >= se.plannedSetCount && sets.every((r) => r.status === 'COMPLETED')) status = 'COMPLETED';
    else status = doneCount > 0 ? 'PARTIAL' : 'IN_PROGRESS';
  }
  const nx = { ...se, actualSetCount: Math.max(...sets.map((r) => r.order), 0), completed: status === 'COMPLETED', status, updatedAt: new Date().toISOString() };
  await db.table('sessionExercises').put(nx as never);
  return nx;
}

export async function skipSessionExercise(sessionExerciseId: string, reason: string, comment?: string): Promise<void> {
  const se = await db.table('sessionExercises').get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) throw new Error('SessionExercise inexistente');
  const now = new Date().toISOString();
  await db.table('sessionExercises').put({ ...se, status: 'SKIPPED', completed: false, skipReason: reason, skipComment: comment, updatedAt: now } as never);
  await logEvent(se.sessionId, 'EXERCISE_SKIPPED', { metadata: { sessionExerciseId, reason, comment } });
}

export async function replaceSessionExercise(
  sessionExerciseId: string, replacementExerciseId: string, reason: string, comment?: string,
): Promise<SessionExercise> {
  const se = await db.table('sessionExercises').get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) throw new Error('SessionExercise inexistente');
  const now = new Date().toISOString();
  const replacement: ExerciseReplacement = {
    replacementId: uuid(), sessionId: se.sessionId, sessionExerciseId,
    originalExerciseId: se.exerciseId, replacementExerciseId, reason, comment, createdAt: now,
  };
  const nx: SessionExercise = {
    ...se, exerciseId: replacementExerciseId, status: 'REPLACED',
    replacement, updatedAt: now,
  };
  await db.table('sessionExercises').put(nx as never);
  await logEvent(se.sessionId, 'EXERCISE_REPLACED', { metadata: { sessionExerciseId, reason } });
  return nx;
}

export async function addExtraExercise(sessionId: string, input: { exId: string; name: string; sets: number; reps: number; weight: number; muscle?: string }): Promise<SessionExercise> {
  const now = new Date().toISOString();
  const existing = await getSessionExercises(sessionId);
  const se: SessionExercise = {
    sessionExerciseId: uuid(), sessionId, exerciseId: input.exId, order: existing.length,
    planned: false, completed: false, status: 'EXTRA',
    plannedSetCount: 0, actualSetCount: 0,
    plannedSets: [],
    createdAt: now, updatedAt: now,
  };
  await db.table('sessionExercises').put(se as never);
  for (let k = 1; k <= input.sets; k++) {
    await db.table('setRecords').put({
      setRecordId: setRecordIdFor(se.sessionExerciseId, k), sessionId,
      sessionExerciseId: se.sessionExerciseId, exerciseId: input.exId, order: k, setType: 'NORMAL',
      plannedReps: input.reps, plannedWeight: input.weight,
      actualReps: input.reps, actualWeight: input.weight,
      status: 'PENDING', createdAt: now, updatedAt: now,
    } as never);
  }
  await logEvent(sessionId, 'EXERCISE_ADDED', { metadata: { sessionExerciseId: se.sessionExerciseId, exerciseId: input.exId } });
  return se;
}

export async function saveNegatives(input: { sessionId: string; sessionExerciseId: string; exerciseId: string; quantity: number; weight: number; observation?: string }): Promise<NegativeSet> {
  const now = new Date().toISOString();
  const neg: NegativeSet = {
    negativeSetId: uuid(), sessionId: input.sessionId, sessionExerciseId: input.sessionExerciseId,
    exerciseId: input.exerciseId, quantity: input.quantity, weight: input.weight,
    observation: input.observation, createdAt: now,
  };
  await db.table('negativeSets').put(neg as never);
  return neg;
}

export async function saveExerciseObservation(input: { sessionId: string; sessionExerciseId?: string; exerciseId?: string; text: string }): Promise<ExerciseObservation> {
  const obs: ExerciseObservation = {
    observationId: uuid(), sessionId: input.sessionId,
    sessionExerciseId: input.sessionExerciseId, exerciseId: input.exerciseId,
    text: input.text.slice(0, 500), createdAt: new Date().toISOString(),
  };
  await db.table('exerciseObservations').put(obs as never);
  return obs;
}

export async function saveSurvey(input: Omit<PostWorkoutSurvey, 'surveyId' | 'createdAt'>): Promise<PostWorkoutSurvey> {
  const s: PostWorkoutSurvey = { ...input, surveyId: uuid(), createdAt: new Date().toISOString() };
  await db.table('postWorkoutSurveys').put(s as never);
  return s;
}
