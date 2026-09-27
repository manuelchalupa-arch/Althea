import { describe, it, expect, beforeEach } from 'vitest'
import { todayKey } from '@/utils/dates'
import { db } from '@/services/storage/db'
import { addDiaryEntry, getDiaryEntries } from '@/services/storage/diaryStore'
import { getMacroTotals, getMacroGoals, macroStatus, computeTotals, filterEntriesByDay, macroPercent } from './macroService'

const perfil = {
  id: 'me',
  goal: 'hipertrofia' as const,
  level: 'intermedio' as const,
  availableDays: [1, 3, 5],
  trainingTime: '18:00',
  equipment: ['barra' as const],
  units: { weight: 'kg' as const, liquid: 'ml' as const },
  lang: 'es',
  coachIntensity: 'profesional' as const,
  onboardingDone: true,
  hydrationGoalMl: 2500,
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: 'M' as const,
  activityLevel: 'moderado' as const,
  goalPrimary: 'hypertrophy' as const,
  schedule: { availableDays: [1, 3, 5] },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

function mk(id: string, date: string, macros: { calories: number; proteins: number; carbs: number; fats: number }) {
  return {
    id,
    date,
    name: `food-${id}`,
    mealType: 'desayuno',
    servingLabel: '100g',
    amount: 100,
    unit: 'g',
    macros,
    addedAt: new Date().toISOString(),
  }
}

describe('BLOQUE 3 — Nutrición y Macros (torta Proteínas/Carbohidratos/Grasas)', () => {
  const today = todayKey()
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.userProfile.put(perfil as never)
  })

  it('1. registrar proteína incrementa acumulado real', async () => {
    await addDiaryEntry(mk('p1', today, { calories: 165, proteins: 31, carbs: 0, fats: 3.6 }))
    const totals = await getMacroTotals(today)
    expect(totals.protein).toBe(31)
    expect(totals.carbs).toBe(0)
    expect(totals.fat).toBe(3.6)
  })

  it('2. comprobar incremento del segmento correspondiente (proteína) sin afectar otros', async () => {
    await addDiaryEntry(mk('p1', today, { calories: 165, proteins: 31, carbs: 0, fats: 3.6 }))
    await addDiaryEntry(mk('p2', today, { calories: 165, proteins: 10, carbs: 0, fats: 1 }))
    const totals = await getMacroTotals(today)
    expect(totals.protein).toBe(41)
    expect(totals.carbs).toBe(0)
    // gráfico usa datos reales: totals refleja Dexie
    const entries = await getDiaryEntries(today)
    const computed = computeTotals(entries)
    expect(computed.protein).toBe(totals.protein)
  })

  it('3. registrar carbohidratos actualiza carbs', async () => {
    await addDiaryEntry(mk('c1', today, { calories: 130, proteins: 2.7, carbs: 28, fats: 0.3 }))
    const totals = await getMacroTotals(today)
    expect(totals.carbs).toBe(28)
  })

  it('4. registrar grasa actualiza fats', async () => {
    await addDiaryEntry(mk('f1', today, { calories: 884, proteins: 0, carbs: 0, fats: 100 }))
    const totals = await getMacroTotals(today)
    expect(totals.fat).toBe(100)
  })

  it('5. acumulados independientes por macro (proteína, carbs, grasa)', async () => {
    await addDiaryEntry(mk('a1', today, { calories: 200, proteins: 20, carbs: 5, fats: 2 }))
    await addDiaryEntry(mk('a2', today, { calories: 300, proteins: 5, carbs: 30, fats: 3 }))
    await addDiaryEntry(mk('a3', today, { calories: 400, proteins: 2, carbs: 5, fats: 20 }))
    const totals = await getMacroTotals(today)
    expect(totals.protein).toBe(27)
    expect(totals.carbs).toBe(40)
    expect(totals.fat).toBe(25)
    // independientes: cada macro no contamina otro
    expect(totals.protein).not.toBe(totals.carbs)
  })

  it('6. objetivo alcanzado (consumido == objetivo) estado alcanzado', async () => {
    const goals = await getMacroGoals()
    // goals con 80kg: proteína ~144 (1.8*80), carbs ~ 250, fat ~70
    expect(goals.protein).toBeGreaterThan(0)
    await addDiaryEntry(mk('hit', today, { calories: goals.protein * 4, proteins: goals.protein, carbs: 0, fats: 0 }))
    const totals = await getMacroTotals(today)
    expect(totals.protein).toBe(goals.protein)
    expect(macroStatus(totals.protein, goals.protein)).toBe('alcanzado')
    expect(macroStatus(totals.carbs, goals.carbs)).toBe('normal')
  })

  it('7. objetivo superado (consumido > objetivo) advierte superado', async () => {
    const goals = await getMacroGoals()
    await addDiaryEntry(mk('over', today, { calories: (goals.protein + 10) * 4, proteins: goals.protein + 10, carbs: 0, fats: 0 }))
    const totals = await getMacroTotals(today)
    expect(totals.protein).toBe(goals.protein + 10)
    expect(macroStatus(totals.protein, goals.protein)).toBe('superado')
    // resto normal
    expect(macroStatus(totals.carbs, goals.carbs)).toBe('normal')
    // cerca del objetivo 80-99%
    const cerca = Math.floor(goals.fat * 0.85)
    expect(macroStatus(cerca, goals.fat)).toBe('cerca')
  })

  it('8. persistencia al recargar (cerrar/reabrir Dexie)', async () => {
    await addDiaryEntry(mk('persist', today, { calories: 200, proteins: 25, carbs: 20, fats: 5 }))
    const before = await getMacroTotals(today)
    expect(before.protein).toBe(25)
    await db.close()
    await db.open()
    const after = await getMacroTotals(today)
    expect(after.protein).toBe(25)
    expect(after.carbs).toBe(20)
    expect(after.fat).toBe(5)
    expect(localStorage.getItem('nutri:diario_v2:' + today)).toBeNull() // fuente es Dexie, no LS
  })

  it('9. cambio de día no mezcla consumos (acumulado real por fecha)', async () => {
    const dayA = '2026-09-18'
    const dayB = '2026-09-19'
    await addDiaryEntry(mk('a1', dayA, { calories: 200, proteins: 30, carbs: 10, fats: 5 }))
    await addDiaryEntry(mk('b1', dayB, { calories: 300, proteins: 10, carbs: 40, fats: 8 }))
    const totalsA = await getMacroTotals(dayA)
    const totalsB = await getMacroTotals(dayB)
    expect(totalsA.protein).toBe(30)
    expect(totalsA.carbs).toBe(10)
    expect(totalsB.protein).toBe(10)
    expect(totalsB.carbs).toBe(40)
    expect(totalsB.fat).toBe(8)
    expect(totalsA.fat).toBe(5)
    // hoy aislado
    const todayTotals = await getMacroTotals(today)
    expect(todayTotals.protein).toBe(0)
  })

  it('gráfico utiliza datos reales CONSUMIDO/OBJETIVO (no ficticios, no reinicia al cambiar componente)', async () => {
    const goals = await getMacroGoals()
    await addDiaryEntry(mk('real1', today, { calories: 250, proteins: 20, carbs: 30, fats: 8 }))
    await addDiaryEntry(mk('real2', today, { calories: 150, proteins: 10, carbs: 15, fats: 5 }))
    const totals = await getMacroTotals(today)
    // CONSUMIDO / OBJETIVO reales
    expect(totals.protein).toBe(30)
    expect(`${Math.round(totals.protein)}/${goals.protein}`).toBe(`${30}/${goals.protein}`)
    expect(`${Math.round(totals.carbs)}/${goals.carbs}`).toBe(`45/${goals.carbs}`)
    // no reinicia: simular remontar componente -> recarga desde Dexie mantiene acumulado
    const remounted = await getMacroTotals(today)
    expect(remounted.protein).toBe(totals.protein)
  })
})

