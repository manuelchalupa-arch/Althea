// STORE CENTRAL — única vía para mutar TrainingSession (§4, §48).
// Fuente de verdad en sesión activa: TrainingSession + SessionExercise + SetRecord (Dexie).
// activeSessionId: máximo una sesión activa por usuario (§10).
import { v4 as uuid } from 'uuid';
import { db } from '@/services/storage/db';
import {
  assertTransitionSession, setRecordIdFor,
  type SessionStatus, type SessionExerciseStatus, type SetRecordStatus, type SetType,
  type TrainingSession, type SessionExercise, type SetRecord, type PlannedSetSnapshot,
  type NegativeSet, type ExerciseObservation, type ExerciseReplacement,
  type SessionEvent, type SessionEventType, type PostWorkoutSurvey,
} from './domain';
import { resolveSetType } from './setPlanner';

const ACTIVE_ID_KEY = 'althea:session:activeId';
const USER_ID = 'me';

export function getActiveSessionId(): string | null {
  try { return localStorage.getItem(ACTIVE_ID_KEY); } catch { return null; }
}
function setActiveSessionId(id: string | null) {
  try {
    if (id) {localStorage.setItem(ACTIVE_ID_KEY, id);}
    else {localStorage.removeItem(ACTIVE_ID_KEY);}
  } catch { /* noop */ }
}

// Estados FINALES: la sesión cerró (ya no es "activa" para Entrenar).
export const FINAL_STATES: SessionStatus[] = ['COMPLETED', 'PARTIAL', 'CANCELLED', 'ABANDONED'];
// Estados ACTIVOS: hay sesión vigente (se muestra el acceso a Entrenar).
// READY = creada y aún sin empezar; PAUSED sigue siendo una sesión accesible.
export const ACTIVE_STATES: SessionStatus[] = ['READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETING'];

export function isActiveSessionStatus(status?: SessionStatus | null): boolean {
  return !!status && ACTIVE_STATES.includes(status);
}

// Evento global para que la UI (AppNav, Inicio, Mas) reaccione a cambios de
// sesión sin re-leer Dexie en cada render.
export const SESSION_CHANGED_EVENT = 'althea:session-changed';

export function notifySessionChanged(): void {
  try { if (typeof window !== 'undefined') { window.dispatchEvent(new Event(SESSION_CHANGED_EVENT)); } } catch { /* noop */ }
}

export async function getSession(sessionId: string): Promise<TrainingSession | null> {
  const s = await db.trainingSessions.get(sessionId).catch(() => null);
  return (s as TrainingSession) || null;
}

export async function getActiveSession(): Promise<TrainingSession | null> {
  const id = getActiveSessionId();
  if (!id) { return await findOrphanActiveSession(); }
  const s = await getSession(id);
  if (!s) { setActiveSessionId(null); return await findOrphanActiveSession(); }
  if (FINAL_STATES.includes(s.sessionStatus)) { setActiveSessionId(null); return null; }
  return s;
}

/**
 * Rescate de sesión huérfana: si no hay id activo en storage pero Dexie
 * conserva una sesión en estado activo (p. ej. storage parcial), se readopta
 * la más reciente en vez de crear una duplicada al continuar entrenando.
 */
async function findOrphanActiveSession(): Promise<TrainingSession | null> {
  try {
    const all = await db.trainingSessions.toArray().catch(() => []);
    const orphan = (all as TrainingSession[])
      .filter((s) => isActiveSessionStatus(s.sessionStatus))
      .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')))[0] ?? null;
    if (!orphan) { return null; }
    setActiveSessionId(orphan.sessionId);
    return orphan;
  } catch { return null; }
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
  await db.sessionEvents.put(ev);
}

// Plan de un ejercicio dentro de la sesión. `plannedSets` es el plan POR SERIE
// (reps y weight propios de cada serie); si no viene, se expande el escalar.
export interface PlannedExerciseInput {
  exId: string; name: string; sets: number; reps: number; weight: number | null;
  muscle?: string; gifUrl?: string; routineExerciseId?: string;
  /** Objetivos de planificación que vienen desde la rutina. */
  restSec?: number; seriesType?: string; tempo?: string;
  rir?: number; rpe?: number; notes?: string;
  plannedSets?: Array<{ order: number; reps: number; weight: number | null; setType?: SetType }>;
}

