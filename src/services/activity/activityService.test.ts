import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveActivitySession,
  getActivityHistory,
  getActivityHistoryBetween,
  deleteActivitySession,
  selectVariantBySpeed,
  haversineMeters,
  haversinePathMeters,
  currentOwnerId,
} from './activityService'
import { db } from '@/services/storage/db'
import { activityCatalog } from '@/data/activityCatalog'

async function clearSessions() {
  await db.activitySessions.clear()
}

describe('activityService — persistencia', () => {
  beforeEach(clearSessions)

  it('guarda una sesión con snapshot completo', async () => {
    const r = await saveActivitySession({
      activityId: 'correr',
      calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z',
      durationMinutes: 30,
      weightKg: 70,
      variantId: '6mph',
      sessionRpe: 5,
    })
    expect(r.id).toBeTruthy()
    expect(r.userId).toBe(currentOwnerId())
    expect(r.activityName).toBe('Correr')
    expect(r.met).toBe(9.8)
    expect(r.metSourceCode).toBe('12060')
    expect(r.metEstimated).toBe(false)
    expect(r.variantId).toBe('6mph')
    expect(r.sessionRpe).toBe(5)
    expect(r.sessionLoad).toBe(150)
    expect(r.grossKcal).not.toBeNull()
    expect(r.kcalFormula).toContain('9.8')
  })

  it('rechaza RPE 0 y 6–10 en registros nuevos', async () => {
    for (const bad of [0, 6, 7, 10]) {
      await expect(saveActivitySession({
        activityId: 'correr',
        calendarDate: '2026-10-15',
        startedAt: '2026-10-15T08:00:00.000Z',
        durationMinutes: 30,
        weightKg: 70,
        variantId: '6mph',
        sessionRpe: bad,
      })).rejects.toThrow()
    }
    expect(await getActivityHistory()).toHaveLength(0)
  })

  it('los registros históricos con RPE 0–10 se conservan intactos', async () => {    await db.activitySessions.put({
      id: 'legacy_1',
      userId: currentOwnerId(),
      activityId: 'correr',
      activityName: 'Correr',
      calendarDate: '2026-09-01',
      startedAt: '2026-09-01T08:00:00.000Z',
      durationMinutes: 30,
      weightKg: 70,
      intensity: 'vigorosa',
      met: 9.8,
      metSourceCode: '12060',
      metEstimated: false,
      variantId: '6mph',
      variantLabel: '6 mph (10 min/km)',
      sessionRpe: 8,
      sessionLoad: 240,
      grossKcal: 360.2,
      netKcal: 315.1,
      kcalFormula: 'legacy',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:00:00.000Z',
    })
    const hist = await getActivityHistory()
    expect(hist).toHaveLength(1)
    expect(hist[0].sessionRpe).toBe(8)
    expect(hist[0].sessionLoad).toBe(240)
    expect(hist[0].grossKcal).toBe(360.2)
  })

  it('guarda la sesión aunque falte peso (kcal en null)', async () => {
    const r = await saveActivitySession({
      activityId: 'caminar',
      calendarDate: '2026-10-15',
      startedAt: '2026-10-15T09:00:00.000Z',
      durationMinutes: 20,
      weightKg: null,
      variantId: 'moderado',
    })
    expect(r.grossKcal).toBeNull()
    expect(r.netKcal).toBeNull()
    expect(r.kcalFormula).toBeNull()
    expect(r.sessionLoad).toBeNull()
  })

  it('el historial devuelve las sesiones más recientes primero', async () => {
    await saveActivitySession({
      activityId: 'caminar', calendarDate: '2026-10-10',
      startedAt: '2026-10-10T08:00:00.000Z', durationMinutes: 20, weightKg: 70, variantId: 'moderado',
    })
    await saveActivitySession({
      activityId: 'correr', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 30, weightKg: 70, variantId: '6mph',
    })
    const hist = await getActivityHistory()
    expect(hist.length).toBe(2)
    expect(hist[0].activityId).toBe('correr')
    expect(hist[1].activityId).toBe('caminar')
  })

  it('filtra por rango de fechas', async () => {
    await saveActivitySession({
      activityId: 'caminar', calendarDate: '2026-10-10',
      startedAt: '2026-10-10T08:00:00.000Z', durationMinutes: 20, weightKg: 70, variantId: 'moderado',
    })
    await saveActivitySession({
      activityId: 'correr', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 30, weightKg: 70, variantId: '6mph',
    })
    const range = await getActivityHistoryBetween('2026-10-14', '2026-10-16')
    expect(range.length).toBe(1)
    expect(range[0].activityId).toBe('correr')
  })

  it('elimina una sesión del usuario actual', async () => {
    const r = await saveActivitySession({
      activityId: 'caminar', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 20, weightKg: 70, variantId: 'moderado',
    })
    const ok = await deleteActivitySession(r.id)
    expect(ok).toBe(true)
    const hist = await getActivityHistory()
    expect(hist.length).toBe(0)
  })

  it('no elimina una sesión de otro usuario', async () => {
    const r = await saveActivitySession({
      activityId: 'caminar', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 20, weightKg: 70, variantId: 'moderado',
    })
    const ok = await deleteActivitySession(r.id, 'otro_usuario')
    expect(ok).toBe(false)
    const hist = await getActivityHistory()
    expect(hist.length).toBe(1)
  })

  it('aisla sesiones por userId', async () => {
    await saveActivitySession({
      activityId: 'caminar', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 20, weightKg: 70, variantId: 'moderado',
    })
    const other = await getActivityHistory('otro_usuario')
    expect(other.length).toBe(0)
    const mine = await getActivityHistory(currentOwnerId())
    expect(mine.length).toBe(1)
  })

  it('guarda distancia manual con origen y snapshot MET', async () => {
    const r = await saveActivitySession({
      activityId: 'correr', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 30, weightKg: 70,
      variantId: '6mph', sessionRpe: 4, distanceKm: 5, distanceSource: 'manual',
    })
    expect(r.distanceKm).toBe(5)
    expect(r.distanceSource).toBe('manual')
    expect(r.distanceMeters).toBe(5000)
    expect(r.calorieMethod).toBe('MET')
    expect(r.activeKcal).not.toBeNull()
    expect(r.activeKcal!).toBeLessThan(r.grossKcal!)
  })

  it('usa ACSM en cinta con distancia válida y guarda el método', async () => {
    const r = await saveActivitySession({
      activityId: 'cinta_correr', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 60, weightKg: 70,
      variantId: 'caminata', distanceKm: 4, distanceSource: 'machine', inclinePercent: 0,
    })
    expect(r.calorieMethod).toBe('ACSM_WALK')
    expect(r.grossKcal).toBeGreaterThan(0)
    expect(r.inclinePercent).toBe(0)
  })

  it('cinta fuera de rango ACSM cae a MET', async () => {
    const r = await saveActivitySession({
      activityId: 'cinta_correr', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 60, weightKg: 70,
      variantId: 'carrera', distanceKm: 7, distanceSource: 'machine',
    })
    expect(r.calorieMethod).toBe('MET')
  })

  it('kcal de máquina se guardan declaradas sin sumarse', async () => {
    const r = await saveActivitySession({
      activityId: 'bicicleta_fija', calendarDate: '2026-10-15',
      startedAt: '2026-10-15T08:00:00.000Z', durationMinutes: 30, weightKg: 70,
      variantId: 'moderado', distanceKm: 10, distanceSource: 'machine',
      powerWatts: 120, machineKcal: 250,
    })
    expect(r.machineKcal).toBe(250)
    expect(r.powerWatts).toBe(120)
    expect(r.distanceSource).toBe('machine')
    expect(r.grossKcal).not.toBe(250)
  })
})

