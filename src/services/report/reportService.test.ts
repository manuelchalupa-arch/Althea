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
