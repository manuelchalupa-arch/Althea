import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { generateRoutineWithAI } from './routineBuilderIA'

// FASE 2 - S7: routineBuilderIA armaba el ciclo con
// `new Date().toISOString().slice(0,10)` (dia UTC) como startDate. Sin API key
// cae al fallback local, que es justo el camino testeable: la rutina generada
// arrancaba el dia siguiente si se generaba de noche (>21:00 en Argentina).
//
// S9 - hermetizacion (NO cambia ninguna asercion): el fallback local pedia
// ejercicios con `fetchByMuscle()` (fetch REAL a cdn.jsdelivr.net) una vez por
// dia de entrenamiento, aunque este test solo verifica `cycle.startDate` y
// `cycle.trainingDays.length`, que se construyen 100% en local. Con la suite
// completa en paralelo (84 archivos) esas peticiones competing por el mismo CDN
// llegaban a pasarse del timeout de 5s de vitest y el test fallaba de forma
// intermitente sin relacion con lo que asserta. Se mockea la red con el mismo
// patron que ya usan VariantPicker/Biblioteca/Entrenar.
vi.mock('@/services/exerciseGym', () => ({
  fetchByMuscle: async (muscle: string) => ({
    muscle,
    count: 1,
    exercises: [{
      id: `mock-${muscle}`, name: 'Ejercicio mock', muscle,
      bodyPart: 'chest', equipment: 'barbell', category: 'strength',
      movementPattern: 'push', difficulty: 'intermediate',
      secondaryMuscles: [], instructions: [], file: '', gifUrl: '',
    }],
  }),
}))

const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

const wants = {
  goal: 'hipertrofia',
  daysPerWeek: 4,
  sessionDurationMin: 60,
  level: 'intermedio',
  equipment: 'gym',
} as never

describe('S7 - routineBuilderIA: el ciclo arranca en el dia LOCAL', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })
  afterEach(() => { vi.useRealTimers() })

  it('sin proxy disponible cae al fallback local (camino offline testeable)', async () => {
    const res = await generateRoutineWithAI(wants)
    // el fallback local es el que arma el ciclo con startDate = hoy local
    expect(res.cycle.trainingDays.length).toBeGreaterThan(0)
  })

  it('a las 21:30 la rutina generada arranca HOY, no manana', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))

    const res = await generateRoutineWithAI(wants)

    expect(res.cycle.startDate).toBe('2026-03-10')
    expect(res.cycle.startDate).toBe(todayKey())
    // el dia UTC habria sido manana: ese era el bug
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-03-11')
  })

  it('a la 01:00 la rutina generada arranca en el dia local', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 11, 1, 0))

    const res = await generateRoutineWithAI(wants)
    expect(res.cycle.startDate).toBe('2026-03-11')
  })
})
