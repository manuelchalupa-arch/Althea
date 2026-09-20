import { db } from './db'
import { v4 as uuid } from 'uuid'
import type { TrainingSession, SessionExercise, SetRecord, SessionEvent, PostWorkoutSurvey, NegativeSet, ExerciseObservation, ExerciseReplacement } from '@/services/training/domain'
import type { RoutineData } from './routineStore'
import type { DiaryEntry, AdherenceRecord } from './diaryStore'
import type { SessionOverrideData } from './sessionOverrideStore'
import type { RecoveryCheck, HydrationLog, BodyMeasurement, UserProfile, PainLog } from '@/types'
import type { CustomExercise } from '@/services/training/customExercises'
import type { CycleConfig } from '@/utils/cycle'

const DEMO_ROUTINE_ID = 'demo-routine-1'
const DEMO_ROUTINE_NAME = 'Demo: Hipertrofia 3×/sem'
const DEMO_MARKER = 'DEMO_AUTO'

function markDemo<T extends { isDemo?: boolean }>(obj: T): T {
  return { ...obj, isDemo: true } as T
}

function isDemoEntity(obj: { isDemo?: boolean }): boolean {
  return obj.isDemo === true
}

export async function loadDemoData(): Promise<{ routineId: string; sessionsCreated: number }> {
  const existing = await db.routineStore.get(DEMO_ROUTINE_ID)
  if (existing) {
    return { routineId: DEMO_ROUTINE_ID, sessionsCreated: 0 }
  }

  const exercises = await db.exercises.toArray()
  const exerciseIds = exercises.map(e => e.id)
  
  const getExId = (name: string) => {
    const match = exercises.find(e => 
      e.id.toLowerCase().includes(name.toLowerCase()) ||
      e.name.toLowerCase().includes(name.toLowerCase())
    )
    return match?.id || exercises[0]?.id || name
  }

  const today = new Date()
  const userId = 'me'
  const defaultCycle: CycleConfig = {
    startDate: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
    trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
    weekMap: [1, null, 2, null, 3, null, null],
  }
  const routine: RoutineData = {
    id: DEMO_ROUTINE_ID,
    name: DEMO_ROUTINE_NAME,
    description: 'Rutina demo generada automáticamente (3 días/sem, 4 semanas)',
    createdAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    rotationDays: 3,
    cycle: defaultCycle,
    dayExercises: {
      1: [
        { id: uuid(), exId: getExId('bench'), name: 'Press Banca', sets: 4, reps: 8, weight: 70, muscle: 'Pecho', gifUrl: '' },
        { id: uuid(), exId: getExId('incline'), name: 'Press Inclinado', sets: 4, reps: 8, weight: 60, muscle: 'Pecho', gifUrl: '' },
        { id: uuid(), exId: getExId('pushdown'), name: 'Extensión Tríceps Polea', sets: 3, reps: 12, weight: 35, muscle: 'Tríceps', gifUrl: '' },
      ],
      2: [
        { id: uuid(), exId: getExId('row'), name: 'Remo con Barra', sets: 4, reps: 8, weight: 65, muscle: 'Espalda', gifUrl: '' },
        { id: uuid(), exId: getExId('lat'), name: 'Jalón al Pecho', sets: 3, reps: 10, weight: 55, muscle: 'Espalda', gifUrl: '' },
        { id: uuid(), exId: getExId('curl'), name: 'Curl Bíceps Mancuernas', sets: 3, reps: 12, weight: 20, muscle: 'Bíceps', gifUrl: '' },
      ],
      3: [
        { id: uuid(), exId: getExId('squat'), name: 'Sentadilla con Barra', sets: 4, reps: 8, weight: 80, muscle: 'Piernas', gifUrl: '' },
        { id: uuid(), exId: getExId('leg-press'), name: 'Prensa de Piernas', sets: 3, reps: 10, weight: 120, muscle: 'Piernas', gifUrl: '' },
        { id: uuid(), exId: getExId('overhead'), name: 'Press Militar', sets: 3, reps: 8, weight: 45, muscle: 'Hombros', gifUrl: '' },
      ],
    },
    isDemo: true,
  }
  await db.routineStore.put(markDemo(routine))

  let sessionsCreated = 0
  for (let w = 0; w < 4; w++) {
    for (let d = 0; d < 3; d++) {
      const date = new Date(today)
      date.setDate(today.getDate() - (4 - w) * 7 + d * 2)
      const iso = date.toISOString().slice(0, 10)
      const dayNumber = (d % 3) + 1

      const session: TrainingSession = {
        id: uuid(),
        sessionId: uuid(),
        userId,
        routineId: DEMO_ROUTINE_ID,
        weekNumber: w + 1,
        plannedDay: dayNumber,
        plannedDayName: ['Lunes', 'Miércoles', 'Viernes'][d],
        actualDay: dayNumber,
        actualDayName: ['Lunes', 'Miércoles', 'Viernes'][d],
        calendarDate: iso,
        routineName: DEMO_ROUTINE_NAME,
        sessionStatus: 'COMPLETED',
        startedAt: new Date(date.setHours(18, 0, 0, 0)).toISOString(),
        completedAt: new Date(date.setHours(19, 0, 0, 0)).toISOString(),
        endedAt: new Date(date.setHours(19, 0, 0, 0)).toISOString(),
        plannedExerciseCount: 3,
        completedExerciseCount: 3,
        skippedExerciseCount: 0,
        modifiedExerciseCount: 0,
        replacedExerciseCount: 0,
        extraExerciseCount: 0,
        plannedSets: 11,
        completedSets: 11,
        totalReps: 88,
        totalVolume: 0,
        plannedMuscleGroups: ['Pecho', 'Espalda', 'Piernas'][dayNumber - 1] ? [] : [],
        createdAt: new Date(date).toISOString(),
        updatedAt: new Date(date).toISOString(),
        isDemo: true,
      }
      await db.trainingSessions.put(markDemo(session))
      sessionsCreated++

      const dayExercises = routine.dayExercises[dayNumber]!
      for (let ei = 0; ei < dayExercises.length; ei++) {
        const ex = dayExercises[ei]
        const sessionExercise: SessionExercise = {
          sessionExerciseId: uuid(),
          sessionId: session.sessionId,
          exerciseId: ex.exId,
          routineExerciseId: ex.routineExerciseId,
          order: ei,
          planned: true,
          completed: true,
          status: 'COMPLETED',
          plannedSetCount: ex.sets,
          actualSetCount: ex.sets,
          plannedSets: Array.from({ length: ex.sets }, (_, k) => ({
            order: k + 1,
            reps: ex.reps,
            weight: ex.weight,
            setType: 'NORMAL',
          })),
          actualSets: Array.from({ length: ex.sets }, (_, k) => {
            const wVariation = Math.random() * 2 - 1
            const rVariation = Math.floor(Math.random() * 2)
            return {
              order: k + 1,
              reps: ex.reps - rVariation,
              weight: Math.round((ex.weight + w * 2.5 + wVariation) / 2.5) * 2.5,
              setType: 'NORMAL',
            }
          }),
          createdAt: new Date(date).toISOString(),
          updatedAt: new Date(date).toISOString(),
          isDemo: true,
        }
        session.actualMuscleGroups = [...(session.actualMuscleGroups || []), ex.muscle ?? '']
        session.totalVolume! += sessionExercise.actualSets!.reduce((sum, s) => sum + s.reps * s.weight, 0)
        await db.sessionExercises.put(markDemo(sessionExercise))

        for (let s = 1; s <= ex.sets; s++) {
          const setRecord: SetRecord = {
            setRecordId: `${sessionExercise.sessionExerciseId}:set:${s}`,
            sessionId: session.sessionId,
            sessionExerciseId: sessionExercise.sessionExerciseId,
            exerciseId: ex.exId,
            order: s,
            setType: 'NORMAL',
            plannedReps: ex.reps,
            plannedWeight: ex.weight,
            actualReps: ex.reps - (Math.random() > 0.5 ? 1 : 0),
            actualWeight: Math.round((ex.weight + w * 2.5 + (Math.random() * 2 - 1)) / 2.5) * 2.5,
            status: 'COMPLETED',
            completedAt: new Date(date).toISOString(),
            createdAt: new Date(date).toISOString(),
            updatedAt: new Date(date).toISOString(),
            isDemo: true,
          }
          await db.setRecords.put(markDemo(setRecord))
        }

        const event: SessionEvent = {
          eventId: uuid(),
          sessionId: session.sessionId,
          type: 'EXERCISE_STARTED',
          timestamp: new Date(date.setHours(18, 10 + ei * 15, 0, 0)).toISOString(),
          metadata: { sessionExerciseId: sessionExercise.sessionExerciseId, exerciseId: ex.exId },
        }
        await db.sessionEvents.put(markDemo(event))
      }

      const recovery: RecoveryCheck = {
        id: iso,
        localDate: iso,
        energy: 7 + Math.floor(Math.random() * 3),
        fatigue: 3 + Math.floor(Math.random() * 3),
        stress: 3 + Math.floor(Math.random() * 2),
        sleepHours: 7 + Math.random(),
        sleepQuality: 7 + Math.floor(Math.random() * 2),
        soreness: 3 + Math.floor(Math.random() * 2),
        motivation: 7 + Math.floor(Math.random() * 2),
        digestion: 7,
        hydration: 7 + Math.floor(Math.random() * 2),
        score: 75 + Math.floor(Math.random() * 10),
        color: 'green',
        isDemo: true,
      }
      await db.recoveryChecks.put(markDemo(recovery))

      const hydration: HydrationLog = {
        id: uuid(),
        localDate: iso,
        amountMl: 2000 + Math.floor(Math.random() * 500),
        time: new Date(date).toISOString(),
        isDemo: true,
      }
      await db.hydrationLogs.put(markDemo(hydration))
    }
  }

  for (let i = 0; i < 4; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - (3 - i) * 7)
    const measurement: BodyMeasurement = {
      id: uuid(),
      localDate: d.toISOString().slice(0, 10),
      weightKg: 80 - i * 0.5,
      heightCm: 175,
      bodyFatPct: 18 - i * 0.3,
      createdAt: new Date(d).toISOString(),
      isDemo: true,
    }
    await db.bodyMeasurements.put(markDemo(measurement))
  }

  return { routineId: DEMO_ROUTINE_ID, sessionsCreated }
}

