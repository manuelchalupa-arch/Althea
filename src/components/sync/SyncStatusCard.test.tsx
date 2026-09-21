import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/services/sync/opQueue', () => ({
  pendingCount: vi.fn(),
  errorCount: vi.fn(),
}))

vi.mock('@/services/firebase/sync', () => ({
  lastSyncAt: vi.fn(),
}))

import { pendingCount, errorCount } from '@/services/sync/opQueue'
import { lastSyncAt } from '@/services/firebase/sync'
import { SyncStatusCard } from './SyncStatusCard'

const mockPending = pendingCount as unknown as ReturnType<typeof vi.fn>
const mockErrors = errorCount as unknown as ReturnType<typeof vi.fn>
const mockLastSync = lastSyncAt as unknown as ReturnType<typeof vi.fn>

describe('SyncStatusCard — estados honestos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLastSync.mockReturnValue(null)
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  })

  it('offline: nunca bloquea, lo dice explícitamente', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    mockPending.mockResolvedValue(2)
    mockErrors.mockResolvedValue(0)
    render(<SyncStatusCard />)
    await waitFor(() => {
      expect(screen.getByText(/Offline/)).toBeInTheDocument()
    })
  })

  it('pendiente con operaciones sin sincronizar', async () => {
    mockPending.mockResolvedValue(3)
    mockErrors.mockResolvedValue(0)
    render(<SyncStatusCard />)
    await waitFor(() => {
      expect(screen.getByText(/Pendiente/)).toBeInTheDocument()
    })
    expect(screen.getByText(/3 operación/)).toBeInTheDocument()
  })

  it('sincronizado solo sin pendientes ni errores', async () => {
    mockPending.mockResolvedValue(0)
    mockErrors.mockResolvedValue(0)
    mockLastSync.mockReturnValue('2026-09-20T10:00:00Z')
    render(<SyncStatusCard />)
    await waitFor(() => {
      expect(screen.getByText('Sincronizado')).toBeInTheDocument()
    })
  })

  it('error visible cuando hay operaciones fallidas', async () => {
    mockPending.mockResolvedValue(0)
    mockErrors.mockResolvedValue(1)
    render(<SyncStatusCard />)
    await waitFor(() => {
      expect(screen.getByText(/Error de sincronización/)).toBeInTheDocument()
    })
  })
})
