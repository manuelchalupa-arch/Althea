import { describe, it, expect } from 'vitest'
import {
  detectPerformanceDelta, detectAdherence, detectGap, detectSkipPatterns,
  detectPainZones, painMatchesMuscle, detectOvertraining, detectUnderTraining,
  detectRoutineStale, detectProteinGap, detectRestDayTraining,
  detectWeeklyGoal, detectFourWeekGoal, detectDayChangePattern,
} from './coachInsights'

// §30: cada escenario con fixtures puras.
describe('escenarios Coach (§30)', () => {
  it('8/9. caída y mejora de rendimiento', () => {
    const down = detectPerformanceDelta([
      { date: '2026-09-01', weight: 80, reps: 8 },
      { date: '2026-09-08', weight: 75, reps: 6 },
    ])! // 640 -> 450 = -30%
    expect(down.id).toBe('perf-down')
    expect(down.level).toBe('warn')
    expect(down.question).toBeTruthy()
    const up = detectPerformanceDelta([
      { date: '2026-09-01', weight: 80, reps: 8 },
      { date: '2026-09-08', weight: 80, reps: 10 },
    ])! // 640 -> 800
    expect(up.id).toBe('perf-up')
    expect(up.level).toBe('info')
  })

  it('16. sin historial no inventa', () => {
    expect(detectPerformanceDelta([{ date: 'x', weight: 80, reps: 8 }])).toBeNull()
    expect(detectAdherence([], [])).toBeNull()
    expect(detectGap([], '2026-09-10')).toBeNull()
    expect(detectSkipPatterns([])).toBeNull()
    expect(detectPainZones([])).toBeNull()
    expect(detectOvertraining([1, 2], [80])).toBeNull()
    expect(detectUnderTraining(0, 0, 0)).toBeNull()
    expect(detectRoutineStale(10, false, 2)).toBeNull()
    expect(detectProteinGap(null, 100, 3)).toBeNull()
    expect(detectRestDayTraining([])).toBeNull()
  })

  it('2/13. omisión repetida pide motivo', () => {
    const r = detectSkipPatterns([
      { date: '2026-09-01', exerciseId: 'sq', exerciseName: 'Sentadilla', muscle: 'piernas', reason: 'Cansancio' },
      { date: '2026-09-08', exerciseId: 'sq', exerciseName: 'Sentadilla', muscle: 'piernas', reason: 'Cansancio' },
    ])! // única omisión no alcanza
    expect(r.id).toBe('missed:sq')
    expect(r.question?.key).toBe('missed:sq')
    expect(
      detectSkipPatterns([
        { date: '2026-09-01', exerciseId: 'a', exerciseName: 'A', muscle: '', reason: 'x' },
        { date: '2026-09-08', exerciseId: 'b', exerciseName: 'B', muscle: '', reason: 'x' },
      ]),
    ).toBeNull()
  })

  it('6/14. dolor recurrente con zona, sin diagnosticar', () => {
    const r = detectPainZones([
      { date: '2026-09-01', zone: 'Hombro', detail: '', pain: 5 },
      { date: '2026-09-08', zone: 'hombro ', detail: 'al press', pain: 6 },
    ])! // normaliza mayúsculas/espacios
    expect(r.id).toBe('pain:hombro')
    expect(r.detail).toContain('No diagnostico')
    expect(r.question?.key).toBe('pain:hombro')
    expect(painMatchesMuscle('hombro derecho', 'hombros')).toBe(true)
    expect(painMatchesMuscle('', 'hombros')).toBe(false)
  })

  it('11/10. brecha y undertraining con evidencia', () => {
    const g = detectGap(
      [{ date: '2026-09-01', status: 'COMPLETED', plannedDay: 1, actualDay: 1, volume: 1000 }],
      '2026-09-10',
    )!
    expect(g.title).toContain('9 días')
    const u = detectUnderTraining(1, 3, 3)!
    expect(u.level).toBe('warn')
    expect(detectUnderTraining(3, 3, 3)).toBeNull()
  })

  it('4/5. cambio de día y descanso entrenado se registran', () => {
    const r = detectRestDayTraining([
      { date: '2026-09-07', status: 'COMPLETED', plannedDay: null, actualDay: 2, volume: 500 },
    ])! // plannedDay null + actualDay = descanso entrenado
    expect(r.kind).toBe('restday')
    expect(r.level).toBe('info')
  })

  it('overtraining exige volumen Y recovery (no solo uno)', () => {
    expect(detectOvertraining([1000, 1100, 1500], [80, 75, 70])).toBeNull()
    expect(detectOvertraining([1000, 1100, 1100], [50, 55, 80])).toBeNull()
    const r = detectOvertraining([1000, 1100, 1500], [50, 55, 80])!
    expect(r.level).toBe('warn')
    expect(r.detail).toContain('No modifico tu rutina')
  })

  it('12/16. rutina vieja estancada vs nueva sin datos', () => {
    expect(
      detectRoutineStale(50, false, 20)?.id,
    ).toBe('routine-stale')
    expect(detectRoutineStale(50, true, 20)).toBeNull()
    expect(detectRoutineStale(10, false, 20)).toBeNull()
  })

  it('15. proteína baja solo con objetivo y registros', () => {
    expect(detectProteinGap(40, 140, 3)?.level).toBe('warn')
    expect(detectProteinGap(130, 140, 3)).toBeNull()
    expect(detectProteinGap(10, null, 3)).toBeNull()
  })

  it('ET18. objetivo semanal y mensual 4 semanas', () => {
    const mk = (date: string) => ({ date, status: 'COMPLETED', plannedDay: 1, actualDay: 1, volume: 1000 })
    // Semana del lunes 2026-09-14 con 3/3 → cumplido
    const week = [mk('2026-09-14'), mk('2026-09-16'), mk('2026-09-18')]
    const goal = detectWeeklyGoal(week, 3, '2026-09-20')!
    expect(goal.id).toBe('goal-week')
    expect(goal.level).toBe('info')
    // 2/3 → sin insight (no se inventa cumplimiento ni falta)
    expect(detectWeeklyGoal(week.slice(0, 2), 3, '2026-09-20')).toBeNull()
    expect(detectWeeklyGoal(week, 0, '2026-09-20')).toBeNull()
    // Mes: 12/12 → info; 6/12 → warn; vacío → null
    const month = Array.from({ length: 12 }, (_, i) =>
      mk(`2026-09-${String(i + 1).padStart(2, '0')}`))
    const m4 = detectFourWeekGoal(month, 3, '2026-09-30')!
    expect(m4.id).toBe('goal-4w')
    expect(m4.level).toBe('info')
    const low = detectFourWeekGoal(month.slice(0, 6), 3, '2026-09-30')!
    expect(low.level).toBe('warn')
    expect(detectFourWeekGoal([], 3, '2026-09-30')).toBeNull()
  })

  it('ET18. cambios de día recurrentes con motivos', () => {
    expect(detectDayChangePattern([
      { date: '2026-09-01', from: 'día 1', to: 'día 2', reason: 'dolor' },
    ])).toBeNull()
    const rep = detectDayChangePattern([
      { date: '2026-09-01', from: 'día 1', to: 'día 2', reason: 'dolor' },
      { date: '2026-09-08', from: 'día 1', to: 'día 3', reason: 'viaje' },
    ])!
    expect(rep.id).toBe('daychange-pattern')
    expect(rep.detail).toContain('dolor')
    expect(rep.detail).toContain('viaje')
    expect(rep.evidence).toContain('2026-09-01')
    expect(rep.question?.key).toBe('daychange:why')
  })

  it('adherencia: umbral 70% con plan medible', () => {
    const low = detectAdherence(
      [{ date: 'd1', status: 'COMPLETED', plannedDay: 1, actualDay: 1, volume: 1 }],
      ['d1', 'd2', 'd3', 'd4'],
    )!
    expect(low.level).toBe('warn')
    expect(low.question?.key).toBe('adherence:low')
    const ok = detectAdherence(
      [
        { date: 'd1', status: 'COMPLETED', plannedDay: 1, actualDay: 1, volume: 1 },
        { date: 'd2', status: 'COMPLETED', plannedDay: 1, actualDay: 1, volume: 1 },
        { date: 'd3', status: 'PARTIAL', plannedDay: 1, actualDay: 1, volume: 1 },
      ],
      ['d1', 'd2', 'd3'],
    )
    expect(ok).toBeNull()
  })
})