// Crea READY. Si ya hay sesión activa, la recupera (no duplica, §10).
export async function createSession(input: {
  routineId: string; routineName?: string;
  plannedDay: number | null; plannedDayName?: string | null;
  actualDay: number | null; actualDayName?: string | null;
  calendarDate: string; cycleId?: string; weekNumber?: number;
  plannedMuscleGroups?: string[];
  dayChange?: { reason: string; comment?: string };
  plannedExercises: PlannedExerciseInput[];
}): Promise<TrainingSession> {
  const existing = await getActiveSession();
  if (existing) {return existing;}
  if (!input.routineId) {throw new Error('READY sin routineId');}
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
    plannedSets: input.plannedExercises.reduce((a, e) => a + (e.plannedSets?.length ?? e.sets), 0),
    plannedMuscleGroups: input.plannedMuscleGroups ?? [],
    dayChange: input.dayChange ? { ...input.dayChange, at: now } : undefined,
    resumeCount: 0,
    createdAt: now, updatedAt: now,
  };
  await db.trainingSessions.put(s);
  // Snapshot planificado: un SessionExercise por ejercicio (la rutina original no se toca).
  for (let i = 0; i < input.plannedExercises.length; i++) {
    const p = input.plannedExercises[i];
    // Plan POR SERIE: cada serie conserva su propio reps/weight. El escalar
    // (p.reps/p.weight) solo se usa como fallback para rutinas antiguas.
    const plan: PlannedSetSnapshot[] = (p.plannedSets && p.plannedSets.length > 0)
      ? p.plannedSets.map((s, k) => ({ order: s.order ?? k + 1, reps: s.reps, weight: s.weight ?? null, setType: s.setType ?? resolveSetType(p.seriesType) }))
      : Array.from({ length: p.sets }, (_, k) => ({ order: k + 1, reps: p.reps, weight: p.weight ?? null, setType: resolveSetType(p.seriesType) as SetType }));
    const se: SessionExercise = {
      sessionExerciseId: uuid(), sessionId, exerciseId: p.exId,
      exerciseName: p.name,
      routineExerciseId: p.routineExerciseId, order: i,
      planned: true, completed: false, status: 'PENDING',
      plannedSetCount: plan.length, actualSetCount: 0,
      plannedSets: plan,
      restSec: p.restSec,
      seriesType: resolveSetType(p.seriesType),
      tempo: p.tempo,
      targetRir: p.rir,
      targetRpe: p.rpe,
      notes: p.notes,
      createdAt: now, updatedAt: now,
    };
    await db.sessionExercises.put(se);
    // SetRecords PENDING pre-creados con id estable (confirma = upsert, nunca duplica).
    // No hay "peso actual" hasta que el usuario confirma la serie.
    for (const ps of se.plannedSets) {
      const rec: SetRecord = {
        setRecordId: setRecordIdFor(se.sessionExerciseId, ps.order),
        sessionId, sessionExerciseId: se.sessionExerciseId, exerciseId: p.exId,
        order: ps.order, setType: ps.setType ?? 'NORMAL',
        plannedReps: ps.reps, plannedWeight: ps.weight ?? null,
        actualReps: ps.reps, actualWeight: null,
        status: 'PENDING', createdAt: now, updatedAt: now,
      };
      await db.setRecords.put(rec);
    }
  }
  await logEvent(sessionId, 'SESSION_CREATED', { toStatus: 'READY', metadata: { plannedDay: input.plannedDay, actualDay: input.actualDay } });
  setActiveSessionId(sessionId);
  notifySessionChanged();
  return s;
}

// Mutex por sesión: serializa transiciones concurrentes (doble clic, StrictMode,
// focus+timer) para que leer→validar→escribir sea atómico y no haya TOCTOU.
const sessionLocks = new Map<string, Promise<unknown>>();
async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const cur = new Promise<void>((r) => { release = r; });
  sessionLocks.set(sessionId, prev.then(() => cur));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(sessionId) === cur) {sessionLocks.delete(sessionId);}
  }
}

