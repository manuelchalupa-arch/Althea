import type { CfFormat } from './types'

/**
 * Motor de cronómetros WOD: lógica pura, sin UI ni persistencia.
 * Recibe la configuración del formato y el tiempo transcurrido (ms desde el
 * arranque, basado en reloj de pared en el hook) y devuelve el estado a
 * mostrar. Todo es determinístico: se puede testear sin timers reales.
 */

export interface WodFormatConfig {
  format: CfFormat
  /** Duración total en segundos (AMRAP, TABATA). */
  durationSec?: number
  /** Time cap en segundos (FOR_TIME, CHIPPER). */
  timeCapSec?: number
  /** Rondas totales (INTERVAL; FOR_TIME/CHIPPER informativo). */
  rounds?: number
  /** Duración del trabajo en segundos (INTERVAL). */
  intervalWorkSec?: number
  /** Duración del descanso en segundos (INTERVAL). */
  intervalRestSec?: number
}

export interface TimerDisplay {
  /** true cuando el formato define un regresivo (AMRAP, TABATA, cap, intervalos). */
  countdown: boolean
  /** Milisegundos del tramo actual: restantes si countdown, transcurridos si no. */
  phaseMs: number
  phase: 'work' | 'rest' | 'done'
  /** Ronda o minuto actual (1-based). */
  round: number
  totalRounds?: number
  /** Segundos restantes del tramo actual (redondeo para mostrar). */
  phaseSec: number
  /** Segundos restantes del formato completo; null si es ascendente abierto. */
  totalRemainingSec: number | null
  done: boolean
}

const TABATA_WORK_SEC = 20
const TABATA_REST_SEC = 10
const TABATA_ROUNDS = 8

function clamp0(n: number): number { return n < 0 ? 0 : n }

function sec(ms: number): number { return Math.ceil(ms / 1000) }

export function defaultDurationSec(format: CfFormat): number | undefined {
  switch (format) {
    case 'AMRAP': return 600
    case 'TABATA': return (TABATA_WORK_SEC + TABATA_REST_SEC) * TABATA_ROUNDS
    case 'EMOM': return 600
    default: return undefined
  }
}

/**
 * Estado del cronómetro para un formato dado `elapsedMs` desde el arranque.
 * - AMRAP: regresivo de durationSec.
 * - TABATA: 8 × (20 s trabajo + 10 s descanso) = 4:00.
 * - EMOM: minuto actual con cuenta regresiva del minuto (60 s).
 * - FOR_TIME / CHIPPER: ascendente; se detiene solo si hay timeCap.
 * - INTERVAL: rondas de trabajo+descanso; el último round no tiene descanso.
 */
export function timerDisplay(cfg: WodFormatConfig, elapsedMs: number): TimerDisplay {
  const elapsed = Math.max(0, elapsedMs)

  switch (cfg.format) {
    case 'AMRAP': {
      const total = Math.max(1, (cfg.durationSec ?? 600)) * 1000
      const left = total - elapsed
      if (left <= 0) {
        return { countdown: true, phaseMs: 0, phase: 'done', round: 1, phaseSec: 0, totalRemainingSec: 0, done: true }
      }
      return { countdown: true, phaseMs: left, phase: 'work', round: 1, phaseSec: sec(left), totalRemainingSec: sec(left), done: false }
    }

    case 'TABATA': {
      const cycle = (TABATA_WORK_SEC + TABATA_REST_SEC) * 1000
      const total = cycle * TABATA_ROUNDS
      if (elapsed >= total) {
        return { countdown: true, phaseMs: 0, phase: 'done', round: TABATA_ROUNDS, totalRounds: TABATA_ROUNDS, phaseSec: 0, totalRemainingSec: 0, done: true }
      }
      const round = Math.floor(elapsed / cycle) + 1
      const inCycle = elapsed % cycle
      const isWork = inCycle < TABATA_WORK_SEC * 1000
      const phaseMs = isWork ? TABATA_WORK_SEC * 1000 - inCycle : cycle - inCycle
      return {
        countdown: true,
        phaseMs,
        phase: isWork ? 'work' : 'rest',
        round,
        totalRounds: TABATA_ROUNDS,
        phaseSec: sec(phaseMs),
        totalRemainingSec: sec(total - elapsed),
        done: false,
      }
    }

    case 'EMOM': {
      const minuteMs = 60_000
      const total = Math.max(1, cfg.durationSec ?? 600) * 1000
      if (elapsed >= total) {
        return { countdown: true, phaseMs: 0, phase: 'done', round: Math.floor(total / minuteMs), phaseSec: 0, totalRemainingSec: 0, done: true }
      }
      const round = Math.floor(elapsed / minuteMs) + 1
      const inMinute = elapsed % minuteMs
      const left = minuteMs - inMinute
      return {
        countdown: true,
        phaseMs: left,
        phase: 'work',
        round,
        phaseSec: sec(left),
        totalRemainingSec: sec(total - elapsed),
        done: false,
      }
    }

    case 'INTERVAL': {
      const work = Math.max(1, cfg.intervalWorkSec ?? 30) * 1000
      const rest = Math.max(0, cfg.intervalRestSec ?? 15) * 1000
      const rounds = Math.max(1, cfg.rounds ?? 8)
      const cycle = work + rest
      const lastWorkEnd = (rounds - 1) * cycle + work
      if (elapsed >= lastWorkEnd) {
        return { countdown: false, phaseMs: 0, phase: 'done', round: rounds, totalRounds: rounds, phaseSec: 0, totalRemainingSec: 0, done: true }
      }
      const round = Math.floor(elapsed / cycle) + 1
      const inCycle = elapsed % cycle
      const isWork = inCycle < work
      if (isWork) {
        const left = work - inCycle
        return {
          countdown: true,
          phaseMs: left,
          phase: 'work',
          round,
          totalRounds: rounds,
          phaseSec: sec(left),
          totalRemainingSec: sec(lastWorkEnd - elapsed),
          done: false,
        }
      }
      const left = cycle - inCycle
      // El descanso del último round no existe: lastWorkEnd lo corta antes.
      const restLeft = round === rounds ? work : left
      return {
        countdown: true,
        phaseMs: restLeft,
        phase: 'rest',
        round,
        totalRounds: rounds,
        phaseSec: sec(restLeft),
        totalRemainingSec: sec(lastWorkEnd - elapsed),
        done: false,
      }
    }

    case 'FOR_TIME':
    case 'CHIPPER':
    default: {
      const capMs = (cfg.timeCapSec ?? 0) * 1000
      if (capMs > 0 && elapsed >= capMs) {
        return { countdown: true, phaseMs: 0, phase: 'done', round: cfg.rounds ?? 1, totalRounds: cfg.rounds, phaseSec: 0, totalRemainingSec: 0, done: true }
      }
      return {
        countdown: capMs > 0,
        phaseMs: elapsed,
        phase: 'work',
        round: cfg.rounds ?? 1,
        totalRounds: cfg.rounds,
        phaseSec: Math.floor(elapsed / 1000),
        totalRemainingSec: capMs > 0 ? sec(capMs - elapsed) : null,
        done: false,
      }
    }
  }
}

/** Tiempo en mm:ss (o h:mm:ss si supera la hora). */
export function formatClock(ms: number): string {
  const total = clamp0(Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
