import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { getBottleDailySummary, getBottleConfigs } from '@/services/recovery/hydrationBottles'
import Inicio from './Inicio'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

describe('Inicio — ingreso manual de ml en hidratación', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Limpiar tablas sin cerrar Dexie para evitar DatabaseClosedError en background
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('el botón +250 ml registra hidratación manual y refresca la botella', async () => {
    render(<MemoryRouter><Inicio /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })

    const btn = await screen.findByTestId('inicio-add-water-250', undefined, { timeout: 10000 })
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()

    // Estado inicial: sin agua registrada
    const inicial = await getBottleDailySummary()
    expect(inicial.totalMl).toBe(0)

    fireEvent.click(btn)

    await waitFor(() => {
      expect(btn).not.toBeDisabled()
    }, { timeout: 10000 })

    // Persistencia: ml manuales sumados al total del día
    await waitFor(async () => {
      const s = await getBottleDailySummary()
      expect(s.totalMl).toBe(250)
    }, { timeout: 10000 })

    // La botella se relectura con el nuevo total (refreshKey)
    await waitFor(() => {
      const svg = screen.getByTestId('water-bottle-svg')
      expect(svg.getAttribute('data-consumed-ml')).toBe('250')
    }, { timeout: 10000 })
  }, 40000)

  it('las botellas configuradas siguen disponibles para registrar desde Inicio', async () => {
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })

    const cfgs = await getBottleConfigs()
    expect(cfgs.filter((c) => c.active).length).toBeGreaterThanOrEqual(2)
    const b = await screen.findByLabelText(`Registrar ${cfgs[0].name} (${cfgs[0].capacityMl} ml)`, undefined, { timeout: 10000 })
    fireEvent.click(b)
    await waitFor(async () => {
      const s = await getBottleDailySummary()
      expect(s.totalMl).toBe(cfgs[0].capacityMl)
    }, { timeout: 10000 })
  }, 40000)
})
