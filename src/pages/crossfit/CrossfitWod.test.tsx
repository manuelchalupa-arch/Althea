import { describe, it, expect } from 'vitest'
import { parseTimeInput, wodToTimerConfig } from './CrossfitWod'
import type { CfWod } from '@/services/crossfit/types'

const baseWod = {
  id: 'w1',
  name: 'Test',
  format: 'FOR_TIME',
  objective: '',
  modalities: [],
  movements: [],
  equipment: [],
  instructions: [],
  level: 'intermedio',
  isTemplate: false,
  source: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as CfWod

describe('parseTimeInput', () => {
  it('parsea mm:ss y h:mm:ss', () => {
    expect(parseTimeInput('7:42')).toBe(462)
    expect(parseTimeInput('1:05:00')).toBe(3900)
    expect(parseTimeInput('0:45')).toBe(45)
  })

  it('acepta segundos planos', () => {
    expect(parseTimeInput('90')).toBe(90)
    expect(parseTimeInput('0')).toBe(0)
  })

  it('rechaza basura', () => {
    expect(parseTimeInput('')).toBeNull()
    expect(parseTimeInput('abc')).toBeNull()
    expect(parseTimeInput('7:xx')).toBeNull()
    expect(parseTimeInput('-5')).toBeNull()
    expect(parseTimeInput('99:99:99:99')).toBeNull()
  })
})

describe('wodToTimerConfig', () => {
  it('deriva el cap y rondas de un FOR_TIME', () => {
    const cfg = wodToTimerConfig({ ...baseWod, timeCapSec: 600, rounds: 5 })
    expect(cfg.format).toBe('FOR_TIME')
    expect(cfg.timeCapSec).toBe(600)
    expect(cfg.rounds).toBe(5)
  })

  it('aplica el default de duración para AMRAP y Tabata', () => {
    expect(wodToTimerConfig({ ...baseWod, format: 'AMRAP' }).durationSec).toBe(600)
    expect(wodToTimerConfig({ ...baseWod, format: 'TABATA' }).durationSec).toBe(240)
  })

  it('respeta la duración propia del WOD sobre el default', () => {
    expect(wodToTimerConfig({ ...baseWod, format: 'AMRAP', durationSec: 480 }).durationSec).toBe(480)
  })

  it('pasa los intervalos de un INTERVAL', () => {
    const cfg = wodToTimerConfig({ ...baseWod, format: 'INTERVAL', rounds: 10, intervalWorkSec: 40, intervalRestSec: 20 })
    expect(cfg.intervalWorkSec).toBe(40)
    expect(cfg.intervalRestSec).toBe(20)
    expect(cfg.rounds).toBe(10)
  })
})