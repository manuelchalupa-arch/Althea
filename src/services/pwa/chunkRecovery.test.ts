import { describe, expect, it, vi } from 'vitest'
import { installDynamicImportRecovery } from './chunkRecovery'

function setup() {
  let listener: ((event: Event) => void) | undefined
  const values = new Map<string, string>()
  const reload = vi.fn()
  const target = {
    addEventListener: (_type: string, callback: EventListenerOrEventListenerObject) => {
      listener = callback as (event: Event) => void
    },
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    },
    location: { reload },
  } as unknown as Window

  installDynamicImportRecovery(target)
  return { fire: () => {
    const event = new Event('vite:preloadError', { cancelable: true })
    listener?.(event)
    return event
  }, reload }
}

describe('installDynamicImportRecovery', () => {
  it('recarga una vez y evita que Vite propague la falla inicial', () => {
    const { fire, reload } = setup()
    const event = fire()

    expect(event.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('no entra en un bucle si el mismo chunk vuelve a fallar después de recargar', () => {
    const { fire, reload } = setup()
    fire()
    const secondEvent = fire()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(secondEvent.defaultPrevented).toBe(false)
  })
})