export async function deleteDemoData(): Promise<{ deleted: number }> {
  let deleted = 0

  const allRoutines = await db.routineStore.toArray()
  const demoRoutines = allRoutines.filter((r): r is RoutineData => 'dayExercises' in r && r.isDemo === true)
  for (const r of demoRoutines) {
    await db.routineStore.delete(r.id)
    deleted++
  }

  const allSessions = await db.trainingSessions.toArray()
  const demoSessions = allSessions.filter((s): s is TrainingSession => s.isDemo === true)
  const demoSessionIds = new Set(demoSessions.map(s => s.sessionId))

  for (const s of demoSessions) {
    await db.trainingSessions.delete(s.id)
    deleted++
  }

  const allSessionExercises = await db.sessionExercises.toArray()
  const demoSessionExercises = allSessionExercises.filter((se): se is SessionExercise => se.isDemo === true)
  for (const se of demoSessionExercises) {
    await db.sessionExercises.delete(se.sessionExerciseId)
    deleted++
  }

  const allSetRecords = await db.setRecords.toArray()
  const demoSetRecords = allSetRecords.filter((sr): sr is SetRecord => sr.isDemo === true)
  for (const sr of demoSetRecords) {
    await db.setRecords.delete(sr.setRecordId)
    deleted++
  }

  const allEvents = await db.sessionEvents.toArray()
  const demoEvents = allEvents.filter(e => e.isDemo === true)
  for (const e of demoEvents) {
    await db.sessionEvents.delete(e.eventId)
    deleted++
  }

  const allSurveys = await db.postWorkoutSurveys.toArray()
  const demoSurveys = allSurveys.filter(sv => sv.isDemo === true)
  for (const sv of demoSurveys) {
    await db.postWorkoutSurveys.delete(sv.surveyId)
    deleted++
  }

  const allNegatives = await db.negativeSets.toArray()
  const demoNegatives = allNegatives.filter((n): n is NegativeSet => n.isDemo === true)
  for (const n of demoNegatives) {
    await db.negativeSets.delete(n.negativeSetId)
    deleted++
  }

  const allObservations = await db.exerciseObservations.toArray()
  const demoObservations = allObservations.filter((o): o is ExerciseObservation => o.isDemo === true)
  for (const o of demoObservations) {
    await db.exerciseObservations.delete(o.observationId)
    deleted++
  }

  const allRecovery = await db.recoveryChecks.toArray()
  const demoRecovery = allRecovery.filter((r): r is RecoveryCheck => r.isDemo === true)
  for (const r of demoRecovery) {
    await db.recoveryChecks.delete(r.id)
    deleted++
  }

  const allHydration = await db.hydrationLogs.toArray()
  const demoHydration = allHydration.filter((h): h is HydrationLog => h.isDemo === true)
  for (const h of demoHydration) {
    await db.hydrationLogs.delete(h.id)
    deleted++
  }

  const allMeasurements = await db.bodyMeasurements.toArray()
  const demoMeasurements = allMeasurements.filter((m): m is BodyMeasurement => m.isDemo === true)
  for (const m of demoMeasurements) {
    await db.bodyMeasurements.delete(m.id)
    deleted++
  }

  return { deleted }
}

export async function getDemoStatus(): Promise<{ hasDemo: boolean; routineCount: number; sessionCount: number }> {
  const allRoutines = await db.routineStore.toArray()
  const demoRoutines = allRoutines.filter((r): r is RoutineData => 'dayExercises' in r && r.isDemo === true).length
  const allSessions = await db.trainingSessions.toArray()
  const demoSessions = allSessions.filter((s): s is TrainingSession => s.isDemo === true).length
  return { hasDemo: demoRoutines > 0 || demoSessions > 0, routineCount: demoRoutines, sessionCount: demoSessions }
}

export { DEMO_MARKER, isDemoEntity, markDemo }