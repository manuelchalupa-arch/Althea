import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearTimerState,
  getTimerState,
  saveTimerState,
} from '@/services/crossfit/cfStore'
import { timerDisplay, type TimerDisplay, type WodFormatConfig } from '@/services/crossfit/wodTimer'

export type WodTimerPhase = 'idle' | 'running' | 'paused' | 'finished'

export interface WodTimerState {
  phase: WodTimerPhase
  /** Tiempo transcurrido en ms, derivado de reloj de pared (sin drift). */
  elapsedMs: number
  display: TimerDisplay | null
  wodId?: string
  config: WodFormatConfig | null
}

export interface WodTimerApi extends WodTimerState {
  start: (config: WodFormatConfig, wodId?: string) => void
  pause: () => void
  resume: () => void
  /** Detiene y limpia el estado persistido (el resultado lo guarda la UI). */
  finish: () => void
  cancel: () => void
}

const TICK_MS = 250

function elapsedOf(s: { startedAtMs: number; accumulatedMs: number; running: boolean }, now: number): number {
  return s.accumulatedMs + (s.running ? Math.max(0, now - s.startedAtMs) : 0)
}

/**
 * Cronómetro WOD persistente. El estado vive en Dexie (cfTimerState,
 * local-only): sobrevive a recargas, cierre y segundo plano porque todo se
 * deriva de Date.now() contra startedAtMs/accumulatedMs (mismo patrón que
 * usePersistentRestTimer). En segundo plano el tick queda throttleado; al
 * volver a la app, visibilitychange fuerza un tick y el tiempo es correcto.
 */
export function useWodTimer(): WodTimerApi {
  const [state, setState] = useState<WodTimerState>({
    phase: 'idle',
    elapsedMs: 0,
    display: null,
    config: null,
  })
  const cfgRef = useRef<WodFormatConfig | null>(null)
  const phaseRef = useRef<WodTimerPhase>('idle')
  const wodIdRef = useRef<string | undefined>(undefined)
  const startedRef = useRef(0)
  const accumRef = useRef(0)

  const recompute = useCallback(() => {
    const phase = phaseRef.current
    const cfg = cfgRef.current
    if (phase === 'idle' || !cfg) {
      setState({ phase, elapsedMs: 0, display: null, config: cfg, wodId: wodIdRef.current })
      return
    }
    const raw = { startedAtMs: startedRef.current, accumulatedMs: accumRef.current, running: phase === 'running' }
    const elapsedMs = elapsedOf(raw, Date.now())
    setState({
      phase,
      elapsedMs,
      display: timerDisplay(cfg, elapsedMs),
      config: cfg,
      wodId: wodIdRef.current,
    })
  }, [])

  // Restaurar estado persistido al montar (recarga con cronómetro en curso).
  useEffect(() => {
    let alive = true
    getTimerState().then((row) => {
      if (!alive || !row) { return }
      const cfg: WodFormatConfig = { format: row.format, ...(row.config ?? {}) }
      cfgRef.current = cfg
      wodIdRef.current = row.wodId
      startedRef.current = row.startedAtMs
      accumRef.current = row.accumulatedMs
      phaseRef.current = row.running ? 'running' : 'paused'
      recompute()
    }).catch(() => { /* sin estado previo: idle */ })
    return () => { alive = false }
  }, [recompute])

  // Tick + resincronización al volver a la app.
  useEffect(() => {
    const id = setInterval(() => { if (phaseRef.current === 'running') { recompute() } }, TICK_MS)
    const onVis = () => { if (document.visibilityState === 'visible') { recompute() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [recompute])

  const persist = useCallback((running: boolean) => {
    const cfg = cfgRef.current
    if (!cfg) { return }
    saveTimerState({
      wodId: wodIdRef.current,
      format: cfg.format,
      config: { durationSec: cfg.durationSec, timeCapSec: cfg.timeCapSec, rounds: cfg.rounds, intervalWorkSec: cfg.intervalWorkSec, intervalRestSec: cfg.intervalRestSec },
      startedAtMs: startedRef.current,
      accumulatedMs: accumRef.current,
      running,
      round: 1,
      movementIdx: 0,
      intervalIdx: 0,
    }).catch(() => { /* el estado en vivo sigue en memoria */ })
  }, [])

  const start = useCallback((config: WodFormatConfig, wodId?: string) => {
    cfgRef.current = config
    wodIdRef.current = wodId
    startedRef.current = Date.now()
    accumRef.current = 0
    phaseRef.current = 'running'
    persist(true)
    recompute()
  }, [persist, recompute])

  const pause = useCallback(() => {
    if (phaseRef.current !== 'running') { return }
    accumRef.current = elapsedOf({ startedAtMs: startedRef.current, accumulatedMs: accumRef.current, running: true }, Date.now())
    phaseRef.current = 'paused'
    persist(false)
    recompute()
  }, [persist, recompute])

  const resume = useCallback(() => {
    if (phaseRef.current !== 'paused') { return }
    startedRef.current = Date.now()
    phaseRef.current = 'running'
    persist(true)
    recompute()
  }, [persist, recompute])

  const stopAndClear = useCallback(() => {
    phaseRef.current = 'idle'
    cfgRef.current = null
    wodIdRef.current = undefined
    startedRef.current = 0
    accumRef.current = 0
    clearTimerState().catch(() => { /* noop */ })
    recompute()
  }, [recompute])

  const finish = useCallback(() => {
    if (phaseRef.current === 'running') {
      accumRef.current = elapsedOf({ startedAtMs: startedRef.current, accumulatedMs: accumRef.current, running: true }, Date.now())
    }
    phaseRef.current = 'finished'
    clearTimerState().catch(() => { /* noop */ })
    recompute()
  }, [recompute])

  return { ...state, start, pause, resume, finish, cancel: stopAndClear }
}

export default useWodTimer
