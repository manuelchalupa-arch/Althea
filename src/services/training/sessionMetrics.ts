import { db } from '@/services/storage/db'
import type { TrainingSession } from './domain'
import { isDateInPeriod, type AnalysisPeriod } from './metrics'

// Días efectivos de entrenamiento: 1 día = 1 sesión, aunque haya 2 registros el mismo día cuenta 1.
// Solo cuentan sesiones efectivamente realizadas: COMPLETED o PARTIAL.
// No cuentan: rutinas creadas, planificados, descanso, ABANDONED/CANCELLED/PLANNED/READY/IN_PROGRESS/PAUSED/COMPLETING.
// Fuente real: trainingSessions (Dexie), no rutinas.

const COMPLETED_STATUSES = new Set(['COMPLETED', 'PARTIAL'])

export function isCompletedSession(s: Pick<TrainingSession, 'sessionStatus' | 'calendarDate' | 'isDemo'>): boolean {
  if (!s.calendarDate) return false
  if (s.isDemo) return false
  return COMPLETED_STATUSES.has(s.sessionStatus)
}

export function distinctTrainingDays(sessions: Array<Pick<TrainingSession, 'sessionStatus' | 'calendarDate' | 'isDemo'>>): string[] {
  const set = new Set<string>()
  for (const s of sessions) {
    if (isCompletedSession(s)) set.add(s.calendarDate)
  }
  return [...set].sort()
}

export function countTrainingDays(sessions: Array<Pick<TrainingSession, 'sessionStatus' | 'calendarDate' | 'isDemo'>>): number {
  return distinctTrainingDays(sessions).length
}

export function countTrainingDaysInPeriod(
  sessions: Array<Pick<TrainingSession, 'sessionStatus' | 'calendarDate' | 'isDemo'>>,
  period: AnalysisPeriod,
  opts: { customStart?: string; customEnd?: string; today?: string } = {}
): number {
  const days = distinctTrainingDays(sessions).filter(d => isDateInPeriod(d, period, opts))
  return days.length
}

export async function getTrainingDays(period?: AnalysisPeriod, opts?: { customStart?: string; customEnd?: string; today?: string }): Promise<{ total: number; inPeriod?: number; days: string[] }> {
  const sessions = await db.trainingSessions.toArray().catch(() => []) as TrainingSession[]
  const days = distinctTrainingDays(sessions)
  if (!period || period === 'all') return { total: days.length, days }
  const inPeriodDays = days.filter(d => isDateInPeriod(d, period, opts))
  return { total: days.length, inPeriod: inPeriodDays.length, days: inPeriodDays }
}