// ÚNICA función de transición (§4). Lanza si es inválida; registra evento; actualiza timestamps.
export async function transitionSession(
  sessionId: string, target: SessionStatus,
  opts?: { reason?: string; comment?: string },
): Promise<TrainingSession> {
  return withSessionLock(sessionId, () => transitionInner(sessionId, target, opts));
}

async function transitionInner(
  sessionId: string, target: SessionStatus,
  opts?: { reason?: string; comment?: string },
): Promise<TrainingSession> {
  const s = await getSession(sessionId);
  if (!s) {throw new Error(`Sesión inexistente: ${sessionId}`);}
  // Cierre desde READY: la matriz exige pasar por IN_PROGRESS; se encadenan los dos
  // saltos válidos (ambos auditados) en vez de fallar. Hace imposible READY→COMPLETING.
  if (target === 'COMPLETING' && s.sessionStatus === 'READY') {
    const started = await applyTransition(s, 'IN_PROGRESS');
    return applyTransition(started, 'COMPLETING', opts);
  }
  assertTransitionSession(s.sessionStatus, target);
  return applyTransition(s, target, opts);
}

async function applyTransition(
  s: TrainingSession,
  target: SessionStatus,
  opts?: { reason?: string; comment?: string },
): Promise<TrainingSession> {
  const now = new Date().toISOString();
  const nx: TrainingSession = { ...s, sessionStatus: target, updatedAt: now };
  if (target === 'IN_PROGRESS') {
    if (!s.startedAt) {nx.startedAt = now;}
    nx.resumedAt = s.sessionStatus === 'PAUSED' ? now : s.resumedAt;
    if (s.sessionStatus === 'PAUSED' && s.pausedAt) {
      const pausedSec = Math.max(0, Math.round((Date.now() - new Date(s.pausedAt).getTime()) / 1000));
      nx.totalPausedDurationSec = (s.totalPausedDurationSec ?? 0) + pausedSec;
      nx.resumeCount = (s.resumeCount ?? 0) + 1;
    }
    nx.pausedAt = undefined;
  }
  if (target === 'PAUSED') {nx.pausedAt = now;}
  if (target === 'COMPLETING') {nx.completingAt = now;}
  if (target === 'COMPLETED' || target === 'PARTIAL') {
    if (!s.startedAt) {throw new Error('No se puede finalizar sin startedAt');}
    nx.completedAt = now;
    nx.endedAt = now;
  }
  if (target === 'CANCELLED') {
    nx.cancelledAt = now; nx.endedAt = now;
    if (opts?.reason) {nx.cancelReason = opts.reason;}
    if (opts?.comment) {nx.cancelComment = opts.comment;}
  }
  if (target === 'ABANDONED') {
    nx.abandonedAt = now; nx.endedAt = now;
    if (opts?.reason) {nx.abandonReason = opts.reason;}
    if (opts?.comment) {nx.abandonComment = opts.comment;}
  }
  await db.trainingSessions.put(nx);
  const evType: Record<string, SessionEventType> = {
    IN_PROGRESS: s.sessionStatus === 'PAUSED' ? 'SESSION_RESUMED' : 'SESSION_STARTED',
    PAUSED: 'SESSION_PAUSED', COMPLETING: 'SESSION_COMPLETING',
    COMPLETED: 'SESSION_COMPLETED', PARTIAL: 'SESSION_PARTIAL',
    CANCELLED: 'SESSION_CANCELLED', ABANDONED: 'SESSION_ABANDONED',
  };
  await logEvent(s.sessionId, evType[target] ?? 'SESSION_COMPLETING', {
    fromStatus: s.sessionStatus, toStatus: target, metadata: opts ? { ...opts } : undefined,
  });
  if (FINAL_STATES.includes(target)) {setActiveSessionId(null);}
  else {setActiveSessionId(s.sessionId);}
  notifySessionChanged();
  // Cola de sync (FASE 8): la sesión finalizada queda pendiente de respaldo.
  // Best-effort: lo local ya está guardado.
  if (FINAL_STATES.includes(target)) {
    import('@/services/sync/opQueue').then(({ enqueueOp }) => enqueueOp('trainingSessions', s.sessionId)).catch(() => {})
  }
  return nx;
}

