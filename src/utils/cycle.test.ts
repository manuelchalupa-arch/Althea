import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { DEFAULT_CYCLE, getWeekLoads, setWeekLoad, getLoadForDate, LOAD_STATE_LABEL, type CycleConfig, type LoadState } from './cycle'
import { savePlanning, getActiveVersion, listVersions } from '@/services/planning/cycleVersions'

describe('BLOQUE 7 — Estado de carga de la semana', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('1. crear semana con estados por defecto (carga ligada a planificación real, no inventada)', () => {
    const cycle: CycleConfig = { ...DEFAULT_CYCLE }
    const loads = getWeekLoads(cycle)
    expect(loads).toHaveLength(7)
    expect(loads[1]).toBe('NORMAL') // Lunes entreno
    expect(loads[0]).toBe('CARGA_CERO') // Domingo descanso
  })

  it('2. marcar día normal', async () => {
    let cycle: CycleConfig = { ...DEFAULT_CYCLE, weekLoads: getWeekLoads(DEFAULT_CYCLE).slice() as LoadState[] }
    cycle = setWeekLoad(cycle, 1, 'NORMAL')
    expect(getWeekLoads(cycle)[1]).toBe('NORMAL')
    expect(LOAD_STATE_LABEL['NORMAL']).toBe('Normal')
    // fecha lunes 2026-09-14
    expect(getLoadForDate('2026-09-14', cycle)).toBe('NORMAL')
  })

  it('3. marcar sobrecarga', async () => {
    let cycle: CycleConfig = { ...DEFAULT_CYCLE, weekLoads: getWeekLoads(DEFAULT_CYCLE).slice() as LoadState[] }
    cycle = setWeekLoad(cycle, 2, 'SOBRECARGA')
    expect(getWeekLoads(cycle)[2]).toBe('SOBRECARGA')
    expect(getLoadForDate('2026-09-15', cycle)).toBe('SOBRECARGA') // martes
  })

  it('4. marcar carga reducida', async () => {
    let cycle: CycleConfig = { ...DEFAULT_CYCLE, weekLoads: getWeekLoads(DEFAULT_CYCLE).slice() as LoadState[] }
    cycle = setWeekLoad(cycle, 4, 'CARGA_REDUCIDA')
    expect(getWeekLoads(cycle)[4]).toBe('CARGA_REDUCIDA')
    expect(getLoadForDate('2026-09-17', cycle)).toBe('CARGA_REDUCIDA') // jueves? actually 17 is? but check dow mapping
    const dow = new Date('2026-09-17T12:00:00').getDay()
    expect(getWeekLoads(cycle)[dow]).toBe('CARGA_REDUCIDA')
  })

  it('5. marcar carga cero (día sin carga planificada)', async () => {
    let cycle: CycleConfig = { ...DEFAULT_CYCLE, weekLoads: getWeekLoads(DEFAULT_CYCLE).slice() as LoadState[] }
    cycle = setWeekLoad(cycle, 5, 'CARGA_CERO')
    expect(getWeekLoads(cycle)[5]).toBe('CARGA_CERO')
    expect(getLoadForDate('2026-09-18', cycle)).toBe('CARGA_CERO')
  })

  it('6. mostrar correctamente calendario y Rutinas: semana completa Lu-Vi con los 4 estados', async () => {
    // Semana: Lunes Normal, Martes Sobrecarga, Miércoles Carga reducida, Jueves Normal, Viernes Carga cero
    const weekLoads: LoadState[] = ['CARGA_CERO', 'NORMAL', 'SOBRECARGA', 'CARGA_REDUCIDA', 'NORMAL', 'CARGA_CERO', 'CARGA_CERO']
    const cycle: CycleConfig = { ...DEFAULT_CYCLE, weekLoads }
    // lunes 2026-09-14 = Lunes (dow 1) → Normal
    expect(getLoadForDate('2026-09-14', cycle)).toBe('NORMAL')
    // martes 15 → Sobrecarga
    expect(getLoadForDate('2026-09-15', cycle)).toBe('SOBRECARGA')
    // miércoles 16 → Carga reducida
    expect(getLoadForDate('2026-09-16', cycle)).toBe('CARGA_REDUCIDA')
    // jueves 17 → Normal
    expect(getLoadForDate('2026-09-17', cycle)).toBe('NORMAL')
    // viernes 18 → Carga cero
    expect(getLoadForDate('2026-09-18', cycle)).toBe('CARGA_CERO')
    // La planificación real: cycle.weekMap vincula con trainingDays, weekLoads visualiza sin modificar pesos/reps
    // No inferir desde métrica visual: los estados vienen de cycle.weekLoads, no de cálculo de volumen
    const loads = getWeekLoads(cycle)
    expect(loads.filter(l => l === 'NORMAL').length).toBeGreaterThanOrEqual(2)
  })

  it('7. cambiar semana (nueva semana con distinta distribución)', async () => {
    const weekA: LoadState[] = ['CARGA_CERO', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'CARGA_CERO', 'CARGA_CERO']
    const weekB: LoadState[] = ['CARGA_CERO', 'SOBRECARGA', 'SOBRECARGA', 'CARGA_REDUCIDA', 'CARGA_CERO', 'NORMAL', 'CARGA_CERO']
    let cycle: CycleConfig = { ...DEFAULT_CYCLE, weekLoads: weekA }
    expect(getWeekLoads(cycle)[1]).toBe('NORMAL')
    cycle = { ...cycle, weekLoads: weekB }
    expect(getWeekLoads(cycle)[1]).toBe('SOBRECARGA')
    expect(getLoadForDate('2026-09-14', cycle)).toBe('SOBRECARGA')
    // cambiar semana no toca pesos/reps del entrenamiento real (solo representación)
    expect(cycle.trainingDays).toEqual(DEFAULT_CYCLE.trainingDays)
  })

  it('8. persistencia (cycle con weekLoads sobrevive cierre/reapertura y versionado)', async () => {
    const weekLoads: LoadState[] = ['CARGA_CERO', 'NORMAL', 'SOBRECARGA', 'CARGA_REDUCIDA', 'NORMAL', 'CARGA_CERO', 'CARGA_CERO']
    const cycle: CycleConfig = { ...DEFAULT_CYCLE, startDate: '2026-09-14', weekLoads }
    const { version } = await savePlanning({ cycle, effectiveFrom: '2026-09-14' })
    expect(version.cycle.weekLoads).toEqual(weekLoads)
    await db.close()
    await db.open()
    const active = await getActiveVersion()
    expect(active?.cycle.weekLoads).toEqual(weekLoads)
    const all = await listVersions()
    expect(all.length).toBeGreaterThanOrEqual(1)
    // Rutina: weekLoads persiste via routineStore
    const { saveAllRoutines, getAllRoutines } = await import('@/services/storage/routineStore')
    await saveAllRoutines([{ id: 'r1', name: 'Rutina 1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), rotationDays: 30, cycle, dayExercises: {} } as never], 'r1')
    await db.close()
    await db.open()
    const routines = await getAllRoutines()
    expect((routines[0] as unknown as { cycle: CycleConfig }).cycle.weekLoads).toEqual(weekLoads)
  })
})
