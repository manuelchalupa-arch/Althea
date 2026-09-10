import { describe, it, expect } from 'vitest'
import {
  SESSION_TRANSITIONS, canTransitionSession, assertTransitionSession,
  setRecordIdFor, validateSurvey, validateBeforeFinish,
  type SessionStatus, type TrainingSession, type SessionExercise,
} from './domain'

const ALL: SessionStatus[] = ['PLANNED','READY','IN_PROGRESS','PAUSED','COMPLETING','COMPLETED','PARTIAL','CANCELLED','ABANDONED']

describe('matriz única de transiciones (§4)', () => {
  it('acepta exactamente las transiciones válidas', () => {
    const valid: Array<[SessionStatus, SessionStatus]> = [
      ['PLANNED','READY'],
      ['READY','IN_PROGRESS'], ['READY','CANCELLED'],
      ['IN_PROGRESS','PAUSED'], ['PAUSED','IN_PROGRESS'],
      ['IN_PROGRESS','COMPLETING'], ['PAUSED','COMPLETING'],
      ['COMPLETING','COMPLETED'], ['COMPLETING','PARTIAL'],
      ['IN_PROGRESS','CANCELLED'], ['PAUSED','CANCELLED'],
      ['IN_PROGRESS','ABANDONED'], ['PAUSED','ABANDONED'],
    ]
    for (const [f, t] of valid) expect(canTransitionSession(f, t)).toBe(true)
    // la matriz no contiene nada más
    let count = 0
    for (const f of ALL) count += SESSION_TRANSITIONS[f].length
    expect(count).toBe(valid.length)
  })

  it('rechaza las transiciones prohibidas', () => {
    const invalid: Array<[SessionStatus, SessionStatus]> = [
      ['PLANNED','IN_PROGRESS'], ['READY','COMPLETED'],
      ['IN_PROGRESS','COMPLETED'], ['PAUSED','COMPLETED'],
      ['COMPLETED','IN_PROGRESS'], ['PARTIAL','IN_PROGRESS'],
      ['CANCELLED','IN_PROGRESS'], ['ABANDONED','IN_PROGRESS'],
      ['COMPLETED','COMPLETING'], ['READY','PARTIAL'],
    ]
    for (const [f, t] of invalid) {
      expect(canTransitionSession(f, t)).toBe(false)
      expect(() => assertTransitionSession(f, t)).toThrow()
    }
  })

  it('COMPLETING es transitorio: sin salidas salvo COMPLETED/PARTIAL', () => {
    expect(SESSION_TRANSITIONS.COMPLETING).toEqual(['COMPLETED', 'PARTIAL'])
    expect(SESSION_TRANSITIONS.COMPLETED).toEqual([])
    expect(SESSION_TRANSITIONS.PARTIAL).toEqual([])
  })
})

describe('identidad estable de serie (§18, §38)', () => {
  it('mismo sessionExercise + orden => mismo setRecordId', () => {
    expect(setRecordIdFor('se-1', 1)).toBe(setRecordIdFor('se-1', 1))
    expect(setRecordIdFor('se-1', 1)).not.toBe(setRecordIdFor('se-1', 2))
    expect(setRecordIdFor('se-1', 1)).not.toBe(setRecordIdFor('se-2', 1))
  })
})

describe('encuesta post-entrenamiento (§15)', () => {
  const ok = { energy: 5, fatigue: 5, pain: 0, mood: 5, motivation: 5, perceivedExertion: 5, stress: 5 }
  it('acepta encuesta válida', () => { expect(validateSurvey(ok)).toEqual([]) })
  it('rechaza rangos fuera de límite', () => {
    expect(validateSurvey({ ...ok, energy: 11 })).toContain('energy 1–10')
    expect(validateSurvey({ ...ok, pain: -1 })).toContain('pain 0–10')
  })
  it('exige zona si pain>3', () => {
    expect(validateSurvey({ ...ok, pain: 7 })).toContain('painArea u observación requerida si pain>3')
    expect(validateSurvey({ ...ok, pain: 7, painArea: 'hombro' })).toEqual([])
  })
})

describe('regla contra inconsistencias (§12)', () => {
  const base = { sessionId: 's1', routineId: 'r1', sessionStatus: 'COMPLETED' } as TrainingSession
  it('COMPLETED sin startedAt es inválido', () => {
    expect(validateBeforeFinish(base, [])).toContain('COMPLETED sin startedAt')
  })
  it('PARTIAL sin pendientes identificados es inválido', () => {
    const s = { ...base, startedAt: 'x', sessionStatus: 'PARTIAL' } as TrainingSession
    const done = [{ status: 'COMPLETED' }] as SessionExercise[]
    expect(validateBeforeFinish(s, done)).toContain('PARTIAL sin pendientes identificados')
  })
  it('COMPLETED válido no reporta errores', () => {
    const s = { ...base, startedAt: 'x', routineId: 'r1' } as TrainingSession
    expect(validateBeforeFinish(s, [{ status: 'COMPLETED' }] as SessionExercise[])).toEqual([])
  })
  it('PARTIAL con SKIPPED identificado es válido', () => {
    const s = { ...base, startedAt: 'x', sessionStatus: 'PARTIAL' } as TrainingSession
    const items = [{ status: 'COMPLETED' }, { status: 'SKIPPED' }] as SessionExercise[]
    expect(validateBeforeFinish(s, items)).toEqual([])
  })
})
