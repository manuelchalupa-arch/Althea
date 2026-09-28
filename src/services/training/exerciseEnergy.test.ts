import { describe, it, expect } from 'vitest'
import {
  EXERCISE_MET, EXERCISE_ACTIVITY,
  sessionDurationMinutes, sessionEnergy, energyInsufficientReason,
  estimateStrengthSession, weightForDate, computeExpenditure,
  type EnergySession, type WeightRow,
} from './exerciseEnergy'
import { calculateCalorieExpenditure } from '@/services/ai/metExpenditure'

const base: EnergySession = {
  sessionId: 's1',
  calendarDate: '2026-09-28',
  sessionStatus: 'COMPLETED',
  startedAt: '2026-09-28T10:00:00.000Z',
  completedAt: '2026-09-28T10:45:00.000Z',
}
const weights: WeightRow[] = [{ localDate: '2026-01-01', weightKg: 75 }]

describe('exerciseEnergy — duración real de la sesión', () => {
  it('usa el reloj de inicio a fin y descuenta pausas registradas', () => {
    expect(sessionDurationMinutes(base)).toBe(45)
    expect(sessionDurationMinutes({ ...base, totalPausedDurationSec: 300 })).toBe(40)
  })

  it('descuenta la pausa abierta (en curso) hasta `nowMs`', () => {
    const s: EnergySession = {
      ...base,
      sessionStatus: 'PAUSED',
      completedAt: null,
      endedAt: null,
      pausedAt: '2026-09-28T10:30:00.000Z',
    }
    const now = Date.parse('2026-09-28T10:50:00.000Z')
    // 50 min de reloj − 20 min de pausa abierta
    expect(sessionDurationMinutes(s, now)).toBe(30)
  })

  it('para sesión en curso usa ahora como fin; si nunca empezó, null', () => {
    const now = Date.parse('2026-09-28T11:00:00.000Z')
    const ongoing: EnergySession = { ...base, sessionStatus: 'IN_PROGRESS', completedAt: null, endedAt: null }
    expect(sessionDurationMinutes(ongoing, now)).toBe(60)
    expect(sessionDurationMinutes({ ...base, startedAt: undefined, completedAt: undefined }, now)).toBeNull()
    // estado sin actividad (planificada/cancelada): nunca hay gasto
    expect(sessionDurationMinutes({ ...base, sessionStatus: 'CANCELLED', completedAt: null }, now)).toBeNull()
  })

  it('sesión que termina antes o exactamente cuando empezó no aporta datos', () => {
    expect(sessionDurationMinutes({ ...base, completedAt: base.startedAt })).toBeNull()
    expect(sessionDurationMinutes({ ...base, completedAt: '2026-09-28T09:30:00.000Z' })).toBeNull()
  })
})

describe('exerciseEnergy — cálculo energético sin valores inventados', () => {
  it('es la misma fórmula MET del Compendium que ya usa el Coach', () => {
    const got = sessionEnergy(base, 75)
    const expected = calculateCalorieExpenditure({ activity: EXERCISE_ACTIVITY, met: EXERCISE_MET, weightKg: 75, durationMinutes: 45 })
    expect(got).not.toBeNull()
    expect(got!.kcal).toBe(expected.grossKcal)
    expect(EXERCISE_MET).toBe(6.0)
    expect(got!.formula).toContain('45 min')
  })

  it('crece con la duración y con el peso (no es una constante hardcodeada)', () => {
    const doble = sessionEnergy({ ...base, completedAt: '2026-09-28T11:30:00.000Z' }, 75)!
    const una = sessionEnergy(base, 75)!
    expect(doble.kcal).toBeCloseTo(una.kcal * 2, 0)
    const pesado = sessionEnergy(base, 90)!
    expect(pesado.kcal / una.kcal).toBeCloseTo(90 / 75, 1)
  })

  it('sin peso registrado no estima (motivo explícito)', () => {
    expect(energyInsufficientReason(base, null)).toBe('SIN_PESO')
    expect(sessionEnergy(base, null)).toBeNull()
    expect(sessionEnergy(base, 0)).toBeNull()
  })

  it('demo y sesiones no reales nunca aportan gasto', () => {
    expect(energyInsufficientReason({ ...base, isDemo: true }, 75)).toBe('SESION_NO_REAL')
    expect(energyInsufficientReason({ ...base, sessionStatus: 'PLANNED' }, 75)).toBe('SESION_NO_REAL')
    expect(sessionEnergy({ ...base, isDemo: true }, 75)).toBeNull()
  })

  it('estimación inline del Coach reutiliza el mismo motor', () => {
    const coach = estimateStrengthSession({ weightKg: 75, durationMinutes: 45 })
    expect(coach.grossKcal).toBe(sessionEnergy(base, 75)!.kcal)
    expect(coach.met).toBe(EXERCISE_MET)
  })
})