describe('Nutrición — límite del día (00:00:00 a 00:00:00 local, sin truncar en UTC)', () => {
  it('solo cuenta las entradas cuya clave civil es exactamente la del día', () => {
    const entries = [
      { date: '2026-09-26', id: 'a' },
      { date: '2026-09-25', id: 'b' },
      { date: '2026-09-27', id: 'c' },
    ]
    expect(filterEntriesByDay(entries, '2026-09-26').map(e => e.id)).toEqual(['a'])
  })

  it('la última comida del día sigue contando y la primera del día siguiente no', () => {
    const lastNight = { date: '2026-09-26', id: '23:59', calories: 200, proteins: 10, carbs: 10, fats: 5 }
    const firstMorning = { date: '2026-09-27', id: '00:00', calories: 400, proteins: 20, carbs: 40, fats: 8 }
    const entries = [
      { ...lastNight, macros: { calories: 200, proteins: 10, carbs: 10, fats: 5 } },
      { ...firstMorning, macros: { calories: 400, proteins: 20, carbs: 40, fats: 8 } },
    ]
    expect(computeTotals(filterEntriesByDay(entries, '2026-09-26')).calories).toBe(200)
    expect(computeTotals(filterEntriesByDay(entries, '2026-09-27')).calories).toBe(400)
  })

  it('un día nuevo arranca en cero: los totales de ayer no se arrastran', () => {
    const yesterday = [{ date: '2026-09-25', macros: { calories: 3000, proteins: 200, carbs: 300, fats: 90 } }]
    expect(computeTotals(filterEntriesByDay(yesterday, '2026-09-26'))).toEqual({
      calories: 0, protein: 0, carbs: 0, fat: 0,
    })
  })

  it('la clave del día viene de la capa central de fechas, no de toISOString()', () => {
    const key = todayKey()
    // clave civil YYYY-MM-DD local
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // una entrada creada "ahora" pertenece al día de hoy
    expect(filterEntriesByDay([{ date: key }], key)).toHaveLength(1)
  })

  it('macroPercent mantiene el porcentaje real por encima de 100 y protege la división por cero', () => {
    expect(macroPercent(300, 200)).toBeCloseTo(150, 5)
    expect(macroPercent(100, 0)).toBe(0)
    expect(macroPercent(0, 200)).toBe(0)
    expect(macroPercent(-5, 200)).toBe(0)
  })
})