// Actualización parcial SIN cambio de estado (posición, contadores). No toca sessionStatus.
export async function updateSession(sessionId: string, patch: Partial<TrainingSession>): Promise<TrainingSession> {
  const s = await getSession(sessionId);
  if (!s) {throw new Error(`Sesión inexistente: ${sessionId}`);}
  if (patch.sessionStatus && patch.sessionStatus !== s.sessionStatus) {
    throw new Error('updateSession no cambia estado: usar transitionSession');
  }
  const nx = { ...s, ...patch, sessionId: s.sessionId, updatedAt: new Date().toISOString() };
  await db.trainingSessions.put(nx);
  return nx;
}

export async function getSessionExercises(sessionId: string): Promise<SessionExercise[]> {
  const rows = await db.sessionExercises.where('sessionId').equals(sessionId).toArray().catch(() => []);
  return (rows as SessionExercise[]).sort((a, b) => a.order - b.order);
}

export async function getSetRecords(sessionExerciseId: string): Promise<SetRecord[]> {
  const rows = await db.setRecords.where('sessionExerciseId').equals(sessionExerciseId).toArray().catch(() => []);
  return (rows as SetRecord[]).sort((a, b) => a.order - b.order);
}

// Confirma serie: upsert por setRecordId estable (idempotente ante recarga, §18).
// `actualWeight: null` = el usuario dejó el peso vacío (se persiste null, nunca 0).
export async function confirmSetRecord(input: {
  sessionId: string; sessionExerciseId: string; exerciseId: string; order: number;
  actualReps: number; actualWeight: number | null; setType?: SetType; observation?: string;
  actualLoadText?: string;
}): Promise<SetRecord> {
  const now = new Date().toISOString();
  const id = setRecordIdFor(input.sessionExerciseId, input.order);
  const prev = await db.setRecords.get(id).catch(() => null) as SetRecord | null;
  const rec: SetRecord = {
    setRecordId: id, sessionId: input.sessionId, sessionExerciseId: input.sessionExerciseId,
    exerciseId: input.exerciseId, order: input.order, setType: input.setType ?? prev?.setType ?? 'NORMAL',
    plannedReps: prev?.plannedReps ?? input.actualReps, plannedWeight: prev?.plannedWeight ?? input.actualWeight ?? null,
    actualReps: input.actualReps, actualWeight: input.actualWeight ?? null,
    status: 'COMPLETED', observation: input.observation ?? prev?.observation,
    // Preservación del original: se conserva SOLO si sigue correspondiendo al
    // peso guardado; si el número cambió sin unidad tipeada, queda obsoleto.
    actualLoadText: input.actualLoadText
      ?? (prev?.actualLoadText && prev.actualWeight === (input.actualWeight ?? null) ? prev.actualLoadText : undefined),
    completedAt: now, createdAt: prev?.createdAt ?? now, updatedAt: now,
  };
  await db.setRecords.put(rec);
  await logEvent(input.sessionId, 'SET_COMPLETED', { metadata: { sessionExerciseId: input.sessionExerciseId, order: input.order } });
  await refreshSessionExerciseProgress(input.sessionExerciseId);
  return rec;
}

export async function skipSetRecord(sessionExerciseId: string, order: number, observation?: string): Promise<void> {
  const prev = await db.setRecords.get(setRecordIdFor(sessionExerciseId, order)).catch(() => null) as SetRecord | null;
  if (!prev) {return;}
  const now = new Date().toISOString();
  await db.setRecords.put({ ...prev, status: 'SKIPPED' as SetRecordStatus, observation: observation ?? prev.observation, updatedAt: now });
  await logEvent(prev.sessionId, 'SET_SKIPPED', { metadata: { sessionExerciseId, order } });
  await refreshSessionExerciseProgress(sessionExerciseId);
}

// Al reducir el plan de series, elimina los SetRecord PENDING que quedaron
// fuera del plan nuevo. Solo PENDING: nunca se borra un registro COMPLETED
// ni SKIPPED (son historial real). Sin esto, refreshSessionExerciseProgress
// exige que todo esté COMPLETED y el ejercicio queda eternamente PARTIAL.
export async function prunePendingSetRecords(sessionExerciseId: string, keepOrders: number[]): Promise<void> {
  const rows = await getSetRecords(sessionExerciseId);
  for (const r of rows) {
    if (r.status === 'PENDING' && !keepOrders.includes(r.order)) {
      await db.setRecords.delete(r.setRecordId);
    }
  }
}

