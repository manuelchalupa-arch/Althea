import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { getBottleDailySummary } from '@/services/recovery/hydrationBottles'
import Inicio from './Inicio'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

describe('Inicio — hidratación es solo visual (registro y config en Nutrición)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('muestra la botella chica con botones de registro (sin editor de config)', async () => {
    render(<MemoryRouter><Inicio /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })

    const svg = await screen.findByTestId('water-bottle-svg', undefined, { timeout: 10000 })
    expect(svg).toBeInTheDocument()

    // Registro rápido desde Inicio: vaso estático + botellas activas; sin editor.
    expect(screen.queryByTestId('inicio-add-water-250')).not.toBeInTheDocument()
    expect(screen.getByTestId('water-bottle-actions')).toBeInTheDocument()
    const staticBtn = await screen.findByTestId('water-bottle-add-static', undefined, { timeout: 10000 })
    expect(staticBtn).toBeInTheDocument()
    expect(screen.queryByTestId('bottle-config-editor')).not.toBeInTheDocument()

    // El detalle/registro queda referenciado desde la tarjeta de hidratación.
    const link = screen.getAllByRole('link', { name: /Nutrición →/ })
    expect(link.length).toBeGreaterThanOrEqual(1)
  }, 40000)

  it('la botella de Inicio refleja el consumo registrado en Nutrición', async () => {
    const { addHydrationMl } = await import('@/services/recovery/hydrationBottles')
    await addHydrationMl(250)

    render(<MemoryRouter><Inicio /></MemoryRouter>)

    await waitFor(() => {
      const svg = screen.getByTestId('water-bottle-svg')
      expect(svg.getAttribute('data-consumed-ml')).toBe('250')
    }, { timeout: 10000 })

    const resumen = await getBottleDailySummary()
    expect(resumen.totalMl).toBe(250)
  }, 40000)
})
