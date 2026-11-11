import { describe, it, expect } from 'vitest'
import type { CfScheduleEntry, CfSessionKind } from '@/services/crossfit/types'
import { countTrainingDays, longestTrainingStreak, overloadWarnings, planPattern } from './CrossfitProgramacion'

/**
 * Tests de las funciones puras exportadas por CrossfitProgramacion:
 * detección de racha, conteo semanal, generación de modelos 3:1 / 5:2 sin
 * pisar días existentes y avisos de sobrecarga. Sin render: la lógica vive
 * en funciones testables y la vista es un orquestador.
 */

// 2026-03-09 es lunes (lunes de la semana del 9 al 15 de marzo).
const LUN = '2026-03-09'
const MAR = '2026-03-10'
const MIE = '2026-03-11'
const JUE = '2026-03-12'
const VIE = '2026-03-13'
const SAB = '2026-03-14'
const DOM = '2026-03-15'

const mk = (date: string, kind: CfSessionKind): CfScheduleEntry => ({
  id: `${date}-${kind}`,
  date,
  kind,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
})

describe('longestTrainingStreak', () => {
  it('mide la racha de días calendario consecutivos y corta con días libres o de descanso', () => {
    const week = [mk(LUN, 'M'), mk(MAR, 'G'), mk(MIE, 'G+M'), mk(JUE, 'rest'), mk(VIE, 'M')]
    expect(longestTrainingStreak(week)).toBe(3)

    // Un día sin entrada en el medio corta la racha.
    expect(longestTrainingStreak([mk(LUN, 'M'), mk(MIE, 'M')])).toBe(1)

    // Sin entrenamientos no hay racha.
    expect(longestTrainingStreak([mk(LUN, 'recovery'), mk(MAR, 'rest')])).toBe(0)
    expect(longestTrainingStreak([])).toBe(0)
  })
})

describe('countTrainingDays', () => {
  it('cuenta solo días de entrenamiento, excluyendo rest y recovery', () => {
    const week = [mk(LUN, 'M'), mk(MAR, 'W'), mk(MIE, 'recovery'), mk(JUE, 'rest'), mk(VIE, 'G+M+W'), mk(SAB, 'G'), mk(DOM, 'rest')]
    expect(countTrainingDays(week)).toBe(4)
    expect(countTrainingDays([])).toBe(0)
  })
})

describe('planPattern', () => {
  it('genera 3:1 (entrenamiento lun-mié, descanso jue, entreno vie-sáb, descanso dom) sin pisar días existentes', () => {
    const plan = planPattern(LUN, '3:1', [mk(MAR, 'G')])

    expect(plan).toHaveLength(6)
    expect(plan.some((d) => d.date === MAR)).toBe(false)

    const byDate = new Map(plan.map((d) => [d.date, d]))
    expect(byDate.get(LUN)?.kind).toBe('M')
    expect(byDate.get(LUN)?.title).toBe('Entrenamiento')
    expect(byDate.get(MIE)?.kind).toBe('M')
    expect(byDate.get(JUE)?.kind).toBe('rest')
    expect(byDate.get(VIE)?.kind).toBe('M')
    expect(byDate.get(DOM)?.kind).toBe('rest')
  })

  it('genera 5:2 (lun-vie entreno, sáb-dom descanso) solo en días libres', () => {
    const plan = planPattern(LUN, '5:2', [mk(LUN, 'M'), mk(MIE, 'W')])

    expect(plan).toHaveLength(5)
    expect(plan.some((d) => d.date === LUN || d.date === MIE)).toBe(false)

    const byDate = new Map(plan.map((d) => [d.date, d.kind]))
    expect(byDate.get(MAR)).toBe('M')
    expect(byDate.get(JUE)).toBe('M')
    expect(byDate.get(VIE)).toBe('M')
    expect(byDate.get(SAB)).toBe('rest')
    expect(byDate.get(DOM)).toBe('rest')
  })
})

describe('overloadWarnings', () => {
  it('avisa racha de 4+, 6+ días de entreno y acumulado con la semana anterior', () => {
    // (a) 4 días seguidos de entreno.
    const racha = [LUN, MAR, MIE, JUE].map((d) => mk(d, 'M'))
    const w1 = overloadWarnings([], racha)
    expect(w1).toHaveLength(1)
    expect(w1[0]).toContain('4 días seguidos')

    // (b) 6 días de entreno en la semana (la racha también dispara (a)).
    const volumen = [LUN, MAR, MIE, JUE, VIE, SAB].map((d) => mk(d, 'M'))
    const w2 = overloadWarnings([], volumen)
    expect(w2).toHaveLength(2)
    expect(w2.some((w) => w.includes('6 días de entrenamiento'))).toBe(true)

    // (c) semana anterior con 5 entrenos y la actual con 3 hasta el jueves.
    const previa = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'].map((d) => mk(d, 'M'))
    const actual = [mk(LUN, 'M'), mk(MAR, 'M'), mk(MIE, 'M'), mk(JUE, 'rest')]
    const w3 = overloadWarnings(previa, actual)
    expect(w3).toHaveLength(1)
    expect(w3[0]).toContain('jueves')

    // Semana tranquila: sin avisos.
    expect(overloadWarnings([], [mk(LUN, 'M'), mk(JUE, 'recovery')])).toHaveLength(0)
  })
})