// Agrega serie extra (actualSets): crea SetRecord con orden = max+1.
export async function addExtraSet(sessionExerciseId: string, reps: number, weight: number | null, setType: SetType = 'NORMAL'): Promise<SetRecord> {
  const prev = await db.setRecords.get(setRecordIdFor(sessionExerciseId, 0)).catch(() => null);
  const all = await getSetRecords(sessionExerciseId);
  const se = await db.sessionExercises.get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) {throw new Error('SessionExercise inexistente');}
  const order = (all.length ? Math.max(...all.map((r) => r.order)) : 0) + 1;
  void prev;
  const now = new Date().toISOString();
  const rec: SetRecord = {
    setRecordId: setRecordIdFor(sessionExerciseId, order), sessionId: se.sessionId,
    sessionExerciseId, exerciseId: se.exerciseId, order, setType,
    plannedReps: reps, plannedWeight: weight ?? null, actualReps: reps, actualWeight: null,
    status: 'PENDING', createdAt: now, updatedAt: now,
  };
  await db.setRecords.put(rec);
  await db.sessionExercises.put({ ...se, actualSetCount: order, status: se.status === 'PENDING' ? 'IN_PROGRESS' : se.status, updatedAt: now });
  return rec;
}

export async function refreshSessionExerciseProgress(sessionExerciseId: string): Promise<SessionExercise | null> {
  const se = await db.sessionExercises.get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) {return null;}
  const sets = await getSetRecords(sessionExerciseId);
  const doneCount = sets.filter((r) => r.status === 'COMPLETED').length;
  const skippedAll = sets.length > 0 && sets.every((r) => r.status === 'SKIPPED');
  let status: SessionExerciseStatus = se.status;
  if (se.status !== 'SKIPPED' && se.status !== 'REPLACED' && se.status !== 'EXTRA') {
    if (skippedAll) {status = 'SKIPPED';}
    else if (doneCount === 0) {status = sets.some((r) => r.status !== 'PENDING') ? 'IN_PROGRESS' : 'PENDING';}
    else if (doneCount >= se.plannedSetCount && sets.every((r) => r.status === 'COMPLETED')) {status = 'COMPLETED';}
    else {status = doneCount > 0 ? 'PARTIAL' : 'IN_PROGRESS';}
  }
  const nx = { ...se, actualSetCount: Math.max(...sets.map((r) => r.order), 0), completed: status === 'COMPLETED', status, updatedAt: new Date().toISOString() };
  await db.sessionExercises.put(nx);
  return nx;
}

export async function skipSessionExercise(sessionExerciseId: string, reason: string, comment?: string): Promise<void> {
  const se = await db.sessionExercises.get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) {throw new Error('SessionExercise inexistente');}
  const now = new Date().toISOString();
  await db.sessionExercises.put({ ...se, status: 'SKIPPED', completed: false, skipReason: reason, skipComment: comment, updatedAt: now });
  await logEvent(se.sessionId, 'EXERCISE_SKIPPED', { metadata: { sessionExerciseId, reason, comment } });
}

export async function replaceSessionExercise(
  sessionExerciseId: string, replacementExerciseId: string, reason: string, comment?: string,
  replacementExerciseName?: string,
): Promise<SessionExercise> {
  const se = await db.sessionExercises.get(sessionExerciseId).catch(() => null) as SessionExercise | null;
  if (!se) {throw new Error('SessionExercise inexistente');}
  if (se.status === 'REPLACED' && se.replacement) {
    return se;
  }
  const now = new Date().toISOString();
  const replacement: ExerciseReplacement = {
    replacementId: uuid(), sessionId: se.sessionId, sessionExerciseId,
    originalExerciseId: se.exerciseId, replacementExerciseId, reason, comment, createdAt: now,
  };
  const nx: SessionExercise = {
    ...se, exerciseId: replacementExerciseId,
    exerciseName: replacementExerciseName ?? se.exerciseName,
    status: 'REPLACED',
    replacement, updatedAt: now,
  };
  await db.sessionExercises.put(nx);
  await logEvent(se.sessionId, 'EXERCISE_REPLACED', { metadata: { sessionExerciseId, reason } });
  return nx;
}

