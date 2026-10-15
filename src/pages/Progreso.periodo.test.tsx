import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import Progreso from './Progreso'

describe('Progreso — modalidades del mapa muscular', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    await db.bodyMeasurements.put({
      id: 'bm-periodo', localDate: todayKey(), weightKg: 80,
      createdAt: new Date().toISOString(),
    } as never)
  })

  it('ofrece las 4 modalidades con 30 días por defecto', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    const semana = await screen.findByTestId('mode-semana', undefined, { timeout: 15000 })
    expect(screen.getByTestId('mode-treinta').getAttribute('aria-pressed')).toBe('true')
    expect(semana.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('mode-rutina')).toBeInTheDocument()
    expect(screen.getByTestId('mode-personalizada')).toBeInTheDocument()

    fireEvent.click(semana)
    expect(screen.getByTestId('mode-semana').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('mode-treinta').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Últimos 7 días')).toBeInTheDocument()
  }, 30000)

  it('permite elegir un rango personalizado con validación', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    const custom = await screen.findByTestId('mode-personalizada', undefined, { timeout: 15000 })
    expect(screen.queryByLabelText(/Desde/)).toBeNull()

    fireEvent.click(custom)
    expect(screen.getByText('Rango personalizado')).toBeInTheDocument()
    expect(screen.getByLabelText(/Desde/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Hasta/)).toBeInTheDocument()
  }, 30000)

  it('permite cambiar la métrica que colorea el mapa', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)
    await screen.findByTestId('mode-treinta', undefined, { timeout: 15000 })

    const volumen = screen.getByTestId('metrica-volumen')
    expect(volumen.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByTestId('metrica-series'))
    expect(screen.getByTestId('metrica-series').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('metrica-volumen').getAttribute('aria-checked')).toBe('false')
  }, 30000)
})
