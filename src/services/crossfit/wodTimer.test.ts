import { describe, it, expect } from 'vitest'
import { formatClock, timerDisplay, defaultDurationSec } from './wodTimer'

describe('wodTimer — formatos CrossFit', () => {
  it('AMRAP: regresivo de la duración y done al vencer', () => {
    const cfg = { format: 'AMRAP' as const, durationSec: 600 }
    expect(timerDisplay(cfg, 0)).toMatchObject({ countdown: true, phase: 'work', phaseSec: 600, done: false })
    expect(timerDisplay(cfg, 599_000)).toMatchObject({ phaseSec: 1, done: false })
    expect(timerDisplay(cfg, 600_000)).toMatchObject({ phase: 'done', done: true, phaseSec: 0 })
    // Pasado el fin no queda tiempo negativo.
    expect(timerDisplay(cfg, 700_000).phaseMs).toBe(0)
  })

  it('TABATA: 8 × (20 s trabajo + 10 s descanso)', () => {
    const cfg = { format: 'TABATA' as const }
    expect(defaultDurationSec('TABATA')).toBe(240)
    expect(timerDisplay(cfg, 0)).toMatchObject({ phase: 'work', phaseSec: 20, round: 1, totalRounds: 8 })
    expect(timerDisplay(cfg, 20_000)).toMatchObject({ phase: 'rest', phaseSec: 10, round: 1 })
    expect(timerDisplay(cfg, 30_000)).toMatchObject({ phase: 'work', phaseSec: 20, round: 2 })
    expect(timerDisplay(cfg, 239_000)).toMatchObject({ phase: 'rest', round: 8, done: false })
    expect(timerDisplay(cfg, 240_000)).toMatchObject({ phase: 'done', done: true })
  })

  it('EMOM: minuto actual con cuenta regresiva del minuto', () => {
    const cfg = { format: 'EMOM' as const, durationSec: 600 }
    expect(timerDisplay(cfg, 0)).toMatchObject({ round: 1, phaseSec: 60, countdown: true })
    expect(timerDisplay(cfg, 90_000)).toMatchObject({ round: 2, phaseSec: 30 })
    expect(timerDisplay(cfg, 599_000)).toMatchObject({ round: 10, phaseSec: 1 })
    expect(timerDisplay(cfg, 600_000)).toMatchObject({ done: true })
  })

  it('FOR_TIME: ascendente sin cap; se detiene con timeCap', () => {
    const open = { format: 'FOR_TIME' as const }
    expect(timerDisplay(open, 0)).toMatchObject({ countdown: false, phaseSec: 0, done: false, totalRemainingSec: null })
    expect(timerDisplay(open, 134_000)).toMatchObject({ phaseSec: 134, done: false })

    const capped = { format: 'FOR_TIME' as const, timeCapSec: 300 }
    expect(timerDisplay(capped, 299_000)).toMatchObject({ done: false, totalRemainingSec: 1 })
    expect(timerDisplay(capped, 300_000)).toMatchObject({ done: true, phase: 'done' })
  })

  it('CHIPPER: ascendente con cap opcional (mismo motor que FOR_TIME)', () => {
    const cfg = { format: 'CHIPPER' as const, timeCapSec: 600, rounds: 1 }
    expect(timerDisplay(cfg, 45_000)).toMatchObject({ countdown: true, phaseSec: 45, done: false })
    expect(timerDisplay(cfg, 600_000)).toMatchObject({ done: true })
  })

  it('INTERVAL: rondas de trabajo y descanso; el último round no descansa', () => {
    const cfg = { format: 'INTERVAL' as const, intervalWorkSec: 30, intervalRestSec: 15, rounds: 4 }
    expect(timerDisplay(cfg, 0)).toMatchObject({ phase: 'work', round: 1, phaseSec: 30, totalRounds: 4 })
    expect(timerDisplay(cfg, 25_000)).toMatchObject({ phase: 'work', phaseSec: 5 })
    expect(timerDisplay(cfg, 30_000)).toMatchObject({ phase: 'rest', phaseSec: 15, round: 1 })
    expect(timerDisplay(cfg, 45_000)).toMatchObject({ phase: 'work', round: 2 })
    // lastWorkEnd = 3×45 s + 30 s = 165 s
    expect(timerDisplay(cfg, 150_000)).toMatchObject({ phase: 'work', round: 4, phaseSec: 15 })
    expect(timerDisplay(cfg, 165_000)).toMatchObject({ done: true, phase: 'done' })
  })

  it('formatClock: mm:ss y h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(134_000)).toBe('02:14')
    expect(formatClock(3_725_000)).toBe('1:02:05')
    expect(formatClock(-500)).toBe('00:00')
  })
})