export async function addExtraExercise(sessionId: string, input: { exId: string; name: string; sets: number; reps: number; weight: number | null; muscle?: string }): Promise<SessionExercise> {
  const now = new Date().toISOString();
  const existing = await getSessionExercises(sessionId);
  const se: SessionExercise = {
    sessionExerciseId: uuid(), sessionId, exerciseId: input.exId, exerciseName: input.name, order: existing.length,
    planned: false, completed: false, status: 'EXTRA',
    plannedSetCount: 0, actualSetCount: 0,
    plannedSets: [],
    createdAt: now, updatedAt: now,
  };
  await db.sessionExercises.put(se);
  for (let k = 1; k <= input.sets; k++) {
    await db.setRecords.put({
      setRecordId: setRecordIdFor(se.sessionExerciseId, k), sessionId,
      sessionExerciseId: se.sessionExerciseId, exerciseId: input.exId, order: k, setType: 'NORMAL',
      plannedReps: input.reps, plannedWeight: input.weight ?? null,
      actualReps: input.reps, actualWeight: null,
      status: 'PENDING', createdAt: now, updatedAt: now,
    });
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
  await db.negativeSets.put(neg);
  return neg;
}

export async function saveExerciseObservation(input: { sessionId: string; sessionExerciseId?: string; exerciseId?: string; text: string }): Promise<ExerciseObservation> {
  const now = new Date().toISOString()
  const obs: ExerciseObservation = {
    observationId: uuid(), sessionId: input.sessionId,
    sessionExerciseId: input.sessionExerciseId, exerciseId: input.exerciseId,
    text: input.text.slice(0, 500), createdAt: now, updatedAt: now,
  };
  await db.exerciseObservations.put(obs);
  return obs;
}

export async function saveSurvey(input: Omit<PostWorkoutSurvey, 'surveyId' | 'createdAt'>): Promise<PostWorkoutSurvey> {
  const s: PostWorkoutSurvey = { ...input, surveyId: uuid(), createdAt: new Date().toISOString() };
  await db.postWorkoutSurveys.put(s);
  return s;
}

// ─── ActiveSession helpers (replaces sessionMachine.ts legacy mirror) ───

export interface ActiveSession {
  sessionId: string;
  calendarDate: string;
  routineId: string;
  routineName: string;
  cycleId?: string;
  weekNumber?: number;
  plannedDay: number | null;
  plannedDayName: string | null;
  actualDay: number | null;
  actualDayName: string | null;
  plannedMuscleGroups: string[];
  actualMuscleGroups: string[];
  exercises: Array<{
    exId: string; name: string; sets: number; reps: number; weight: number | null;
    muscle?: string; gifUrl?: string; imageDataUrl?: string;
    routineExerciseId?: string;
    restSec?: number; seriesType?: string; tempo?: string;
    rir?: number; rpe?: number; notes?: string;
    /** Plan por serie (reps/weight propios de cada serie) si la rutina lo define. */
    plannedSets?: Array<{ order: number; reps: number; weight: number | null; setType?: SetType }>;
  }>;
  sessionStatus: SessionStatus;
  statusHistory: Array<{ status: SessionStatus; at: string }>;
  startedAt?: string;
  dayChangeReason?: string;
  dayChangeComment?: string;
  createdAt: string;
  updatedAt: string;
}

function toActive(s: TrainingSession, exercises: ActiveSession['exercises'] = []): ActiveSession {
  return {
    sessionId: s.sessionId, calendarDate: s.calendarDate, routineId: s.routineId,
    routineName: s.routineName ?? 'Rutina', cycleId: s.cycleId, weekNumber: s.weekNumber,
    plannedDay: s.plannedDay, plannedDayName: s.plannedDayName ?? null,
    actualDay: s.actualDay, actualDayName: s.actualDayName ?? null,
    plannedMuscleGroups: s.plannedMuscleGroups ?? [], actualMuscleGroups: s.actualMuscleGroups ?? [],
    exercises, sessionStatus: s.sessionStatus, statusHistory: [],
    startedAt: s.startedAt,
    dayChangeReason: s.dayChange?.reason, dayChangeComment: s.dayChange?.comment,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

async function exercisesOf(sessionId: string): Promise<ActiveSession['exercises']> {
  const rows = await db.sessionExercises.where('sessionId').equals(sessionId).toArray().catch(() => []) as SessionExercise[];
  return rows
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      exId: r.exerciseId, name: r.exerciseName ?? r.exerciseId,
      sets: r.plannedSets?.length ?? 0,
      reps: r.plannedSets?.[0]?.reps ?? 0, weight: r.plannedSets?.[0]?.weight ?? null,
      restSec: r.restSec, seriesType: r.seriesType, tempo: r.tempo,
      rir: r.targetRir, rpe: r.targetRpe, notes: r.notes,
      plannedSets: (r.plannedSets ?? []).map((s) => ({ order: s.order, reps: s.reps, weight: s.weight ?? null, setType: s.setType })),
    }));
}

