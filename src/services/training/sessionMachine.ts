import { v4 as uuid } from 'uuid'

export type SessionStatus =
  | 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'PAUSED'
  | 'COMPLETING' | 'COMPLETED' | 'PARTIAL'
  | 'CANCELLED' | 'ABANDONED'

const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  PLANNED: ['READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'COMPLETING', 'CANCELLED', 'ABANDONED'],
  PAUSED: ['IN_PROGRESS', 'CANCELLED', 'ABANDONED'],
  COMPLETING: ['COMPLETED', 'PARTIAL', 'IN_PROGRESS'],
  COMPLETED: [],
  PARTIAL: [],
  CANCELLED: [],
  ABANDONED: [],
}

export interface StatusEntry { status: SessionStatus; at: string }
export interface ActiveSession {
  sessionId: string
  calendarDate: string
  routineId: string
  routineName: string
  cycleId?: string
  weekNumber?: number
  plannedDay: number | null
  plannedDayName: string | null
  actualDay: number | null
  actualDayName: string | null
  plannedMuscleGroups: string[]
  actualMuscleGroups: string[]
  exercises: Array<{ exId: string; name: string; sets: number; reps: number; weight: number; muscle?: string; gifUrl?: string }>
  sessionStatus: SessionStatus
  statusHistory: StatusEntry[]
  startedAt?: string
  dayChangeReason?: string
  dayChangeComment?: string
  createdAt: string
  updatedAt: string
}

const ACTIVE_KEY = 'althea:session:active'
const LEGACY_PREFIX = 'session:active:'

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return (TRANSITIONS[from] || []).includes(to)
}

export function loadActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as ActiveSession
      if (s?.sessionId && s?.sessionStatus) return s
    }
  } catch {}
  return null
}

export function saveActiveSession(s: ActiveSession) {
  s.updatedAt = new Date().toISOString()
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(s))
  // espejo legacy para compatibilidad con código viejo
  try {
    localStorage.setItem(`${LEGACY_PREFIX}${s.calendarDate}`, JSON.stringify({
      date: s.calendarDate, routineId: s.routineId, routineName: s.routineName,
      dayN: s.actualDay, dayName: s.actualDayName, exercises: s.exercises,
      sessionId: s.sessionId, sessionStatus: s.sessionStatus, createdAt: s.createdAt,
    }))
  } catch {}
}

export function clearActiveSession() {
  localStorage.removeItem(ACTIVE_KEY)
}

export function transitionSession(s: ActiveSession, to: SessionStatus): ActiveSession {
  if (!canTransition(s.sessionStatus, to)) {
    throw new Error(`Transición inválida: ${s.sessionStatus} → ${to}`)
  }
  // validaciones contra datos inconsistentes
  if (to === 'IN_PROGRESS' && (!s.routineId || s.actualDay === undefined)) {
    throw new Error('IN_PROGRESS requiere rutina y día ejecutado')
  }
  if ((to === 'COMPLETED' || to === 'PARTIAL') && !s.startedAt) {
    throw new Error('No se puede finalizar sin startedAt')
  }
  const next: ActiveSession = {
    ...s,
    sessionStatus: to,
    statusHistory: [...(s.statusHistory || []), { status: to, at: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  }
  if (to === 'IN_PROGRESS' && !next.startedAt) next.startedAt = new Date().toISOString()
  saveActiveSession(next)
  return next
}

export function createReadySession(input: {
  calendarDate: string; routineId: string; routineName: string;
  plannedDay: number | null; plannedDayName: string | null;
  actualDay: number | null; actualDayName: string | null;
  exercises: ActiveSession['exercises'];
  dayChangeReason?: string; dayChangeComment?: string;
  cycleId?: string; weekNumber?: number;
}): ActiveSession {
  if (!input.routineId) throw new Error('READY sin routineId')
  const now = new Date().toISOString()
  const s: ActiveSession = {
    sessionId: uuid(),
    calendarDate: input.calendarDate,
    routineId: input.routineId,
    routineName: input.routineName,
    cycleId: input.cycleId,
    weekNumber: input.weekNumber,
    plannedDay: input.plannedDay,
    plannedDayName: input.plannedDayName,
    actualDay: input.actualDay,
    actualDayName: input.actualDayName,
    plannedMuscleGroups: [],
    actualMuscleGroups: [],
    exercises: input.exercises,
    sessionStatus: 'READY',
    statusHistory: [
      { status: 'PLANNED', at: now },
      { status: 'READY', at: now },
    ],
    dayChangeReason: input.dayChangeReason,
    dayChangeComment: input.dayChangeComment,
    createdAt: now,
    updatedAt: now,
  }
  saveActiveSession(s)
  return s
}