describe('exerciseEnergy — peso corporal', () => {
  const rows: WeightRow[] = [
    { localDate: '2026-01-01', weightKg: 80 },
    { localDate: '2026-03-01', isDemo: true, weightKg: 999 },
    { localDate: '2026-05-01', weightKg: 74 },
    { localDate: '2026-09-20', weightKg: 76 },
    { localDate: '2026-10-10', weightKg: 70 },
  ]
  it('toma la última medición no demo vigente a la fecha de la sesión', () => {
    expect(weightForDate(rows, '2026-09-28')).toBe(76)
    expect(weightForDate(rows, '2026-04-15')).toBe(80)
    expect(weightForDate(rows, '2025-12-31')).toBeNull()
    expect(weightForDate([], '2026-09-28')).toBeNull()
    expect(weightForDate([{ localDate: '2026-09-28', isDemo: true, weightKg: 70 }], '2026-09-28')).toBeNull()
  })
})

describe('exerciseEnergy — rango (día, semana, período)', () => {
  const sessions: EnergySession[] = [
    base, // 45 min · 2026-09-28
    { ...base, sessionId: 's2', calendarDate: '2026-09-26', startedAt: '2026-09-26T09:00:00.000Z', completedAt: '2026-09-26T10:00:00.000Z' }, // 60 min
    { ...base, sessionId: 's3', calendarDate: '2026-09-10', startedAt: '2026-09-10T09:00:00.000Z', completedAt: '2026-09-10T09:30:00.000Z' }, // fuera de rango
    { ...base, sessionId: 's4', calendarDate: '2026-09-27', sessionStatus: 'CANCELLED', completedAt: null }, // sin actividad
  ]

  it('el día suma solo sus sesiones y la semana acumula los días reales', () => {
    const dia = computeExpenditure({ from: '2026-09-28', to: '2026-09-28', sessions, weightRows: weights })
    const semana = computeExpenditure({ from: '2026-09-26', to: '2026-09-28', sessions, weightRows: weights })

    expect(dia.totalKcal).not.toBeNull()
    expect(dia.totalKcal).toBe(sessionEnergy(base, 75)!.kcal)
    expect(dia.totalMinutes).toBe(45)
    expect(semana.totalMinutes).toBe(105)
    expect(semana.totalKcal).toBe(dia.totalKcal! + sessionEnergy(sessions[1], 75)!.kcal)
    expect(semana.porFecha.map(p => p.fecha)).toEqual(['2026-09-26', '2026-09-28'])
    // consistencia: la sesión de hoy vale lo mismo sola que dentro de la semana
    expect(semana.porFecha.find(p => p.fecha === '2026-09-28')!.kcal).toBe(dia.totalKcal)
  })

  it('rango sin sesiones vs sesiones sin datos: motivos distintos y honestos', () => {
    const vacio = computeExpenditure({ from: '2026-09-01', to: '2026-09-05', sessions, weightRows: weights })
    expect(vacio.totalKcal).toBeNull()
    expect(vacio.motivo).toBe('SIN_SESIONES')

    // Solo sesiones demo/canceladas en el rango = no hay sesiones reales
    const soloNoReales = computeExpenditure({
      from: '2026-09-27', to: '2026-09-27',
      sessions: [{ ...base, sessionId: 's6', calendarDate: '2026-09-27', isDemo: true }],
      weightRows: weights,
    })
    expect(soloNoReales.totalKcal).toBeNull()
    expect(soloNoReales.motivo).toBe('SIN_SESIONES')

    const sinPeso = computeExpenditure({ from: '2026-09-28', to: '2026-09-28', sessions, weightRows: [] })
    expect(sinPeso.totalKcal).toBeNull()
    expect(sinPeso.motivo).toBe('SIN_PESO')

    const sinDuracion = computeExpenditure({
      from: '2026-09-27', to: '2026-09-27',
      sessions: [{ ...base, sessionId: 's5', calendarDate: '2026-09-27', sessionStatus: 'IN_PROGRESS', startedAt: undefined }],
      weightRows: weights,
    })
    expect(sinDuracion.totalKcal).toBeNull()
    expect(sinDuracion.motivo).toBe('SIN_DURACION')
  })

  it('ignora sesiones fuera del rango y demo dentro de él', () => {
    const r = computeExpenditure({
      from: '2026-09-28', to: '2026-09-28',
      sessions: [base, { ...base, sessionId: 'demo', isDemo: true, completedAt: '2026-09-28T12:00:00.000Z' }],
      weightRows: weights,
    })
    expect(r.sesiones).toHaveLength(1)
    expect(r.sesiones[0].sessionId).toBe('s1')
  })
})
