import { describe, it, expect, beforeEach } from 'vitest'
import { todayKey } from '@/utils/dates'
import { db } from '@/services/storage/db'
import {
  getBottleConfigs,
  saveBottleConfigs,
  updateBottleConfig,
  completeBottle,
  getBottleDailySummary,
  getCalculatedHydrationGoal,
  calcHydrationGoalMl,
  addHydrationMl,
  MANUAL_BOTTLE_ID,
  type BottleConfig,
} from './hydrationBottles'

describe('BLOQUE 2 — Botellas de Agua', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('addHydrationMl deja el mismo registro en la botella y en hydrationLogs', async () => {
    const log = await addHydrationMl(250)
    expect(log.amountMl).toBe(250)
    expect(log.bottleId).toBe(MANUAL_BOTTLE_ID)

    const bottle = await db.hydrationBottleLogs.get(log.id)
    const legacy = await db.hydrationLogs.get(log.id)
    expect(bottle?.amountMl).toBe(250)
    expect(legacy?.amountMl).toBe(250)
    expect(legacy?.isDemo).toBe(false)
  })

  it('el bucket manual suma al total pero no aparece en el desglose por botella', async () => {
    await addHydrationMl(250)
    await addHydrationMl(250)
    const sum = await getBottleDailySummary(todayKey())
    expect(sum.totalMl).toBe(500)
    expect(sum.perBottle.find(b => b.bottleId === MANUAL_BOTTLE_ID)).toBeUndefined()
  })

  it('addHydration (recoveryService) es visible en la botella', async () => {
    const { addHydration, getTodayHydration } = await import('./recoveryService')
    await addHydration(300)
    expect(await getTodayHydration()).toBe(300)
    expect((await getBottleDailySummary(todayKey())).totalMl).toBe(300)
  })

  it('rechaza cantidades no positivas', async () => {
    await expect(addHydrationMl(0)).rejects.toThrow()
    await expect(addHydrationMl(-5)).rejects.toThrow()
    await expect(addHydrationMl(NaN)).rejects.toThrow()
  })

  it('1. configurar dos botellas (2 activas, 1 inactiva)', async () => {
    const cfgs = await getBottleConfigs()
    // defaults: 2 activas, 1 inactiva
    expect(cfgs.filter(c => c.active).length).toBe(2)
    const toSave: BottleConfig[] = [
      { id: 'bottle-1', name: 'Pequeña', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'Grande', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'Gigante', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ]
    await saveBottleConfigs(toSave)
    const after = await getBottleConfigs()
    expect(after.filter(c => c.active).length).toBe(2)
    expect(after.find(c => c.id === 'bottle-1')?.capacityMl).toBe(750)
    expect(after.find(c => c.id === 'bottle-2')?.capacityMl).toBe(1000)
  })

  it('2. configurar tres botellas', async () => {
    const cfgs: BottleConfig[] = [
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: true, order: 3 },
    ]
    await saveBottleConfigs(cfgs)
    const after = await getBottleConfigs()
    expect(after.filter(c => c.active).length).toBe(3)
    expect(after.find(c => c.id === 'bottle-3')?.active).toBe(true)
  })

  it('3. cambiar capacidad persiste en Dexie', async () => {
    await getBottleConfigs() // seed
    await updateBottleConfig('bottle-1', { capacityLiters: 0.5 })
    let cfgs = await getBottleConfigs()
    expect(cfgs.find(c => c.id === 'bottle-1')?.capacityMl).toBe(500)
    await updateBottleConfig('bottle-1', { capacityMl: 800 })
    cfgs = await getBottleConfigs()
    expect(cfgs.find(c => c.id === 'bottle-1')?.capacityMl).toBe(800)
    expect(cfgs.find(c => c.id === 'bottle-1')?.capacityLiters).toBe(0.8)
  })

  it('4. completar botella 1 una vez → suma exactamente su capacidad', async () => {
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ])
    await completeBottle('bottle-1')
    const sum = await getBottleDailySummary()
    expect(sum.totalMl).toBe(750)
    expect(sum.totalLiters).toBeCloseTo(0.75)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(1)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.totalMl).toBe(750)
  })

  it('5. completar botella 1 dos veces → 2 × capacidad', async () => {
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ])
    await completeBottle('bottle-1')
    await completeBottle('bottle-1')
    const sum = await getBottleDailySummary()
    expect(sum.totalMl).toBe(1500)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(2)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.totalMl).toBe(1500)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.totalLiters).toBeCloseTo(1.5)
  })

  it('6. completar botellas diferentes → suma combinada', async () => {
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ])
    await completeBottle('bottle-1')
    await completeBottle('bottle-2')
    const sum = await getBottleDailySummary()
    expect(sum.totalMl).toBe(1750)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(1)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-2')?.count).toBe(1)
  })

  it('7. comprobar cálculo exacto de litros: 2×0.75 + 1×1.00 = 2.50 L', async () => {
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ])
    await completeBottle('bottle-1')
    await completeBottle('bottle-1')
    await completeBottle('bottle-2')
    const sum = await getBottleDailySummary()
    expect(sum.totalMl).toBe(2500)
    expect(sum.totalLiters).toBeCloseTo(2.5)
    // verificar litros aportados por botella
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.totalLiters).toBeCloseTo(1.5)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-2')?.totalLiters).toBeCloseTo(1.0)
    // también verificar que cantidad veces es correcta
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(2)
    expect(sum.perBottle.find(p => p.bottleId === 'bottle-2')?.count).toBe(1)
  })

  it('8. cerrar/reabrir Dexie y comprobar persistencia (config + logs)', async () => {
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 600, capacityLiters: 0.6, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 900, capacityLiters: 0.9, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1200, capacityLiters: 1.2, active: false, order: 3 },
    ])
    await completeBottle('bottle-1')
    await completeBottle('bottle-2')

    const beforeSum = await getBottleDailySummary()
    expect(beforeSum.totalMl).toBe(1500)

    await db.close()
    await db.open()

    const afterCfgs = await getBottleConfigs()
    expect(afterCfgs.find(c => c.id === 'bottle-1')?.capacityMl).toBe(600)
    expect(afterCfgs.find(c => c.id === 'bottle-2')?.capacityMl).toBe(900)

    const afterSum = await getBottleDailySummary()
    expect(afterSum.totalMl).toBe(1500)
    expect(afterSum.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(1)
    expect(afterSum.perBottle.find(p => p.bottleId === 'bottle-2')?.count).toBe(1)

    // también verificar que la fuente es Dexie, no localStorage
    expect(localStorage.getItem('hydrationBottles')).toBeNull()
  })

  it('9. cambiar de día y verificar que el contador diario no se mezcle', async () => {
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ])
    const dayA = '2026-01-10'
    const dayB = '2026-01-11'
    await completeBottle('bottle-1', dayA)
    await completeBottle('bottle-1', dayA)
    await completeBottle('bottle-2', dayB)

    const sumA = await getBottleDailySummary(dayA)
    const sumB = await getBottleDailySummary(dayB)

    expect(sumA.totalMl).toBe(1500)
    expect(sumA.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(2)
    expect(sumA.perBottle.find(p => p.bottleId === 'bottle-2')?.count).toBe(0)

    expect(sumB.totalMl).toBe(1000)
    expect(sumB.perBottle.find(p => p.bottleId === 'bottle-2')?.count).toBe(1)
    expect(sumB.perBottle.find(p => p.bottleId === 'bottle-1')?.count).toBe(0)

    // el día de hoy sigue en 0 si no se completó hoy
    const today = todayKey()
    if (today !== dayA && today !== dayB) {
      const todaySum = await getBottleDailySummary(today)
      expect(todaySum.totalMl).toBe(0)
    }
  })

  it('10. objetivo diario sigue siendo calculado independientemente (no se inventa, no es editable)', async () => {
    // perfil con peso y actividad
    await db.userProfile.put({
      id: 'me',
      goal: 'hipertrofia',
      level: 'intermedio',
      availableDays: [1, 3, 5],
      trainingTime: '18:00',
      equipment: ['barra'],
      units: { weight: 'kg', liquid: 'ml' },
      lang: 'es',
      coachIntensity: 'profesional',
      onboardingDone: true,
      hydrationGoalMl: 2500,
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: 'M',
      activityLevel: 'moderado',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any)

    const goal = await getCalculatedHydrationGoal()
    // 70*35=2450 +150 moderado =2600 (sin entreno hoy)
    expect(goal).toBeGreaterThan(2000)
    expect(goal).toBeLessThan(4000)

    // completar botellas NO cambia el objetivo
    await saveBottleConfigs([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, capacityLiters: 0.75, active: true, order: 1 },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, capacityLiters: 1.0, active: true, order: 2 },
      { id: 'bottle-3', name: 'B3', capacityMl: 1500, capacityLiters: 1.5, active: false, order: 3 },
    ])
    await completeBottle('bottle-1')
    const goalAfter = await getCalculatedHydrationGoal()
    expect(goalAfter).toBe(goal)

    // cálculo puro sin Dexie: calcHydrationGoalMl no inventa valores estáticos, depende de inputs
    expect(calcHydrationGoalMl({ weightKg: 70, activityLevel: 'moderado' })).not.toBe(calcHydrationGoalMl({ weightKg: 80, activityLevel: 'moderado' }))
    expect(calcHydrationGoalMl({ weightKg: undefined })).toBe(2500) // fallback sin peso
    expect(calcHydrationGoalMl({ weightKg: 70, activityLevel: 'moderado', hasTrainingToday: true })).toBeGreaterThan(calcHydrationGoalMl({ weightKg: 70, activityLevel: 'moderado', hasTrainingToday: false }))
  })
})
