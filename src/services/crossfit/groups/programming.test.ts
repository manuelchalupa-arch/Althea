import { describe, expect, it } from 'vitest'
import {
  addDaysToLocalDate,
  getLocalWeekStart,
  isValidWeekStart,
  weekDays,
} from './programmingDates'
import { createGroupWodSnapshot } from './programmingWod'
import { validateDraft } from './programmingService'
import type { CfGroupWeekDraft } from './programmingTypes'

const monday2026 = '2026-11-30' // lunes

describe('programación — fechas locales', () => {
  it('getLocalWeekStart devuelve el lunes de la semana', () => {
    // Miércoles 2 de diciembre de 2026 → lunes 30 de noviembre
    expect(getLocalWeekStart(new Date(2026, 11, 2))).toBe('2026-11-30')
  })

  it('addDaysToLocalDate cruza meses y años correctamente', () => {
    expect(addDaysToLocalDate('2026-11-30', 0)).toBe('2026-11-30')
    expect(addDaysToLocalDate('2026-11-30', 6)).toBe('2026-12-06') // domingo
    expect(addDaysToLocalDate('2026-12-28', 4)).toBe('2027-01-01') // cruza año
  })

  it('weekDays devuelve siete días consecutivos lunes a domingo', () => {
    const days = weekDays(monday2026)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-11-30')
    expect(days[6]).toBe('2026-12-06')
    expect(new Date(2026, 11, 6).getDay()).toBe(0) // domingo, construido en hora local
  })

  it('isValidWeekStart acepta lunes y rechaza formato / días no lunes', () => {
    expect(isValidWeekStart('2026-11-30')).toBe(true)
    expect(isValidWeekStart('2026-12-01')).toBe(false) // martes
    expect(isValidWeekStart('2026-13-01')).toBe(false) // mes inválido
    expect(isValidWeekStart('not-a-date')).toBe(false)
    expect(isValidWeekStart(null)).toBe(false)
    expect(isValidWeekStart(undefined)).toBe(false)
  })
})

describe('programación — snapshot de WOD', () => {
  const wod = {
    id: 'wod-1',
    name: 'Fran',
    format: 'FOR_TIME',
    objective: 'potencia',
    modalities: ['G', 'W'],
    movements: [
      { exerciseId: 'thruster', name: 'Thruster', modality: 'W', order: 0, reps: 21, loadKg: 43 },
      { exerciseId: 'pullups', name: 'Dominadas', modality: 'G', order: 1, reps: 21 },
    ],
    equipment: ['barra'],
    instructions: ['21-15-9'],
    level: 'intermedio' as const,
    source: 'user' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('genera copia independiente con id y fecha', () => {
    const snap = createGroupWodSnapshot(wod as any)
    expect(snap.snapshotId).toMatch(/^[0-9a-f-]{36}$/)
    expect(snap.snapshotAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(snap.wod.name).toBe('Fran')
    expect(snap.wod.movements).toHaveLength(2)
  })

  it('mutar el original no altera el snapshot y viceversa', () => {
    const snap = createGroupWodSnapshot(wod as any)
    snap.wod.name = 'Cambiado'
    expect(wod.name).toBe('Fran')
    const snap2 = createGroupWodSnapshot(wod as any)
    expect(snap2.wod.name).toBe('Fran')
  })
})

describe('programación — validación de borrador', () => {
  type Day = CfGroupWeekDraft['days'][number]

  const makeDraft = (weekStart: string, days: Day[]): CfGroupWeekDraft => ({
    groupId: 'g1',
    ownerId: 'u1',
    weekStart,
    days,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'u1',
  })

  it('acepta una semana válida con 7 días', () => {
    const days = weekDays(monday2026).map((date, i) => ({
      dayIndex: i,
      date,
      kind: (i % 2 === 0 ? 'session' : 'rest') as Day['kind'],
      session: i % 2 === 0
        ? { title: 'Sesión', objective: 'Fuerza', estimatedDurationMin: 60, equipment: [], instructions: [], blocks: [{ id: 'b1', type: 'wod' as const, title: 'WOD', content: '', order: 0 }] }
        : undefined,
    }))
    expect(validateDraft(makeDraft(monday2026, days), monday2026)).toBeNull()
  })

  it('rechaza semana inválida', () => {
    expect(validateDraft(makeDraft('not-a-week', []), 'not-a-week')).toBe('Semana inválida.')
  })

  it('rechaza cantidad de días distinta de 7', () => {
    const days = weekDays(monday2026).slice(0, 6).map((date, i) => ({ dayIndex: i, date, kind: 'rest' as const }))
    expect(validateDraft(makeDraft(monday2026, days), monday2026)).toBe('La semana debe tener exactamente siete días.')
  })

  it('rechaza fechas que no corresponden a la semana', () => {
    const days = weekDays(monday2026).map((_date, i) => ({ dayIndex: i, date: '2026-01-01', kind: 'rest' as const }))
    expect(validateDraft(makeDraft(monday2026, days), monday2026)).toContain('fecha')
  })

  it('rechaza sesión sin título ni bloques', () => {
    const days = weekDays(monday2026).map((date, i) => ({
      dayIndex: i,
      date,
      kind: 'session' as const,
      session: { title: '', objective: '', estimatedDurationMin: 60, equipment: [], instructions: [], blocks: [] },
    }))
    const err = validateDraft(makeDraft(monday2026, days), monday2026)
    expect(err).toContain('título')
  })
})
