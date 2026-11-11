import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  deleteResult,
  deleteWod,
  getTimerState,
  getWod,
  listResults,
  listScheduleRange,
  listWods,
  newResult,
  newScheduleEntry,
  newWod,
  saveTimerState,
  clearTimerState,
} from './cfStore'

describe('cfStore — módulo CrossFit', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('abre en v29 con las tablas CrossFit', () => {
    expect(db.verno).toBe(29)
    for (const t of ['cfWods', 'cfSchedule', 'cfResults', 'cfMarks', 'cfTimerState']) {
      expect(db.tables.some((x) => x.name === t), t).toBe(true)
    }
  })

  it('guarda, lista y borra WODs', async () => {
    const wod = await newWod({ name: 'Fran', format: 'FOR_TIME', modalities: ['W', 'G'] })
    expect(await getWod(wod.id)).toMatchObject({ name: 'Fran' })
    expect((await listWods()).map((w) => w.id)).toContain(wod.id)
    await deleteWod(wod.id)
    expect(await getWod(wod.id)).toBeNull()
  })

  it('programa sesiones por rango de fechas', async () => {
    await newScheduleEntry({ date: '2026-11-09', kind: 'M' })
    await newScheduleEntry({ date: '2026-11-11', kind: 'rest' })
    const week = await listScheduleRange('2026-11-09', '2026-11-15')
    expect(week.map((e) => e.kind)).toEqual(['M', 'rest'])
    const none = await listScheduleRange('2026-12-01', '2026-12-07')
    expect(none).toEqual([])
  })

  it('registra resultados y los ordena por fecha descendente', async () => {
    await newResult({ wodName: 'Grace', format: 'FOR_TIME', scoreText: '2:14', date: '2026-11-01', timeSec: 134 })
    await newResult({ wodName: 'Fran', format: 'FOR_TIME', scoreText: '4:30', date: '2026-11-08', timeSec: 270 })
    const list = await listResults()
    expect(list.map((r) => r.wodName)).toEqual(['Fran', 'Grace'])
    expect(list[0].timeSec).toBe(270)
    await deleteResult(list[0].id)
    expect((await listResults()).map((r) => r.wodName)).toEqual(['Grace'])
  })

  it('el cronómetro es local-only: persiste y se limpia sin tocar la cola de sync', async () => {
    await saveTimerState({
      wodId: 'w1',
      format: 'AMRAP',
      startedAtMs: 1000,
      accumulatedMs: 500,
      running: true,
      round: 2,
      movementIdx: 0,
      intervalIdx: 1,
    })
    const state = await getTimerState()
    expect(state).toMatchObject({ id: 'active', running: true, round: 2, accumulatedMs: 500 })
    await clearTimerState()
    expect(await getTimerState()).toBeNull()
    expect((await db.syncQueue.toArray()).filter((op) => op.table === 'cfTimerState').length).toBe(0)
  })
})
