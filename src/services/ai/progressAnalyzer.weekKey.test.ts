import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { todayKey, weekStartKey, weekdayOfKey, toDateKey } from '@/utils/dates'
import { analyzeExercise } from './progressAnalyzer'

// FASE 2 - S7: getWeekKey (progressAnalyzer) resolvia el lunes con el patron
// T12 local -> `toISOString().slice(0,10)`. En Argentina el resultado era
// correcto, pero es una dependencia INDIRECTA de UTC: en UTC+13/+14 devuelve
// la semana anterior (verificado empiricamente). Ahora se resuelve con
// dayKeyOffset + weekdayOfKey, la misma capa centralizada de S1M-A.
//
// Estos tests fijan el invariante observable: el lunes es el corte de semana y
// un set del domingo 23:59 local NO se mezcla con uno del lunes 00:01 local.
const mondayOf = (key: string) => weekStartKey(key)

/** Instante ISO de las 21:30 hora Argentina del dia local indicado. */
const instantAt2130AR = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 21, 30, 0, 0).toISOString()
}

const putSet = (id: string, iso: string, weight: number) =>
  db.setRecords.put({
    setRecordId: id,
    sessionId: `s-${id}`,
    sessionExerciseId: `se-${id}`,
    exerciseId: 'press',
    order: 1,
    setType: 'WORKING',
    plannedReps: 10,
    plannedWeight: weight,
    actualReps: 10,
    actualWeight: weight,
    status: 'COMPLETED',
    createdAt: iso,
    completedAt: iso,
    updatedAt: iso,
  } as never)

describe('S7 - Progreso: la semana se ancla en el dia local', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('un set a las 21:30 tiene dia civil local aunque su dia UTC sea el siguiente', () => {
    const localKey = todayKey()
    const iso = instantAt2130AR(localKey)
    expect(toDateKey(iso)).toBe(localKey)
  })

  it('el domingo local y el lunes siguiente quedan en semanas DISTINTAS', async () => {
    // 2026-09-21 es lunes, 2026-09-27 domingo, 2026-09-28 lunes
    expect(weekdayOfKey('2026-09-21')).toBe(1)
    expect(weekdayOfKey('2026-09-27')).toBe(0)
    expect(weekdayOfKey('2026-09-28')).toBe(1)

    // domingo 21:30 local -> su instante UTC ya es lunes 22
    const domingoISO = instantAt2130AR('2026-09-27')
    expect(toDateKey(domingoISO)).toBe('2026-09-27')

    // lunes siguiente 00:01 local
    const [y, m, d] = '2026-09-28'.split('-').map(Number)
    const lunesISO = new Date(y, m - 1, d, 0, 1, 0, 0).toISOString()
    expect(toDateKey(lunesISO)).toBe('2026-09-28')

    // 2 sets en la semana del 21 (100x10 c/u = 2000) y 2 en la del 28 (150x10 c/u = 3000)
    for (let i = 0; i < 2; i++) await putSet(`dom-${i}`, domingoISO, 100)
    for (let i = 0; i < 2; i++) await putSet(`lun-${i}`, lunesISO, 150)

    const res = await analyzeExercise('press', 8)
    // volumeTrend son los volumenes por semana, en orden de aparicion
    expect(res.volumeTrend).toEqual([2000, 3000])
  })

  it('31/12 y 01/01 comparten la semana del lunes 28/12, y 04/01 abre la siguiente', async () => {
    expect(mondayOf('2026-12-31')).toBe('2026-12-28') // jueves
    expect(mondayOf('2027-01-01')).toBe('2026-12-28') // viernes
    expect(mondayOf('2027-01-04')).toBe('2027-01-04') // lunes

    const dic = instantAt2130AR('2026-12-31')
    const ene = instantAt2130AR('2027-01-01')
    const lun = instantAt2130AR('2027-01-04')
    expect(toDateKey(dic)).toBe('2026-12-31')
    expect(toDateKey(ene)).toBe('2027-01-01')
    expect(toDateKey(lun)).toBe('2027-01-04')

    for (let i = 0; i < 2; i++) await putSet(`dic-${i}`, dic, 100) // 2000
    for (let i = 0; i < 3; i++) await putSet(`ene-${i}`, ene, 200) // 6000
    await putSet('lun-ene', lun, 400) // 4000 en la semana siguiente

    const res = await analyzeExercise('press', 60)
    // semana del 28/12 = 2000+6000 = 8000; semana del 04/01 = 4000
    expect(res.volumeTrend).toEqual([8000, 4000])
  })
})