describe('activityService — GPS y distancia', () => {
  it('haversineMeters calcula distancia razonable entre coordenadas', () => {
    // Buenos Aires → Córdoba ≈ 650 km
    const d = haversineMeters(-34.6037, -58.3816, -31.4201, -64.1888)
    expect(d).toBeGreaterThan(600000)
    expect(d).toBeLessThan(700000)
  })

  it('haversinePathMeters suma segmentos', () => {
    const pts = [
      { latitude: -34.6037, longitude: -58.3816, timestamp: new Date(), accuracy: 5 },
      { latitude: -34.6000, longitude: -58.3800, timestamp: new Date(), accuracy: 5 },
      { latitude: -34.5900, longitude: -58.3700, timestamp: new Date(), accuracy: 5 },
    ]
    const d = haversinePathMeters(pts)
    expect(d).toBeGreaterThan(0)
  })

  it('haversinePathMeters devuelve 0 con menos de 2 puntos', () => {
    expect(haversinePathMeters([])).toBe(0)
    expect(haversinePathMeters([{ latitude: 0, longitude: 0, timestamp: new Date(), accuracy: null }])).toBe(0)
  })
})

describe('activityService — selectVariantBySpeed', () => {
  it('caminar: <4 lento, <6 moderado, <8 rápido, ≥8 muy_rapido', () => {
    const caminar = activityCatalog.find(a => a.id === 'caminar')!
    expect(selectVariantBySpeed(caminar, 2)).toBe('lento')
    expect(selectVariantBySpeed(caminar, 5)).toBe('moderado')
    expect(selectVariantBySpeed(caminar, 7)).toBe('rapido')
    expect(selectVariantBySpeed(caminar, 10)).toBe('muy_rapido')
  })

  it('correr: <9 5mph, <11 6mph, <13 7mph, ≥13 8mph', () => {
    const correr = activityCatalog.find(a => a.id === 'correr')!
    expect(selectVariantBySpeed(correr, 8)).toBe('5mph')
    expect(selectVariantBySpeed(correr, 10)).toBe('6mph')
    expect(selectVariantBySpeed(correr, 12)).toBe('7mph')
    expect(selectVariantBySpeed(correr, 15)).toBe('8mph')
  })

  it('bicicleta_exterior: <16 tranquilo, <20 moderado, ≥20 vigoroso', () => {
    const bici = activityCatalog.find(a => a.id === 'bicicleta_exterior')!
    expect(selectVariantBySpeed(bici, 10)).toBe('tranquilo')
    expect(selectVariantBySpeed(bici, 17)).toBe('moderado')
    expect(selectVariantBySpeed(bici, 25)).toBe('vigoroso')
  })

  it('devuelve null para actividades sin variantes por velocidad', () => {
    const futbol = activityCatalog.find(a => a.id === 'futbol')!
    expect(selectVariantBySpeed(futbol, 10)).toBeNull()
  })
})
