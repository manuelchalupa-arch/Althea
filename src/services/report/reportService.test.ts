import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { generateReport } from './reportService'
import { addDiaryEntry } from '@/services/storage/diaryStore'

function mkSession(id: string, calendarDate: string, status: string) {
  return {
    id,
    sessionId: id,
    userId: 'u1',
    routineId: 'r1',
    calendarDate,
    sessionStatus: status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as never
}
function mkSet(sessionId: string, exerciseId: string, order: number, weight: number, reps: number, date: string) {
  return {
    setRecordId: `${sessionId}:${exerciseId}:${order}`,
    sessionId,
    sessionExerciseId: `${sessionId}-${exerciseId}`,
    exerciseId,
    order,
    setType: 'NORMAL' as const,
    plannedReps: reps,
    plannedWeight: weight,
    actualReps: reps,
    actualWeight: weight,
    status: 'COMPLETED' as const,
    completedAt: date + 'T10:00:00Z',
    createdAt: date + 'T10:00:00Z',
    updatedAt: date + 'T10:00:00Z',
  } as never
}

describe('BLOQUE 6 — Informe de Progreso real por periodo y categorías', () => {
  const today = '2026-09-20'
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('selección de período (7 días) genera informe con range correcto', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-20', 'COMPLETED')])
    const r = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    expect(r.period).toBe('7')
    expect(r.periodLabel).toBe('Últimos 7 días')
    expect(r.range.end).toBe(today)
    expect(r.range.start).toBe('2026-09-14')
  })

  it('generación con datos reales (entrenamiento/fuerza)', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-20', 'COMPLETED')])
    await db.setRecords.bulkPut([mkSet('s1', 'bench-press', 1, 80, 8, '2026-09-20'), mkSet('s1', 'bench-press', 2, 80, 6, '2026-09-20')])
    const r = await generateReport({ period: '30', categories: ['entrenamiento', 'fuerza'], today })
    expect(r.entrenamiento?.diasEntrenados).toBe(1)
    expect(r.entrenamiento?.sesiones).toBe(1)
    expect(r.entrenamiento?.volumen).toBe(80 * 8 + 80 * 6)
    expect(r.fuerza?.pesoMax).toBe(80)
    expect(r.fuerza?.rmEstimado).toBeGreaterThan(80)
    expect(r.isEmpty).toBe(false)
  })

  it('serie diaria del período (sustituye la gráfica de evolución del dashboard)', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-18', 'COMPLETED'), mkSession('s2', '2026-09-20', 'COMPLETED')])
    await db.setRecords.bulkPut([
      mkSet('s1', 'bench-press', 1, 80, 8, '2026-09-18'),
      mkSet('s2', 'bench-press', 1, 80, 5, '2026-09-20'),
      mkSet('s2', 'squat', 2, 100, 5, '2026-09-20'),
    ])
    const r = await generateReport({ period: '30', categories: ['entrenamiento'], today })
    expect(r.entrenamiento?.serieDiaria).toEqual([
      { fecha: '2026-09-18', volumen: 640, series: 1 },
      { fecha: '2026-09-20', volumen: 900, series: 2 },
    ])
    const vacio = await generateReport({ period: 'custom', customStart: '2026-09-01', customEnd: '2026-09-10', categories: ['entrenamiento'], today })
    expect(vacio.entrenamiento?.serieDiaria).toEqual([])
  })

  it('datos reales: múltiples métricas (musculos, recuperacion, nutricion)', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-20', 'COMPLETED')])
    await db.setRecords.bulkPut([mkSet('s1', 'bench-press', 1, 60, 10, '2026-09-20')])
    await db.recoveryChecks.put({ id: '2026-09-20', localDate: '2026-09-20', energy: 7, fatigue: 3, stress: 3, soreness: 2, motivation: 7, digestion: 7, hydration: 7, score: 80, color: 'green' } as never)
    await addDiaryEntry({ id: 'd1', date: '2026-09-20', name: 'Pollo', mealType: 'almuerzo', servingLabel: '100g', amount: 100, unit: 'g', macros: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 }, addedAt: '2026-09-20T13:00:00Z' })
    await db.hydrationLogs.put({ id: 'h1', localDate: '2026-09-20', amountMl: 750, time: '2026-09-20T10:00:00Z' } as never)
    const r = await generateReport({ period: '7', categories: ['musculos', 'recuperacion', 'nutricion'], today })
    expect(r.musculos).toBeDefined()
    expect(r.recuperacion?.scores.length).toBe(1)
    expect(r.recuperacion?.avgScore).toBe(80)
    expect(r.nutricion?.calorias).toBe(165)
    expect(r.nutricion?.proteinas).toBe(31)
    expect(r.nutricion?.hidratacionMl).toBe(750)
    expect(r.isEmpty).toBe(false)
  })

  it('período vacío (sin datos) → isEmpty true y no inventa números', async () => {
    const r = await generateReport({ period: '7', categories: ['entrenamiento', 'fuerza', 'nutricion'], today })
    expect(r.isEmpty).toBe(true)
    expect(r.entrenamiento?.diasEntrenados).toBe(0)
    expect(r.entrenamiento?.volumen).toBe(0)
    expect(r.fuerza?.pesoMax).toBe(0)
    expect(r.nutricion?.calorias).toBe(0)
  })

  it('período personalizado respeta rango', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-10', 'COMPLETED'), mkSession('s2', '2026-09-20', 'COMPLETED')])
    const rIn = await generateReport({ period: 'custom', customStart: '2026-09-15', customEnd: '2026-09-20', categories: ['entrenamiento'], today })
    expect(rIn.entrenamiento?.diasEntrenados).toBe(1) // solo 20
    const rAll = await generateReport({ period: 'custom', customStart: '2026-09-01', customEnd: '2026-09-20', categories: ['entrenamiento'], today })
    expect(rAll.entrenamiento?.diasEntrenados).toBe(2)
  })

  it('persistencia/consistencia: dos generaciones consecutivas iguales', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-19', 'COMPLETED')])
    await db.setRecords.bulkPut([mkSet('s1', 'squat', 1, 100, 5, '2026-09-19')])
    await addDiaryEntry({ id: 'd2', date: '2026-09-19', name: 'Arroz', mealType: 'almuerzo', servingLabel: '100g', amount: 100, unit: 'g', macros: { calories: 130, proteins: 2.7, carbs: 28, fats: 0.3 }, addedAt: '2026-09-19T13:00:00Z' })
    const sel = { period: '30' as const, categories: ['entrenamiento', 'fuerza', 'nutricion'] as unknown as import('./reportService').ReportCategory[], today }
    const r1 = await generateReport(sel)
    const r2 = await generateReport(sel)
    expect(r1.entrenamiento?.volumen).toBe(r2.entrenamiento?.volumen)
    expect(r1.fuerza?.pesoMax).toBe(r2.fuerza?.pesoMax)
    expect(r1.nutricion?.calorias).toBe(r2.nutricion?.calorias)
    await db.close()
    await db.open()
    const r3 = await generateReport(sel)
    expect(r3.entrenamiento?.diasEntrenados).toBe(r1.entrenamiento?.diasEntrenados)
  })
})

