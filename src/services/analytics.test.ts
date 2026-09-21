import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import {
  muscleLoadOf, partVolumeOf, forgottenParts, isDateInPeriod,
} from './training/metrics'
import { groupSessionsByVersion, savePlanning } from './planning/cycleVersions'
import type { CycleConfig } from '@/utils/cycle'

const muscleOf = (id: string) => {
  if (id === 'ex-press') { return { primary: 'pecho', secondary: ['triceps'] } }
  if (id === 'custom/abc') { return { primary: 'cuadriceps', secondary: ['gluteos'] } }
  return null
}

describe('FASE 5 — Analítica real y mapa muscular', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('mapa: primario 1.0 + secundario 0.5 sobre volumen (no conteos)', () => {
    const r = muscleLoadOf(
      [
        { exerciseId: 'ex-press', volume: 1000 },
        { exerciseId: 'ex-press', volume: 1000 },
      ],
      muscleOf,
    )
    expect(r.totalVolume).toBe(3000) // 2×(1000 + 500)
    const pecho = r.loads.find(l => l.muscle === 'pecho')!
    const tri = r.loads.find(l => l.muscle === 'triceps')!
    expect(pecho.volume).toBe(2000)
    expect(tri.volume).toBe(1000)
    expect(pecho.sets).toBe(2)
  })

  it('mapa: ejercicio personalizado participa con sus músculos', () => {
    const r = muscleLoadOf([{ exerciseId: 'custom/abc', volume: 500 }], muscleOf)
    expect(r.loads.find(l => l.muscle === 'cuadriceps')?.volume).toBe(500)
    expect(r.loads.find(l => l.muscle === 'gluteos')?.volume).toBe(250)
  })

  it('mapa: sin info muscular va a sin-atribución, sin porcentaje inventado', () => {
    const r = muscleLoadOf([{ exerciseId: 'desconocido', volume: 400 }], muscleOf)
    expect(r.loads).toEqual([])
    expect(r.unmappedVolume).toBe(400)
    expect(r.unmappedSets).toBe(1)
  })

  it('mapa: olvidados solo con datos; vacío sin datos', () => {
    expect(forgottenParts({ pecho: 100, espalda: 0 }, ['pecho', 'espalda', 'piernas']))
      .toEqual(['espalda', 'piernas'])
    expect(forgottenParts({}, ['pecho', 'espalda'])).toEqual([])
  })

  it('mapa: volumen por parte sin doble conteo', () => {
    const { volumes, unmappedVolume } = partVolumeOf(
      [
        { exerciseId: 'a', volume: 100 },
        { exerciseId: 'b', volume: 200 },
        { exerciseId: 'zzz', volume: 50 },
      ],
      (id) => (id === 'a' ? 'chest' : id === 'b' ? 'back' : null),
    )
    expect(volumes).toEqual({ chest: 100, back: 200 })
    expect(unmappedVolume).toBe(50)
  })

  it('períodos 7/30/90/365 con límites correctos', () => {
    const today = '2026-09-21'
    // Ventana inclusiva de N días: [hoy-(N-1), hoy]
    expect(isDateInPeriod('2026-09-15', '7', { today })).toBe(true)
    expect(isDateInPeriod('2026-09-14', '7', { today })).toBe(false)
    expect(isDateInPeriod('2026-09-21', '7', { today })).toBe(true)
    expect(isDateInPeriod('2026-09-22', '7', { today })).toBe(false)
    expect(isDateInPeriod('2026-08-23', '30', { today })).toBe(true)
    expect(isDateInPeriod('2026-08-22', '30', { today })).toBe(false)
    expect(isDateInPeriod('2026-06-24', '90', { today })).toBe(true)
    expect(isDateInPeriod('2026-06-23', '90', { today })).toBe(false)
    expect(isDateInPeriod('2025-09-22', '365', { today })).toBe(true)
    expect(isDateInPeriod('2025-09-21', '365', { today })).toBe(false)
    expect(isDateInPeriod('2020-01-01', 'all', { today })).toBe(true)
    expect(isDateInPeriod('2026-09-10', 'custom', { today, customStart: '2026-09-01', customEnd: '2026-09-15' })).toBe(true)
    expect(isDateInPeriod('2026-09-20', 'custom', { today, customStart: '2026-09-01', customEnd: '2026-09-15' })).toBe(false)
  })

  it('versiones: analytics distingue v1/v2/legacy sin alterar sesiones', async () => {
    const cycle: CycleConfig = {
      startDate: '2026-09-01',
      trainingDays: [{ n: 1, name: 'Pecho' }],
      weekMap: [null, 1, null, null, null, null, null],
    }
    const v1 = await savePlanning({ cycle })
    await db.trainingSessions.put({
      id: 'a', sessionId: 'a', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-10',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    await savePlanning({ cycle: { ...cycle, startDate: '2026-10-01' } })
    const active = await db.cycleVersions.where('status').equals('active').first()
    await db.trainingSessions.put({
      id: 'b', sessionId: 'b', userId: 'me', routineId: 'r1', cycleId: active!.id,
      plannedDay: 1, actualDay: 1, calendarDate: '2026-10-05',
      sessionStatus: 'COMPLETED', createdAt: '2026-10-05T10:00:00Z', updatedAt: '2026-10-05T10:00:00Z',
    } as never)
    await db.trainingSessions.put({
      id: 'c', sessionId: 'c', userId: 'me', routineId: 'r1', cycleId: v1.version.id,
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-12',
      sessionStatus: 'COMPLETED', createdAt: '2026-09-12T10:00:00Z', updatedAt: '2026-09-12T10:00:00Z',
    } as never)
    const sessions = await db.trainingSessions.toArray()
    const groups = await groupSessionsByVersion(sessions)
    // legacy (sin versión) + v1 + v2
    expect(groups.length).toBe(3)
    const legacy = groups.find(g => g.version === null)!
    const gv1 = groups.find(g => g.version?.version === 1)!
    const gv2 = groups.find(g => g.version?.version === 2)!
    expect(legacy.sessions.map(s => s.sessionId)).toEqual(['a'])
    expect(gv1.sessions.map(s => s.sessionId)).toEqual(['c'])
    expect(gv2.sessions.map(s => s.sessionId)).toEqual(['b'])
  })
})
