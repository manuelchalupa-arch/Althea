import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '@/services/storage/db'

type TimerRow = {
  id: string
  endsAt: number | null
  pausedRemainingSec: number | null
  flash: boolean
  updatedAt: string
}

function idle(id: string, flash = false): TimerRow {
  return {
    id,
    endsAt: null,
    pausedRemainingSec: null,
    flash,
    updatedAt: new Date().toISOString(),
  }
}

export function usePersistentRestTimer(timerId: string) {
  const [row, setRow] = useState<TimerRow>(() => idle(timerId))
  const [restSec, setRestSec] = useState(0)
  const [ready, setReady] = useState(false)
  const rowRef = useRef(row)

  const persist = useCallback((value: TimerRow) => {
    const next = {
      ...value,
      id: timerId,
      updatedAt: new Date().toISOString(),
    }
    rowRef.current = next
    setRow(next)
    setRestSec(
      next.endsAt !== null
        ? Math.max(0, Math.ceil((next.endsAt - Date.now()) / 1000))
        : next.pausedRemainingSec ?? 0,
    )
    void db.restTimerState.put(next).catch(() => {})
  }, [timerId])

  useEffect(() => {
    let alive = true

    void db.restTimerState.get(timerId).then(saved => {
      let next = saved ?? idle(timerId)

      // Si el plazo venció mientras la app estaba cerrada,
      // el descanso terminó: nunca reiniciar el tiempo original.
      if (next.endsAt !== null && next.endsAt <= Date.now()) {
        next = idle(timerId)
        void db.restTimerState.put(next).catch(() => {})
      }

      if (!alive) { return }
      rowRef.current = next
      setRow(next)
      setRestSec(
        next.endsAt !== null
          ? Math.max(0, Math.ceil((next.endsAt - Date.now()) / 1000))
          : next.pausedRemainingSec ?? 0,
      )
      setReady(true)
    }).catch(() => {
      if (alive) { setReady(true) }
    })

    return () => { alive = false }
  }, [timerId])

  useEffect(() => {
    if (!ready || row.endsAt === null) {
      setRestSec(row.pausedRemainingSec ?? 0)
      return
    }

    let expired = false

    const tick = () => {
      if (expired) { return }

      const seconds = Math.max(
        0,
        Math.ceil((row.endsAt! - Date.now()) / 1000),
      )
      setRestSec(seconds)

      if (seconds === 0) {
        expired = true
        persist(idle(timerId))
      }
    }

    tick()
    const interval = window.setInterval(tick, 250)

    // Al volver desde otra aplicación, recalcular con la hora real.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { tick() }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready, row.endsAt, row.pausedRemainingSec, timerId, persist])

  const startRest = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds))
    persist(safe > 0
      ? { ...idle(timerId), endsAt: Date.now() + safe * 1000 }
      : idle(timerId))
  }, [timerId, persist])

  const pauseRest = useCallback(() => {
    const current = rowRef.current
    if (current.endsAt === null) { return }

    const remaining = Math.max(
      0,
      Math.ceil((current.endsAt - Date.now()) / 1000),
    )
    persist(remaining > 0
      ? { ...idle(timerId), pausedRemainingSec: remaining }
      : idle(timerId))
  }, [timerId, persist])

  const resumeRest = useCallback(() => {
    const current = rowRef.current
    if (current.pausedRemainingSec === null) { return }

    const remaining = current.pausedRemainingSec
    persist(remaining > 0
      ? { ...idle(timerId), endsAt: Date.now() + remaining * 1000 }
      : idle(timerId))
  }, [timerId, persist])

  const adjustRest = useCallback((delta: number) => {
    const current = rowRef.current
    const remaining = current.endsAt !== null
      ? Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000))
      : current.pausedRemainingSec ?? 0

    const nextSeconds = Math.max(0, remaining + delta)

    if (nextSeconds === 0) {
      persist(idle(timerId))
    } else if (current.pausedRemainingSec !== null) {
      persist({ ...idle(timerId), pausedRemainingSec: nextSeconds })
    } else {
      persist({ ...idle(timerId), endsAt: Date.now() + nextSeconds * 1000 })
    }
  }, [timerId, persist])

  const skipRest = useCallback(() => {
    persist(idle(timerId))
  }, [timerId, persist])

  const dismissFlash = useCallback(() => {
    if (rowRef.current.flash) { persist(idle(timerId)) }
  }, [timerId, persist])

  return {
    restSec,
    restPaused: row.pausedRemainingSec !== null,
    restFlash: row.flash,
    ready,
    startRest,
    pauseRest,
    resumeRest,
    adjustRest,
    skipRest,
    dismissFlash,
  }
}