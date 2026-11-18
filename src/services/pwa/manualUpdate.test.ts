import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyUpdate } from './manualUpdate'

describe('applyUpdate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error — limpiar el mock de navigator entre tests
    delete navigator.serviceWorker
  })

  it('activa el SW en espera y recarga una sola vez', async () => {
    let onControllerChange: (() => void) | undefined
    const postMessage = vi.fn(() => onControllerChange?.())
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => ({ update: async () => {}, waiting: { postMessage } }),
        addEventListener: (_type: string, cb: () => void) => { onControllerChange = cb },
      },
    })
    const reload = vi.fn()

    await applyUpdate(reload)

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sin SW en espera igual recarga', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ update: async () => {}, waiting: null }), addEventListener: () => {} },
    })
    const reload = vi.fn()

    await applyUpdate(reload)

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
