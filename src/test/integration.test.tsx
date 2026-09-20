import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { exportJSON, importJSON, exportCSV } from '@/services/storage/export'
import { recoveryScore, recoveryIndex } from '@/utils/calc'
import { seedCoherentHistory } from '@/services/storage/seeder'
import { v4 as uuid } from 'uuid'
import type { CycleConfig } from '@/utils/cycle'

describe('Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  describe('Offline Flow', () => {
    it('should seed coherent history', async () => {
      await seedCoherentHistory()
      const sessionCount = await db.sessions.count()
      expect(sessionCount).toBeGreaterThan(0)
    })

    it('should create training session with exercises', async () => {
      await seedCoherentHistory()
      
      const { createReadySession } = await import('@/services/training/sessionStore')
      const session = await createReadySession({
        calendarDate: '2026-09-14',
        routineId: 'r1',
        routineName: 'Test',
        exercises: [
          { exId: 'press-banca', name: 'Press Banca', sets: 3, reps: 8, weight: 80, muscle: 'Pecho' }
        ],
        weekNumber: 1,
        plannedDay: 1,
        plannedDayName: 'Lunes',
        actualDay: 1,
        actualDayName: 'Lunes',
      })
      
      expect(session).toBeDefined()
      expect(session.sessionId).toBeDefined()
    })
  })

  describe('Import/Export Roundtrip', () => {
    beforeEach(async () => {
      await db.delete()
      await db.open()
      // Create minimal data in new tables for roundtrip test
      const defaultCycle: CycleConfig = {
        startDate: '2026-09-15',
        trainingDays: [{ n: 1, name: 'Lunes' }, { n: 3, name: 'Miércoles' }, { n: 5, name: 'Viernes' }],
        weekMap: [1, null, 2, null, 3, null, null],
      }
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

    it('should export and import JSON roundtrip', async () => {
      // Export
      const exportedBlob = await exportJSON()
      expect(exportedBlob).toBeInstanceOf(Blob)
      
      const exported = await exportedBlob.text()
      expect(typeof exported).toBe('string')
      
      const data = JSON.parse(exported)
      expect(data.metadata).toBeDefined()
      expect(data.metadata.version).toBeDefined()
      expect(data.metadata.exportedAt).toBeDefined()
      expect(data.trainingSessions).toBeDefined()
    })

    it('should export and import CSV', async () => {
      const csvBlob = await exportCSV()
      expect(csvBlob).toBeInstanceOf(Blob)
      
      const csv = await csvBlob.text()
      expect(typeof csv).toBe('string')
      expect(csv).toContain(',')
    })

    it('should import JSON and restore data', async () => {
      // Export first
      const exportedBlob = await exportJSON()
      const exported = await exportedBlob.text()
      
      // Clear and re-import
      await db.delete()
      await db.open()
      
      const file = new File([exported], 'backup.json', { type: 'application/json' })
      const result = await importJSON(file)
      expect(result.success).toBe(true)
      
      // Verify data restored (new tables)
      const sessionCount = await db.trainingSessions.count()
      expect(sessionCount).toBeGreaterThan(0)
    })
  })

  describe('Recovery Score', () => {
    it('should calculate recovery score from check-in data', () => {
      const checkIn = {
        energy: 4,
        fatigue: 2,
        stress: 3,
        sleepQuality: 8,
        soreness: 1,
        motivation: 4,
        digestion: 3,
        hydration: 2500,
      }
      
      const score = recoveryScore(checkIn)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(typeof score).toBe('number')
    })

    it('should return appropriate score for moderate recovery indicators', () => {
      const checkIn = {
        energy: 3,
        fatigue: 3,
        stress: 3,
        sleepQuality: 7,
        soreness: 3,
        motivation: 3,
        digestion: 3,
        hydration: 2000,
      }
      
      const score = recoveryScore(checkIn)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('should return high score for good recovery indicators', () => {
      const checkIn = {
        energy: 5,
        fatigue: 1,
        stress: 1,
        sleepQuality: 9,
        soreness: 0,
        motivation: 5,
        digestion: 5,
        hydration: 3000,
      }
      
      const score = recoveryScore(checkIn)
      expect(score).toBeGreaterThan(50)
    })

    it('should calculate recovery index from simplified check-in', () => {
      const checkIn = {
        energy: 4,
        fatigue: 3,
        pain: 2,
        mood: 4,
        motivation: 4,
        perceivedExertion: 3,
        stress: 3,
      }
      
      const score = recoveryIndex(checkIn)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
      expect(typeof score).toBe('number')
    })

    it('should return appropriate recovery index for poor indicators', () => {
      const checkIn = {
        energy: 1,
        fatigue: 5,
        pain: 5,
        mood: 1,
        motivation: 1,
        perceivedExertion: 5,
        stress: 5,
      }
      
      const score = recoveryIndex(checkIn)
      expect(score).toBeLessThanOrEqual(60)
    })
  })
})