export async function loadActiveSession(): Promise<ActiveSession | null> {
  const id = getActiveSessionId();
  if (!id) {return null;}
  const s = await getSession(id);
  if (!s) { setActiveSessionId(null); return null; }
  if (FINAL_STATES.includes(s.sessionStatus)) { setActiveSessionId(null); return null; }
  const ex = await exercisesOf(id);
  return toActive(s, ex);
}

export async function saveActiveSession(s: ActiveSession): Promise<void> {
  setActiveSessionId(s.sessionId);
  try {
    const cur = await getSession(s.sessionId);
    if (cur) {await updateSession(s.sessionId, { routineName: s.routineName, actualDayName: s.actualDayName });}
  } catch { /* noop */ }
  notifySessionChanged();
}

export async function clearActiveSession(): Promise<void> {
  setActiveSessionId(null);
  notifySessionChanged();
}

export async function createReadySession(input: {
  calendarDate: string; routineId: string; routineName: string;
  plannedDay: number | null; plannedDayName: string | null;
  actualDay: number | null; actualDayName: string | null;
  exercises: ActiveSession['exercises'];
  plannedMuscleGroups?: string[];
  dayChangeReason?: string; dayChangeComment?: string;
  cycleId?: string; weekNumber?: number;
}): Promise<ActiveSession> {
  // Estampa la versión de planificación vigente (FASE 3). Si el llamante ya
  // trae cycleId o no hay versión activa, se conserva el comportamiento previo.
  let cycleId = input.cycleId
  if (!cycleId) {
    try {
      const { getActiveVersion, PROFILE_SCOPE } = await import('@/services/planning/cycleVersions')
      cycleId = (await getActiveVersion(PROFILE_SCOPE))?.id
    } catch { /* noop */ }
  }
  const created = await createSession({
    routineId: input.routineId, routineName: input.routineName,
    plannedDay: input.plannedDay, plannedDayName: input.plannedDayName,
    actualDay: input.actualDay, actualDayName: input.actualDayName,
    calendarDate: input.calendarDate, cycleId, weekNumber: input.weekNumber,
    plannedMuscleGroups: input.plannedMuscleGroups,
    dayChange: input.dayChangeReason ? { reason: input.dayChangeReason, comment: input.dayChangeComment } : undefined,
    plannedExercises: input.exercises,
  });
  const now = new Date().toISOString();
  const s: ActiveSession = {
    sessionId: created.sessionId,
    calendarDate: created.calendarDate, routineId: created.routineId, routineName: created.routineName ?? input.routineName,
    cycleId: created.cycleId, weekNumber: created.weekNumber,
    plannedDay: created.plannedDay, plannedDayName: created.plannedDayName ?? null,
    actualDay: created.actualDay, actualDayName: created.actualDayName ?? null,
    plannedMuscleGroups: created.plannedMuscleGroups ?? [], actualMuscleGroups: [],
    exercises: input.exercises, sessionStatus: created.sessionStatus,
    statusHistory: [{ status: 'PLANNED', at: created.createdAt }, { status: 'READY', at: now }],
    dayChangeReason: input.dayChangeReason, dayChangeComment: input.dayChangeComment,
    createdAt: created.createdAt, updatedAt: now,
  };
  await saveActiveSession(s);
  return s;
}
