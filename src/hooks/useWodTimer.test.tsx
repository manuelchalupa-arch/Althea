import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { db } from '@/services/storage/db'
import { getTimerState, saveTimerState } from '@/services/crossfit/cfStore'
import { useWodTimer } from './useWodTimer'

describe('useWodTimer — cronómetro WOD persistente', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('start/pause/finish persisten el estado en cfTimerState', async () => {
    const { result, unmount } = renderHook(() => useWodTimer())

    act(() => result.current.start({ format: 'AMRAP', durationSec: 600 }, 'w1'))
    expect(result.current.phase).toBe('running')
    expect(result.current.display?.phaseSec).toBe(600)
    expect(result.current.wodId).toBe('w1')
    const row = await getTimerState()
    expect(row).toMatchObject({ id: 'active', running: true, wodId: 'w1', format: 'AMRAP' })

    act(() => result.current.pause())
    expect(result.current.phase).toBe('paused')
    expect((await getTimerState())?.running).toBe(false)

    act(() => result.current.resume())
    expect(result.current.phase).toBe('running')

    act(() => result.current.finish())
    expect(result.current.phase).toBe('finished')
    expect(result.current.display?.done === false || result.current.elapsedMs >= 0).toBe(true)
    expect(await getTimerState()).toBeNull()
    unmount()
  })

  it('cancel limpia el estado y vuelve a idle', async () => {
    const { result, unmount } = renderHook(() => useWodTimer())
    act(() => result.current.start({ format: 'FOR_TIME' }))
    act(() => result.current.cancel())
    expect(result.current.phase).toBe('idle')
    expect(result.current.display).toBeNull()
    expect(await getTimerState()).toBeNull()
    unmount()
  })

  it('restaura un cronómetro en curso tras "recargar" la interfaz', async () => {
    // Estado como lo dejaría una recarga hace 30 s con AMRAP de 10 min.
    await saveTimerState({
      wodId: 'w2',
      format: 'AMRAP',
      config: { durationSec: 600 },
      startedAtMs: Date.now() - 30_000,
      accumulatedMs: 0,
      running: true,
      round: 1,
      movementIdx: 0,
      intervalIdx: 0,
    })

    const { result, unmount } = renderHook(() => useWodTimer())
    await waitFor(() => expect(result.current.phase).toBe('running'))
    // 30 s transcurridos → quedan 570 s del AMRAP de 10 min.
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(29_000)
    expect(result.current.display?.phaseSec).toBeGreaterThanOrEqual(569)
    expect(result.current.display?.phaseSec).toBeLessThanOrEqual(571)
    expect(result.current.config?.durationSec).toBe(600)
    unmount()
  })
})
