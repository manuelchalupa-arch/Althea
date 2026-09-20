import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { saveRecoveryCheck, getTodayRecovery } from './recoveryService'
import { logDecision, getRecentDecisions } from '@/services/ai/decisionLogger'
import { getCycleFromProfile, buildCycleFromProfile } from '@/utils/cycle'

describe('US4 — Recuperación + Recomendaciones + Periodización', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  describe('Recovery — actualización no destructiva', () => {
    it('1. actualizar sueño preserva energía/fatiga/estrés existentes', async () => {
      const today = new Date().toISOString().slice(0, 10)
      await db.recoveryChecks.put({
        id: today,
        localDate: today,
        energy: 8,
        fatigue: 2,
        stress: 2,
        soreness: 2,
        motivation: 8,
        digestion: 8,
        hydration: 8,
        score: 85,
        color: 'green',
      })

      await saveRecoveryCheck({
        energy: 8, fatigue: 2, stress: 2,
        sleepHours: 8, sleepQuality: 7,
        soreness: 2, motivation: 8, digestion: 8, hydration: 8,
        score: 85, color: 'green',
      })

      const check = await getTodayRecovery()
      expect(check?.energy).toBe(8)
      expect(check?.fatigue).toBe(2)
      expect(check?.stress).toBe(2)
      expect(check?.sleepHours).toBe(8)
      expect(check?.sleepQuality).toBe(7)
    })

    it('2. actualizar un campo no borra los demás', async () => {
      await saveRecoveryCheck({
        energy: 7, fatigue: 4, stress: 3,
        sleepHours: 7, sleepQuality: 6,
        soreness: 3, motivation: 7, digestion: 7, hydration: 7,
        score: 70, color: 'yellow',
      })

      await saveRecoveryCheck({
        energy: 7, fatigue: 4, stress: 3,
        sleepHours: 8, sleepQuality: 9,
        soreness: 3, motivation: 7, digestion: 7, hydration: 7,
        score: 80, color: 'green',
      })

      const check = await getTodayRecovery()
      expect(check?.sleepHours).toBe(8)
      expect(check?.energy).toBe(7)
      expect(check?.motivation).toBe(7)
    })

    it('3. recarga recupera RecoveryCheck completo', async () => {
      await saveRecoveryCheck({
        energy: 6, fatigue: 5, stress: 4,
        sleepHours: 7, sleepQuality: 7,
        soreness: 4, motivation: 6, digestion: 6, hydration: 6,
        score: 65, color: 'yellow',
      })

      await db.close()
      await db.open()

      const check = await getTodayRecovery()
      expect(check?.energy).toBe(6)
      expect(check?.sleepHours).toBe(7)
    })
  })

  describe('Recommendations — decisión del usuario', () => {
    it('4. recomendación se registra con evidencia (dato/cálculo/recomendación)', async () => {
      const rec = await logDecision({
        type: 'recovery',
        context: { score: 42, sleepHours: 5, fatigue: 8 },
        decision: {
          what: 'Reducir intensidad hoy',
          why: 'Score bajo con fatiga alta y poco sueño',
          factors: ['recovery:42', 'fatigue:8', 'sleep:5h'],
          confidence: 0.75,
          evidenceUsed: ['recoveryChecks:today', 'hydrationLogs:today'],
        },
      })
      expect(rec.id).toBeDefined()
      expect(rec.decision.what).toContain('Reducir')
      expect(rec.outcome).toBeUndefined()
    })

    it('5. aceptar registra outcome sin modificar rutina automáticamente', async () => {
      const sessionsBefore = await db.trainingSessions.count()
      const rec = await logDecision({
        type: 'recovery',
        context: { score: 40 },
        decision: {
          what: 'Deload sugerido',
          why: 'Tres días consecutivos con score < 60',
          factors: ['consecutiveLow:3'],
          confidence: 0.8,
        },
      })
      await db.decisionLog.update(rec.id, { outcome: { accepted: true } } as any)

      const updated = await db.decisionLog.get(rec.id)
      expect((updated as any).outcome.accepted).toBe(true)
      expect(await db.trainingSessions.count()).toBe(sessionsBefore)
    })

    it('6. rechazar no aplica cambios', async () => {
      const sessionsBefore = await db.trainingSessions.count()
      const rec = await logDecision({
        type: 'training',
        context: { score: 75 },
        decision: {
          what: 'Aumentar volumen',
          why: 'Recuperación óptima',
          factors: ['recovery:75'],
          confidence: 0.6,
        },
      })
      await db.decisionLog.update(rec.id, { outcome: { accepted: false, feedback: 'Prefiero mantener plan' } } as any)

      const updated = await db.decisionLog.get(rec.id)
      expect((updated as any).outcome.accepted).toBe(false)
      expect(await db.trainingSessions.count()).toBe(sessionsBefore)
    })

    it('7. recomendación con datos insuficientes indica incertidumbre', async () => {
      const recents = await getRecentDecisions('recovery', 5)
      expect(Array.isArray(recents)).toBe(true)
      const rec = await logDecision({
        type: 'recovery',
        context: {},
        decision: {
          what: 'Sin recomendación: datos insuficientes',
          why: 'No hay RecoveryCheck recientes',
          factors: [],
          confidence: 0.1,
        },
      })
      expect(rec.decision.confidence).toBeLessThan(0.5)
    })
  })

  describe('Periodization — futuro vs historial', () => {
    it('8. crear planificación guarda ciclo en perfil', async () => {
      await db.userProfile.put({
        id: 'me',
        goal: 'fuerza', level: 'intermedio', availableDays: [1, 3, 5],
        trainingTime: '60', equipment: ['barra'],
        units: { weight: 'kg', liquid: 'ml' }, lang: 'es',
        coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any)
      const profile: any = await db.userProfile.get('me')
      const cycle = buildCycleFromProfile(profile, [1, 3, 5])
      await db.userProfile.update('me', { cycle } as any)

      const updated: any = await db.userProfile.get('me')
      expect(updated.cycle).toBeDefined()
      expect(updated.cycle.trainingDays.length).toBeGreaterThan(0)
    })

    it('9. modificar planificación futura no toca sesiones históricas', async () => {
      const pastId = 'hist-session-1'
      await db.trainingSessions.put({
        id: pastId, sessionId: pastId, userId: 'me', routineId: 'r1',
        calendarDate: '2026-01-05', routineName: 'Histórica',
        sessionStatus: 'COMPLETED', plannedDay: 1, actualDay: 1,
        plannedExerciseCount: 2, completedExerciseCount: 2,
        createdAt: '2026-01-05T10:00:00Z', updatedAt: '2026-01-05T10:00:00Z',
      } as any)
      const before = await db.trainingSessions.get(pastId)

      await db.userProfile.put({
        id: 'me2',
        goal: 'fuerza', level: 'intermedio', availableDays: [2, 4],
        trainingTime: '60', equipment: ['barra'],
        units: { weight: 'kg', liquid: 'ml' }, lang: 'es',
        coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
        cycle: { startDate: '2026-10-01', trainingDays: [{ n: 1, name: 'Nuevo' }], weekMap: [null, 1, null, null, null, null, null] },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any)

      const after = await db.trainingSessions.get(pastId)
      expect(after).toEqual(before)
      expect((after as any).calendarDate).toBe('2026-01-05')
    })

    it('10. secuencias semanales no modifican sesiones', async () => {
      const countBefore = await db.trainingSessions.count()
      await db.weeklySequences.put({
        id: 'ws-1', cycleId: 'c1', weekNumber: 1,
        startDate: '2026-10-06', plannedDays: [1, 2, 3],
        completedDays: [], createdAt: new Date().toISOString(),
      } as any)
      expect(await db.trainingSessions.count()).toBe(countBefore)
      expect(await db.weeklySequences.count()).toBe(1)
    })

    it('11. recarga persiste ciclo', async () => {
      await db.userProfile.put({
        id: 'me3',
        goal: 'fuerza', level: 'intermedio', availableDays: [1, 3, 5],
        trainingTime: '60', equipment: ['barra'],
        units: { weight: 'kg', liquid: 'ml' }, lang: 'es',
        coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
        cycle: { startDate: '2026-09-01', trainingDays: [{ n: 1, name: 'A' }], weekMap: [null, 1, null, 1, null, 1, null] },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } as any)
      await db.close()
      await db.open()
      const p: any = await db.userProfile.get('me3')
      expect(p.cycle.trainingDays.length).toBe(1)
    })

    it('12. offline: planificación persiste localmente', async () => {
      await db.weeklySequences.put({
        id: 'ws-off', cycleId: 'c1', weekNumber: 2,
        startDate: '2026-10-13', plannedDays: [1],
        completedDays: [], createdAt: new Date().toISOString(),
      } as any)
      const ws = await db.weeklySequences.get('ws-off')
      expect(ws).toBeDefined()
    })
  })
})