describe('Informe — gasto calórico, estado de las sesiones y conclusiones', () => {
  const today = '2026-09-20'
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  function mkTimed(id: string, date: string, status: string, start: string, end: string | null) {
    const base = mkSession(id, date, status) as Record<string, unknown>
    return {
      ...base,
      startedAt: `${date}T${start}:00Z`,
      completedAt: end ? `${date}T${end}:00Z` : undefined,
      endedAt: end ? `${date}T${end}:00Z` : undefined,
    } as never
  }

  it('el gasto del informe sale del mismo motor que Inicio e historial', async () => {
    await db.bodyMeasurements.put({ id: 'm1', localDate: '2026-09-01', weightKg: 75, createdAt: '2026-09-01T08:00:00Z' } as never)
    await db.trainingSessions.bulkPut([mkTimed('s1', '2026-09-20', 'COMPLETED', '10:00', '10:45')])

    const r = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    const gasto = r.entrenamiento?.gastoCalorico
    expect(gasto?.totalKcal).not.toBeNull()
    expect(gasto?.motivo).toBeNull()

    // Misma cuenta que haría Inicio/Calendario para esa sesión (45 min × 75 kg)
    const { estimateStrengthSession, sessionEnergy } = await import('@/services/training/exerciseEnergy')
    const esperado = sessionEnergy({
      sessionId: 's1', calendarDate: '2026-09-20', sessionStatus: 'COMPLETED',
      startedAt: '2026-09-20T10:00:00Z', completedAt: '2026-09-20T10:45:00Z',
    }, 75)
    expect(esperado!.kcal).toBe(estimateStrengthSession({ weightKg: 75, durationMinutes: 45 }).grossKcal)
    expect(gasto?.totalKcal).toBe(esperado!.kcal)
    expect(gasto?.totalMinutes).toBe(45)
  })

  it('sin peso o sin duración el gasto queda en null con motivo honesto', async () => {
    await db.trainingSessions.bulkPut([mkTimed('s1', '2026-09-20', 'COMPLETED', '10:00', '11:00')])
    const sinPeso = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    expect(sinPeso.entrenamiento?.gastoCalorico?.totalKcal).toBeNull()
    expect(sinPeso.entrenamiento?.gastoCalorico?.motivo).toBe('SIN_PESO')

    await db.bodyMeasurements.put({ id: 'm1', localDate: '2026-09-01', weightKg: 75, createdAt: '2026-09-01T08:00:00Z' } as never)
    await db.trainingSessions.clear()
    await db.trainingSessions.bulkPut([mkSession('s2', '2026-09-19', 'COMPLETED')]) // sin timestamps
    const sinDuracion = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    expect(sinDuracion.entrenamiento?.gastoCalorico?.totalKcal).toBeNull()
    expect(sinDuracion.entrenamiento?.gastoCalorico?.motivo).toBe('SIN_DURACION')
  })

  it('cuenta sesiones completadas e incompletas del período (no solo las completas)', async () => {
    await db.trainingSessions.bulkPut([
      mkSession('s1', '2026-09-18', 'COMPLETED'),
      mkSession('s2', '2026-09-19', 'PARTIAL'),
      mkSession('s3', '2026-09-21', 'CANCELLED'),
      mkSession('s4', '2026-09-12', 'COMPLETED'), // fuera del rango de 7 días
    ])
    const r = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    expect(r.entrenamiento?.completadas).toBe(1)
    expect(r.entrenamiento?.incompletas).toBe(1)
    // Día entrenado = sesión COMPLETED o PARTIAL (semántica existente de isCompletedSession)
    expect(r.entrenamiento?.diasEntrenados).toBe(2)
    // CANCELLED y fechas fuera del rango no cuentan
    expect(r.entrenamiento?.diasUnicos).toEqual(['2026-09-18', '2026-09-19'])
  })

  it('período personalizado: frecuencia y adherencia sobre los días reales del rango', async () => {
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-03', 'COMPLETED')])
    const r = await generateReport({ period: 'custom', customStart: '2026-09-01', customEnd: '2026-09-10', categories: ['entrenamiento'], today })
    // 10 días de rango → 1/10
    expect(r.entrenamiento?.frecuencia).toBe(0.1)
    expect(r.entrenamiento?.adherencia).toBe(10)
    expect(r.entrenamiento?.distribucion).toHaveLength(7)
  })

  it('distribución, días de mayor/menor actividad y comparación interna del período', async () => {
    await db.setRecords.bulkPut([
      mkSet('s1', 'bench-press', 1, 80, 8, '2026-09-16'),
      mkSet('s2', 'squat', 1, 100, 8, '2026-09-19'),
      mkSet('s2', 'squat', 2, 100, 8, '2026-09-19'),
    ])
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-16', 'COMPLETED'), mkSession('s2', '2026-09-19', 'COMPLETED')])
    const r = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    const e = r.entrenamiento!
    expect(e.distribucion.reduce((a, d) => a + d.sesiones, 0)).toBe(2)
    expect(e.diasActividad?.mayor?.fecha).toBe('2026-09-19') // 1600 kg vs 640 kg
    expect(e.diasActividad?.menor?.fecha).toBe('2026-09-16')
    expect(e.comparativa).toBeDefined()
    expect(e.comparativa?.segundaMitad).toBe(1600)
    expect(e.comparativa?.primeraMitad).toBe(640)
    expect(e.comparativa?.deltaPct).toBe(150)
    expect(e.destacados[0].exerciseId).toBe('squat')
  })

  it('records por ejercicio con el motor propio de PRs y marca dentro del período', async () => {
    await db.setRecords.bulkPut([
      mkSet('s1', 'bench-press', 1, 80, 8, '2026-09-15'),
      mkSet('s2', 'bench-press', 1, 90, 5, '2026-09-18'),
      mkSet('s3', 'bench-press', 1, 70, 10, '2026-01-05'), // histórico fuera del período
    ])
    await db.trainingSessions.bulkPut([mkSession('s1', '2026-09-15', 'COMPLETED'), mkSession('s2', '2026-09-18', 'COMPLETED'), mkSession('s3', '2026-01-05', 'COMPLETED')])
    const r = await generateReport({ period: '7', categories: ['entrenamiento', 'fuerza'], today })
    const pr = r.fuerza?.prs.find(p => p.exerciseId === 'bench-press')
    expect(pr).toBeDefined()
    expect(pr!.peso).toBe(90)           // mejor serie histórica (no solo la del período)
    expect(pr!.reps).toBe(5)
    expect(pr!.fecha).toBe('2026-09-18')
    expect(pr!.enPeriodo).toBe(true)
    expect(pr!.rm).toBeGreaterThan(90)
  })

  it('conclusiones derivadas solo de datos y estado honesto sin registros', async () => {
    const vacio = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    expect(vacio.conclusiones?.length).toBeGreaterThan(0)
    expect(vacio.conclusiones!.join(' ')).toContain('sin datos suficientes para estimar')

    await db.bodyMeasurements.put({ id: 'm1', localDate: '2026-09-01', weightKg: 75, createdAt: '2026-09-01T08:00:00Z' } as never)
    await db.trainingSessions.bulkPut([mkTimed('s1', '2026-09-18', 'COMPLETED', '10:00', '11:00'), mkTimed('s2', '2026-09-19', 'PARTIAL', '10:00', '10:30')])
    const conDatos = await generateReport({ period: '7', categories: ['entrenamiento'], today })
    const texto = conDatos.conclusiones!.join(' ')
    expect(texto).toContain('1 completadas')
    expect(texto).toContain('1 incompletas')
    expect(texto).toContain('Gasto calórico del ejercicio')
  })
})
