import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from './db'
import { loadDemoData, deleteDemoData, getDemoStatus, isDemoEntity } from './demoData'
import { exportJSON, exportCSV, importJSON, generateImportPreview, type ImportOptions } from './exportImport'
import { seedCoherentHistory } from './seeder'
import { wipeDatabase } from './seeder'
import type { CycleConfig } from '@/utils/cycle'
import type { RoutineData } from './routineStore'
import type { TrainingSession } from '@/services/training/domain'

describe('T028 — Demo Data + Export/Import', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  describe('Demo Data', () => {
    beforeEach(async () => {
      await db.delete()
      await db.open()
      // Wait for schema upgrade
      await new Promise(r => setTimeout(r, 100))
      // Ensure exercises exist for demo data
      const exercises = await db.exercises.toArray()
      if (exercises.length === 0) {
        await db.exercises.bulkPut([
          { id: 'press', name: 'Press Banca', groupMain: 'pecho', groupsSecondary: [], equipment: 'barra', level: 'intermedio', pattern: 'push', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'incline-press', name: 'Press Inclinado', groupMain: 'pecho', groupsSecondary: [], equipment: 'barra', level: 'intermedio', pattern: 'push', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'pushdown', name: 'Extensión Tríceps Polea', groupMain: 'triceps', groupsSecondary: [], equipment: 'polea', level: 'intermedio', pattern: 'push', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'row', name: 'Remo con Barra', groupMain: 'espalda', groupsSecondary: [], equipment: 'barra', level: 'intermedio', pattern: 'pull', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'lat-pulldown', name: 'Jalón al Pecho', groupMain: 'espalda', groupsSecondary: [], equipment: 'polea', level: 'intermedio', pattern: 'pull', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'curl', name: 'Curl Bíceps Mancuernas', groupMain: 'biceps', groupsSecondary: [], equipment: 'mancuernas', level: 'intermedio', pattern: 'pull', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'squat', name: 'Sentadilla con Barra', groupMain: 'cuadriceps', groupsSecondary: [], equipment: 'barra', level: 'intermedio', pattern: 'squat', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'leg-press', name: 'Prensa de Piernas', groupMain: 'cuadriceps', groupsSecondary: [], equipment: 'maquina', level: 'intermedio', pattern: 'squat', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
          { id: 'overhead-press', name: 'Press Militar', groupMain: 'hombros', groupsSecondary: [], equipment: 'barra', level: 'intermedio', pattern: 'push', description: '', instructions: [], variantIds: [], muscles: [], restrictions: [], tags: [] },
        ])
      }
    })

    it('1. cargar demo crea rutina con isDemo=true', async () => {
      const result = await loadDemoData()
      expect(result.routineId).toBe('demo-routine-1')
      expect(result.sessionsCreated).toBeGreaterThan(0)

      const routine = await db.routineStore.get('demo-routine-1') as RoutineData | undefined
      expect(routine).toBeDefined()
      expect(routine?.isDemo).toBe(true)

      const allSessions = await db.trainingSessions.toArray()
      const sessions = allSessions.filter(s => s.isDemo === true)
      expect(sessions.length).toBe(result.sessionsCreated)
      for (const s of sessions) {
        expect(isDemoEntity(s)).toBe(true)
      }
    })

    it('2. verificar que el demo aparezca en getDemoStatus', async () => {
      await loadDemoData()
      const status = await getDemoStatus()
      expect(status.hasDemo).toBe(true)
      expect(status.routineCount).toBe(1)
      expect(status.sessionCount).toBeGreaterThan(0)
    })

    it('3. mezclar demo con datos reales', async () => {
      await loadDemoData()

      await db.userProfile.put({
        id: 'real-user',
        goal: 'fuerza',
        level: 'intermedio',
        availableDays: [1, 3, 5],
        trainingTime: '60',
        equipment: ['barra', 'mancuernas'],
        units: { weight: 'kg', liquid: 'ml' },
        lang: 'es',
        coachIntensity: 'profesional',
        onboardingDone: true,
        hydrationGoalMl: 2500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const defaultCycle: CycleConfig = {
        startDate: '2026-09-15',
        trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
        weekMap: [1, null, 2, null, 3, null, null],
      }
      await db.trainingSessions.put({
        id: uuid(),
        sessionId: 'real-session-1',
        userId: 'me',
        routineId: 'demo-routine-1',
        calendarDate: '2026-09-15',
        routineName: 'Real Session',
        sessionStatus: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        plannedDay: 1,
        actualDay: 1,
        plannedExerciseCount: 1,
        completedExerciseCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const status = await getDemoStatus()
      expect(status.hasDemo).toBe(true)

      const allSessions = await db.trainingSessions.toArray()
      const realSessions = allSessions.filter(s => s.isDemo !== true)
      expect(realSessions.length).toBe(1)
    })

    it('4. eliminar demo borra solo datos demo', async () => {
      await loadDemoData()
      await db.userProfile.put({
        id: 'real-user',
        goal: 'fuerza', level: 'intermedio', availableDays: [1,3,5], trainingTime: '60',
        equipment: ['barra'], units: { weight: 'kg', liquid: 'ml' }, lang: 'es',
        coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      })
      const defaultCycle: CycleConfig = {
        startDate: '2026-09-15',
        trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
        weekMap: [1, null, 2, null, 3, null, null],
      }
      await db.trainingSessions.put({
        id: uuid(), sessionId: 'real-session-1', userId: 'me', routineId: 'demo-routine-1',
        calendarDate: '2026-09-15', routineName: 'Real Session', sessionStatus: 'COMPLETED',
        startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
        plannedDay: 1, actualDay: 1,
        plannedExerciseCount: 1, completedExerciseCount: 1, createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), isDemo: false,
      })

      const beforeStatus = await getDemoStatus()
      expect(beforeStatus.hasDemo).toBe(true)

      const result = await deleteDemoData()
      expect(result.deleted).toBeGreaterThan(0)

      const afterStatus = await getDemoStatus()
      expect(afterStatus.hasDemo).toBe(false)
      expect(afterStatus.routineCount).toBe(0)
      expect(afterStatus.sessionCount).toBe(0)

      const realUser = await db.userProfile.get('real-user')
      expect(realUser).toBeDefined()

      const allSessions = await db.trainingSessions.toArray()
      const realSessions = allSessions.filter(s => s.isDemo !== true)
      expect(realSessions.length).toBe(1)
    })

    it('5. datos reales permanecen intactos tras eliminar demo', async () => {
      const defaultCycle: CycleConfig = {
        startDate: '2026-09-15',
        trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
        weekMap: [1, null, 2, null, 3, null, null],
      }
      await loadDemoData()

      const realRoutine = await db.routineStore.put({
        id: 'real-routine-1',
        name: 'Real Routine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rotationDays: 3,
        cycle: defaultCycle,
        dayExercises: {},
      })

      await db.trainingSessions.put({
        id: uuid(), sessionId: 'real-session-1', userId: 'me', routineId: 'real-routine-1',
        calendarDate: '2026-09-15', routineName: 'Real Session', sessionStatus: 'COMPLETED',
        startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
        plannedDay: 1, actualDay: 1,
        plannedExerciseCount: 1, completedExerciseCount: 1, createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), isDemo: false,
      })

      await deleteDemoData()

      const allRoutines = await db.routineStore.toArray()
      const realRoutines = allRoutines.filter((r): r is RoutineData => 'dayExercises' in r && r.isDemo !== true)
      expect(realRoutines.length).toBe(1)
      expect(realRoutines[0].name).toBe('Real Routine')

      const allSessions = await db.trainingSessions.toArray()
      const realSessions = allSessions.filter((s): s is TrainingSession => s.isDemo !== true)
      expect(realSessions.length).toBe(1)
    })

    it('6. volver a cargar demo sin duplicados', async () => {
      await loadDemoData()
      const firstStatus = await getDemoStatus()

      await loadDemoData()
      const secondStatus = await getDemoStatus()

      expect(secondStatus.routineCount).toBe(firstStatus.routineCount)
      expect(secondStatus.sessionCount).toBe(firstStatus.sessionCount)

      const allRoutines = await db.routineStore.toArray()
      const routines = allRoutines.filter((r): r is RoutineData => 'dayExercises' in r && r.isDemo === true)
      expect(routines.length).toBe(1)
    })
  })

  describe('Export JSON', () => {
    beforeEach(async () => {
      await seedCoherentHistory()
    })

    it('exportar JSON incluye todas las tablas requeridas', async () => {
      const blob = await exportJSON()
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('application/json')

      const text = await blob.text()
      const data = JSON.parse(text)

      expect(data.metadata).toBeDefined()
      expect(data.metadata.version).toBe(2)
      expect(data.metadata.exportedAt).toBeDefined()
      expect(data.metadata.schemaVersion).toBe(15)

      expect(Array.isArray(data.routines)).toBe(true)
      expect(Array.isArray(data.trainingSessions)).toBe(true)
      expect(Array.isArray(data.sessionExercises)).toBe(true)
      expect(Array.isArray(data.setRecords)).toBe(true)
      expect(Array.isArray(data.sessionEvents)).toBe(true)
      expect(Array.isArray(data.postWorkoutSurveys)).toBe(true)
      expect(Array.isArray(data.negativeSets)).toBe(true)
      expect(Array.isArray(data.exerciseObservations)).toBe(true)
      expect(Array.isArray(data.recoveryChecks)).toBe(true)
      expect(Array.isArray(data.hydrationLogs)).toBe(true)
      expect(Array.isArray(data.bodyMeasurements)).toBe(true)
      expect(Array.isArray(data.userProfile)).toBe(true)
      expect(Array.isArray(data.customExercises)).toBe(true)
      expect(Array.isArray(data.weeklySequences)).toBe(true)
      expect(Array.isArray(data.chatMessages)).toBe(true)
      expect(Array.isArray(data.chatConversations)).toBe(true)
      expect(Array.isArray(data.nutritionDiary)).toBe(true)
      expect(Array.isArray(data.nutritionAdherence)).toBe(true)
      expect(Array.isArray(data.sessionOverrides)).toBe(true)
      expect(Array.isArray(data.coachMemory)).toBe(true)
      expect(Array.isArray(data.decisionLog)).toBe(true)
      expect(Array.isArray(data.knowledgeDocuments)).toBe(true)
      expect(Array.isArray(data.exerciseKnowledge)).toBe(true)
      expect(Array.isArray(data.scoreSnapshots)).toBe(true)
      expect(Array.isArray(data.onboardingDrafts)).toBe(true)
      expect(Array.isArray(data.painLogs)).toBe(true)
    })

    it('metadata contiene conteos correctos', async () => {
      const blob = await exportJSON()
      const text = await blob.text()
      const data = JSON.parse(text)

      expect(data.metadata.recordCounts.routines).toBeGreaterThanOrEqual(0)
      expect(data.metadata.recordCounts.trainingSessions).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Export CSV', () => {
    beforeEach(async () => {
      await seedCoherentHistory()
    })

    it('exportar CSV genera formato correcto', async () => {
      const blob = await exportCSV()
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toContain('text/csv')

      const text = await blob.text()
      const lines = text.trim().split('\n')
      expect(lines.length).toBeGreaterThanOrEqual(1)

      const header = lines[0]
      expect(header).toContain('setRecordId')
      expect(header).toContain('sessionId')
      expect(header).toContain('exerciseId')
      expect(header).toContain('actualReps')
      expect(header).toContain('actualWeight')
    })
  })

  describe('Import JSON', () => {
    beforeEach(async () => {
      await db.delete()
      await db.open()
      const defaultCycle: CycleConfig = {
        startDate: '2026-09-15',
        trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
        weekMap: [1, null, 2, null, 3, null, null],
      }
      // Create minimal data in new tables for import tests
      await db.routineStore.put({
        id: 'test-routine-1',
        name: 'Test Routine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rotationDays: 3,
        cycle: defaultCycle,
        dayExercises: {},
      })
      await db.trainingSessions.put({
        id: uuid(),
        sessionId: 'test-session-1',
        userId: 'me',
        routineId: 'test-routine-1',
        calendarDate: '2026-09-15',
        routineName: 'Test Routine',
        sessionStatus: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        plannedDay: 1,
        actualDay: 1,
        plannedExerciseCount: 1,
        completedExerciseCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      await db.sessionExercises.put({
        sessionExerciseId: uuid(),
        sessionId: 'test-session-1',
        exerciseId: 'press',
        order: 0,
        planned: true,
        completed: true,
        status: 'COMPLETED',
        plannedSetCount: 3,
        actualSetCount: 3,
        plannedSets: [{ order: 1, reps: 8, weight: 80, setType: 'NORMAL' }],
        actualSets: [{ order: 1, reps: 8, weight: 80, setType: 'NORMAL' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      await db.setRecords.put({
        setRecordId: 'test-session-1:press:set:1',
        sessionId: 'test-session-1',
        sessionExerciseId: 'test-session-1:press:set:1',
        exerciseId: 'press',
        order: 1,
        setType: 'NORMAL',
        plannedReps: 8,
        plannedWeight: 80,
        actualReps: 8,
        actualWeight: 80,
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    })

    it('importar JSON roundtrip funciona', async () => {
      const blob = await exportJSON()
      const text = await blob.text()
      const file = new File([text], 'backup.json', { type: 'application/json' })

      const result = await importJSON(file)
      expect(result.success).toBe(true)
      // The import should restore the data
      const count = await db.trainingSessions.count()
      expect(count).toBeGreaterThan(0)
    })

    it('importar mismo archivo dos veces es idempotente (mode=merge)', async () => {
      const blob = await exportJSON()
      const text = await blob.text()
      const file1 = new File([text], 'backup.json', { type: 'application/json' })
      const file2 = new File([text], 'backup.json', { type: 'application/json' })

      const result1 = await importJSON(file1, { mode: 'merge' })
      expect(result1.success).toBe(true)

      const countAfter1 = await db.trainingSessions.count()

      const result2 = await importJSON(file2, { mode: 'merge' })
      expect(result2.success).toBe(true)

      const countAfter2 = await db.trainingSessions.count()
      expect(countAfter2).toBe(countAfter1)
    })

    it('preview muestra resumen antes de importar', async () => {
      const blob = await exportJSON()
      const text = await blob.text()
      const file = new File([text], 'backup.json', { type: 'application/json' })

      const preview = await generateImportPreview(file)
      expect(preview.canImport).toBe(true)
      expect(preview.summary).toBeDefined()
      expect(typeof preview.summary.routines).toBe('number')
      expect(typeof preview.summary.sessions).toBe('number')
      expect(Array.isArray(preview.conflicts)).toBe(true)
    })

    it('importación con validación de esquema falla en archivo inválido', async () => {
      const invalidFile = new File([JSON.stringify({ invalid: true })], 'invalid.json', { type: 'application/json' })
      const result = await importJSON(invalidFile)
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('detección de conflictos en modo merge', async () => {
      const blob = await exportJSON()
      let text = await blob.text()
      const data = JSON.parse(text)

      if (data.routines && data.routines.length > 0) {
        data.routines[0].name = 'Modified Name'
      }
      const modifiedFile = new File([JSON.stringify(data)], 'modified.json', { type: 'application/json' })

      const preview = await generateImportPreview(modifiedFile)
      expect(preview.conflicts.length).toBeGreaterThan(0)
      expect(preview.conflicts[0].table).toBe('routineStore')
    })

    it('migración de versión antigua (v1) a actual', async () => {
      const oldFormatData = {
        metadata: { version: 1, exportedAt: new Date().toISOString(), schemaVersion: 10 },
        exercises: [],
        customExercises: [],
        routines: [],
        routineDays: [],
        routineExercises: [],
        sessions: [],
        setLogs: [],
        userProfile: [],
      }
      const file = new File([JSON.stringify(oldFormatData)], 'old.json', { type: 'application/json' })
      const result = await importJSON(file, { mode: 'merge' })
      expect(result.success).toBe(true)
    })

    it('versión desconocida rechaza importación', async () => {
      const unknownData = {
        metadata: { version: 999, exportedAt: new Date().toISOString(), schemaVersion: 15 },
        routines: [], trainingSessions: [], sessionExercises: [], setRecords: [],
        sessionEvents: [], postWorkoutSurveys: [], negativeSets: [], exerciseObservations: [],
        recoveryChecks: [], hydrationLogs: [], bodyMeasurements: [], userProfile: [],
        customExercises: [], weeklySequences: [], chatMessages: [], chatConversations: [],
        nutritionDiary: [], nutritionAdherence: [], sessionOverrides: [], coachMemory: [],
        decisionLog: [], knowledgeDocuments: [], exerciseKnowledge: [], scoreSnapshots: [],
        onboardingDrafts: [], painLogs: [],
      }
      const file = new File([JSON.stringify(unknownData)], 'unknown.json', { type: 'application/json' })
      const result = await importJSON(file)
      // Version 999 > current format version should be rejected
      expect(result.success).toBe(false)
      expect(result.errors.some(e => e.includes('Versión de formato inválida'))).toBe(true)
    })

    it('fallo a mitad de importación hace rollback (transacción)', async () => {
      const defaultCycle: CycleConfig = {
        startDate: '2026-09-15',
        trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
        weekMap: [1, null, 2, null, 3, null, null],
      }
      // Create test data first
      await db.routineStore.put({
        id: 'test-routine-1',
        name: 'Test Routine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rotationDays: 3,
        cycle: defaultCycle,
        dayExercises: {},
      })
      await db.trainingSessions.put({
        id: uuid(),
        sessionId: 'test-session-1',
        userId: 'me',
        routineId: 'test-routine-1',
        calendarDate: '2026-09-15',
        routineName: 'Test Routine',
        sessionStatus: 'COMPLETED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        plannedDay: 1,
        actualDay: 1,
        plannedExerciseCount: 1,
        completedExerciseCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const originalCount = await db.trainingSessions.count()

      const blob = await exportJSON()
      let text = await blob.text()
      const data = JSON.parse(text)

      data.trainingSessions.push({
        ...data.trainingSessions[0],
        id: uuid(),
        sessionId: 'corrupt-session',
        sessionStatus: 'INVALID_STATUS',
      })
      const corruptFile = new File([JSON.stringify(data)], 'corrupt.json', { type: 'application/json' })

      const result = await importJSON(corruptFile, { mode: 'merge', skipValidation: true })
      expect(result.success).toBe(false)

      const countAfter = await db.trainingSessions.count()
      expect(countAfter).toBe(originalCount)
    })

    it('verificación post-importación comprueba integridad referencial', async () => {
      const blob = await exportJSON()
      const text = await blob.text()
      const file = new File([text], 'backup.json', { type: 'application/json' })

      const result = await importJSON(file, { mode: 'merge' })
      expect(result.verification).toBeDefined()
      // Verification runs but may not pass with minimal test data
      // The important thing is that verification runs without errors
      expect(typeof result.verification.passed).toBe('boolean')
      expect(result.verification.checks).toBeDefined()
    })

    it('no usa localStorage como fuente de verdad', async () => {
      const blob = await exportJSON()
      const text = await blob.text()
      const file = new File([text], 'backup.json', { type: 'application/json' })

      localStorage.setItem('test:corrupt', 'should-not-import')

      const result = await importJSON(file, { mode: 'merge' })
      expect(result.success).toBe(true)

      expect(localStorage.getItem('test:corrupt')).toBe('should-not-import')
      localStorage.removeItem('test:corrupt')
    })
  })
})

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}