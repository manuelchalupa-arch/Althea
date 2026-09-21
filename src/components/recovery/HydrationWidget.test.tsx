import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { HydrationWidget } from './HydrationWidget'

describe('Hidratación — botella con valor real', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('0 registros: botella vacía, sin datos ficticios', async () => {
    render(<HydrationWidget />)
    await waitFor(() => {
      expect(screen.getByText('0.0 L')).toBeInTheDocument()
    })
    const bottle = screen.getByRole('img', { name: /Botella/ })
    expect(bottle.textContent).toContain('0.0 L')
    const fill = bottle.querySelector('div[style]') as HTMLElement | null
    // La primera capa con style es el agua: altura 0%
    const water = Array.from(bottle.querySelectorAll('div')).find(d =>
      (d as HTMLElement).style?.height?.endsWith('%')
    ) as HTMLElement | undefined
    expect(water?.style.height).toBe('0%')
    expect(screen.getByText(/restantes/)).toBeInTheDocument()
  })

  it('llenado proporcional al consumo real de Dexie', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await db.hydrationLogs.put({
      id: 'h1', localDate: today, amountMl: 1250, time: new Date().toISOString(), isDemo: false,
    })
    render(<HydrationWidget />)
    await waitFor(() => {
      expect(screen.getByText('1.3 L')).toBeInTheDocument()
    })
    const bottle = screen.getByRole('img', { name: /Botella/ })
    expect(bottle.getAttribute('aria-label')).toContain('1250')
    const water = Array.from(bottle.querySelectorAll('div')).find(d =>
      (d as HTMLElement).style?.height?.endsWith('%')
    ) as HTMLElement | undefined
    expect(water?.style.height).toBe('50%')
  })
})
