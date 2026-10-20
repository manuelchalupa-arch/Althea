import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { DailyRemindersConfig } from './DailyRemindersConfig'

const { loadUnifiedConfigs } = vi.hoisted(() => ({ loadUnifiedConfigs: vi.fn() }))

vi.mock('@/services/notifications/unifiedNotifications', () => ({
  loadUnifiedConfigs,
  saveUnifiedConfig: vi.fn(),
  saveUnifiedConfigs: vi.fn(),
}))

const AGUA = {
  id: 'agua-1', type: 'agua', title: 'Agua', enabled: true, time: '10:00', times: ['10:00'],
  days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
}

describe('DailyRemindersConfig — carga asíncrona', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

  it('no actualiza estado si la carga termina después de desmontar', async () => {
    let resolveLoad!: (configs: unknown[]) => void
    loadUnifiedConfigs.mockReturnValue(new Promise<unknown[]>(resolve => { resolveLoad = resolve }))

    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', onUnhandled)

    try {
      const { unmount } = render(<DailyRemindersConfig />)
      unmount()
      // Simula el cierre del entorno: React DOM lee window.event al programar
      // una actualización, y con el entorno cerrado eso lanza un error no controlado.
      vi.stubGlobal('window', undefined)
      resolveLoad([AGUA])
      await new Promise(resolve => setTimeout(resolve, 30))
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }

    expect(unhandled).toEqual([])
  })
})
