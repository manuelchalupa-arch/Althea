import Dexie, { type Table } from 'dexie'
import type { Exercise, Routine, RoutineDay, RoutineExercise, Session, SetLog, RecoveryCheck, HydrationLog, UserProfile } from '@/types'

export class TrainDB extends Dexie {
  exercises!: Table<Exercise>
  routines!: Table<Routine>
  routineDays!: Table<RoutineDay>
  routineExercises!: Table<RoutineExercise>
  sessions!: Table<Session>
  setLogs!: Table<SetLog>
  recoveryChecks!: Table<RecoveryCheck>
  hydrationLogs!: Table<HydrationLog>
  userProfile!: Table<UserProfile>
  syncQueue!: Table<any>
  bodyMeasurements!: Table<any>
  constructor() {
    super('trainPWA')
    this.version(1).stores({
      exercises: 'id, groupMain, equipment, level, pattern, *tags',
      routines: 'id, createdAt',
      routineDays: 'id, routineId, weekday',
      routineExercises: 'id, routineDayId, exerciseId, order',
      sessions: 'id, localDate, createdAt',
      setLogs: 'id, sessionId, exerciseId, createdAt',
      recoveryChecks: 'id, localDate',
      hydrationLogs: 'id, localDate',
      userProfile: 'id',
      syncQueue: 'id, status, createdAt'
    })
    this.version(2).stores({
      bodyMeasurements: 'id, localDate, createdAt'
    }).upgrade(tx=>{
      return (tx as any).table('bodyMeasurements').toCollection().count()
    })
    this.version(3).stores({
      coachMemory: 'id, date, type, createdAt'
    })
    this.version(4).stores({
      weeklySequences: 'id, cycleId, weekNumber',
      trainingSessions: 'id, calendarDate, routineId',
      exerciseRecords: 'id, sessionId, exerciseId'
    })
    // v5: modelo oficial de ejecución — SessionExercise / SetRecord / eventos / encuesta / negativas.
    // sessions + setLogs quedan como capa física legacy de solo-lectura (ver migrateLegacyTrainingData).
    this.version(5).stores({
      sessionExercises: 'sessionExerciseId, sessionId, exerciseId',
      setRecords: 'setRecordId, sessionId, sessionExerciseId, exerciseId',
      sessionEvents: 'eventId, sessionId, type, timestamp',
      postWorkoutSurveys: 'surveyId, sessionId, calendarDate',
      negativeSets: 'negativeSetId, sessionId, sessionExerciseId',
      exerciseObservations: 'observationId, sessionId, sessionExerciseId',
    })
  }
}
export const db = new TrainDB()

export async function ensureSeeded() {
  const count = await db.exercises.count()
  if (count > 0) return
  const { exercises } = await import('@/data/exercises.json')
  await db.exercises.bulkPut(exercises as Exercise[])
}

export async function getTodayLocalDate(): Promise<string> {
  return new Date().toISOString().slice(0,10)
}
