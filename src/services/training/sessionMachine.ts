// COMPAT — la lógica oficial vive en domain.ts + sessionStore.ts.
// Este módulo conserva los nombres legacy delegando al store central. No duplicar.
import { db } from '@/services/storage/db';
import { v4 as uuid } from 'uuid';
import {
  canTransitionSession, type SessionStatus,
  type TrainingSession,
} from './domain';
import {
  getActiveSession, getSession, createSession, transitionSession as storeTransition,
  updateSession,
} from './sessionStore';

export type { SessionStatus };
export { canTransitionSession as canTransition };

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
  exercises: Array<{ exId: string; name: string; sets: number; reps: number; weight: number; muscle?: string; gifUrl?: string }>;
  sessionStatus: SessionStatus;
  statusHistory: Array<{ status: SessionStatus; at: string }>;
  startedAt?: string;
  dayChangeReason?: string;
  dayChangeComment?: string;
  createdAt: string;
  updatedAt: string;
}

const LEGACY_MIRROR = 'althea:session:active';

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
  const rows = await db.table('sessionExercises').where('sessionId').equals(sessionId).toArray().catch(() => []) as Array<Record<string, unknown>>;
  const meta: Record<string, { name: string; muscle?: string }> = {};
  try {
    const raw = localStorage.getItem(`${LEGACY_MIRROR}:ex:${sessionId}`);
    if (raw) Object.assign(meta, JSON.parse(raw));
  } catch { /* noop */ }
  return (rows as Array<{ exerciseId: string; plannedSets: Array<{ order: number; reps: number; weight: number }> }>)
    .sort((a, b) => (a as unknown as { order: number }).order - (b as unknown as { order: number }).order)
    .map((r) => ({
      exId: r.exerciseId, name: meta[r.exerciseId]?.name ?? r.exerciseId,
      sets: r.plannedSets?.length ?? 0,
      reps: r.plannedSets?.[0]?.reps ?? 0, weight: r.plannedSets?.[0]?.weight ?? 0,
      muscle: meta[r.exerciseId]?.muscle,
    }));
}

export function loadActiveSession(): ActiveSession | null {
  // Sincrónico por compat: lee espejo + resuelve estado real vía getActiveSession (async) en llamadas nuevas.
  try {
    const id = localStorage.getItem('althea:session:activeId');
    if (!id) {
      const legacy = localStorage.getItem(LEGACY_MIRROR);
      if (!legacy) return null;
      const s = JSON.parse(legacy) as ActiveSession;
      return s?.sessionId ? s : null;
    }
    const mirror = localStorage.getItem(`${LEGACY_MIRROR}:${id}`);
    if (mirror) {
      const s = JSON.parse(mirror) as ActiveSession;
      if (s?.sessionId) return s;
    }
  } catch { /* noop */ }
  return null;
}

export function saveActiveSession(s: ActiveSession): void {
  try {
    localStorage.setItem(LEGACY_MIRROR, JSON.stringify(s));
    localStorage.setItem(`${LEGACY_MIRROR}:${s.sessionId}`, JSON.stringify(s));
    const meta: Record<string, { name: string; muscle?: string }> = {};
    for (const e of s.exercises) meta[e.exId] = { name: e.name, muscle: e.muscle };
    localStorage.setItem(`${LEGACY_MIRROR}:ex:${s.sessionId}`, JSON.stringify(meta));
    localStorage.setItem('althea:session:activeId', s.sessionId);
  } catch { /* noop */ }
  // Sincroniza campos no-estado al store (sin cambiar estado).
  void (async () => {
    try {
      const cur = await getSession(s.sessionId);
      if (cur) await updateSession(s.sessionId, { routineName: s.routineName, actualDayName: s.actualDayName });
    } catch { /* noop */ }
  })();
}

export function clearActiveSession(): void {
  try {
    const id = localStorage.getItem('althea:session:activeId');
    localStorage.removeItem(LEGACY_MIRROR);
    localStorage.removeItem('althea:session:activeId');
    if (id) {
      localStorage.removeItem(`${LEGACY_MIRROR}:${id}`);
      localStorage.removeItem(`${LEGACY_MIRROR}:ex:${id}`);
    }
  } catch { /* noop */ }
}

export function transitionSession(s: ActiveSession, to: SessionStatus): ActiveSession {
  // Validación sincrónica inmediata; la persistencia la hace el store (ver transitionSessionAsync).
  canTransitionSession(s.sessionStatus, to);
  const nx: ActiveSession = {
    ...s, sessionStatus: to,
    statusHistory: [...(s.statusHistory || []), { status: to, at: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  if (to === 'IN_PROGRESS' && !nx.startedAt) nx.startedAt = new Date().toISOString();
  saveActiveSession(nx);
  void storeTransition(s.sessionId, to).catch(() => { /* el store valida de nuevo; si falla queda espejo */ });
  return nx;
}

export async function transitionSessionAsync(sessionId: string, to: SessionStatus): Promise<ActiveSession> {
  const nx = await storeTransition(sessionId, to);
  const ex = await exercisesOf(sessionId);
  const a = toActive(nx, ex);
  saveActiveSession(a);
  return a;
}

export async function createReadySession(input: {
  calendarDate: string; routineId: string; routineName: string;
  plannedDay: number | null; plannedDayName: string | null;
  actualDay: number | null; actualDayName: string | null;
  exercises: ActiveSession['exercises'];
  dayChangeReason?: string; dayChangeComment?: string;
  cycleId?: string; weekNumber?: number;
}): Promise<ActiveSession> {
  // Store primero (id real); el espejo usa el MISMO sessionId. Si ya hay activa, se recupera (§10).
  const created = await createSession({
    routineId: input.routineId, routineName: input.routineName,
    plannedDay: input.plannedDay, plannedDayName: input.plannedDayName,
    actualDay: input.actualDay, actualDayName: input.actualDayName,
    calendarDate: input.calendarDate, cycleId: input.cycleId, weekNumber: input.weekNumber,
    dayChange: input.dayChangeReason ? { reason: input.dayChangeReason, comment: input.dayChangeComment } : undefined,
    plannedExercises: input.exercises,
  });
  const now = new Date().toISOString();
  const isNew = created.calendarDate === input.calendarDate && created.routineId === input.routineId;
  void isNew;
  const s: ActiveSession = {
    sessionId: created.sessionId,
    calendarDate: created.calendarDate, routineId: created.routineId, routineName: created.routineName ?? input.routineName,
    cycleId: created.cycleId, weekNumber: created.weekNumber,
    plannedDay: created.plannedDay, plannedDayName: created.plannedDayName ?? null,
    actualDay: created.actualDay, actualDayName: created.actualDayName ?? null,
    plannedMuscleGroups: [], actualMuscleGroups: [],
    exercises: input.exercises, sessionStatus: created.sessionStatus,
    statusHistory: [{ status: 'PLANNED', at: created.createdAt }, { status: 'READY', at: now }],
    dayChangeReason: input.dayChangeReason, dayChangeComment: input.dayChangeComment,
    createdAt: created.createdAt, updatedAt: now,
  };
  saveActiveSession(s);
  return s;
}
