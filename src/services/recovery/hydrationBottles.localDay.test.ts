import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import {
  completeBottle,
  getBottleDailySummary,
  getBottleHistory,
  getCalculatedHydrationGoal,
  calcHydrationGoalMl,
  saveBottleConfigs,
  type BottleConfig,
} from './hydrationBottles'

// FASE 2 - S7: los 4 default de fecha de hidratacion usaban
// `new Date().toISOString().slice(0,10)` (dia UTC). En Argentina, de 21:00 a
// 23:59 locales el dia UTC ya es el siguiente, asi que:
//   - el agua se guardaba en el dia de manana,
//   - el resumen mostraba 0 ml a la noche,
//   - la meta no contaba la sesion de hoy,
//   - la ventana de 7 dias arrancaba un dia antes entre 00:00 y 03:00.
// El runner de tests corre en America/Buenos_Aires (UTC-3): aca se reproduce.
const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

describe('S7 - Hidratacion: el dia es el local, no el UTC', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => { vi.useRealTimers() })

  const cfgs: BottleConfig[] = [
    { id: 'b1', name: 'Pequena', capacityMl: 500, capacityLiters: 0.5, active: true, order: 1 },
    { id: 'b2', name: 'Grande', capacityMl: 1000, capacityLiters: 1, active: true, order: 2 },
  ]

  it('completeBottle a las 21:30 registra el dia LOCAL (antes guardaba el de manana)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))
    await saveBottleConfigs(cfgs)

    const log = await completeBottle('b1')

    expect(log.localDate).toBe('2026-03-10')
    expect(log.localDate).toBe(todayKey())
    // el dia UTC habria sido manana: ese era el bug
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-03-11')
  })

  it('completeBottle a las 23:59 sigue siendo el dia local', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 23, 59))
    await saveBottleConfigs(cfgs)

    expect((await completeBottle('b2')).localDate).toBe('2026-03-10')
  })

  it('getBottleDailySummary sin argumento devuelve el dia local a la noche', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 22, 0))
    await saveBottleConfigs(cfgs)
    await completeBottle('b1')

    const summary = await getBottleDailySummary()

    expect(summary.date).toBe('2026-03-10')
    expect(summary.totalMl).toBe(500) // no 0: antes vedía el dia equivocado
  })

  it('getCalculatedHydrationGoal cuenta la sesion del dia local a la noche', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 45))
    await db.userProfile.put({ id: 'me', weightKg: 70, activityLevel: 'poco_activo' } as never)
    await db.trainingSessions.put({
      id: 's1', userId: 'me', routineId: 'r1', routineName: 'Rutina',
      calendarDate: '2026-03-10', sessionStatus: 'COMPLETED', createdAt: new Date().toISOString(),
    } as never)

    const goal = await getCalculatedHydrationGoal()

    // 70*35=2450 +100 (poco activo, redondeo a 100) +500 (entreno hoy) = 3000
    expect(goal).toBe(calcHydrationGoalMl({ weightKg: 70, activityLevel: 'poco_activo', hasTrainingToday: true }))
    expect(goal).toBe(3000)
    // si la sesión del día local NO se detectara, la meta sería 500 ml menor
    expect(goal).toBe(calcHydrationGoalMl({ weightKg: 70, activityLevel: 'poco_activo', hasTrainingToday: false }) + 500)
  })

  it('getBottleHistory: la ventana de 7 dias a la 01:00 no arranca un dia antes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 11, 1, 0))
    await saveBottleConfigs(cfgs)

    // 6 dias atras (dentro de la ventana de 7) y 7 dias atras (fuera)
    for (const d of ['2026-03-05', '2026-03-04']) {
      await db.hydrationBottleLogs.put({
        id: `log-${d}`, localDate: d, bottleId: 'b1', amountMl: 500, time: atLocal(2026, 3, Number(d.slice(-2)), 10, 0).toISOString(),
      } as never)
    }

    const history = await getBottleHistory(7)
    const dates = history.map(h => h.date).sort()

    expect(dates).toContain('2026-03-05') // -6 días: dentro
    expect(dates).not.toContain('2026-03-04') // -7 días: fuera
    expect(dates).toEqual(['2026-03-05'])
  })
})
