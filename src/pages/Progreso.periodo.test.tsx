import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('ofrece las 4 modalidades con el MES ACTUAL por defecto (no 30 días)', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    const semana = await screen.findByTestId('mode-semana', undefined, { timeout: 15000 })
    expect(screen.getByTestId('mode-mes').getAttribute('aria-pressed')).toBe('true')
    expect(semana.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('mode-rutina')).toBeInTheDocument()
    expect(screen.getByTestId('mode-personalizada')).toBeInTheDocument()
    // El identificador obsoleto de 30 días ya no se ofrece.
    expect(screen.queryByTestId('mode-treinta')).toBeNull()

    fireEvent.click(semana)
    expect(screen.getByTestId('mode-semana').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('mode-mes').getAttribute('aria-pressed')).toBe('false')
    // Etiqueta de calendario, no ventana móvil.
    await screen.findByTestId('muscle-atlas', undefined, { timeout: 15000 })
    expect(screen.getAllByText(/Lunes a domingo de la semana actual/).length).toBeGreaterThan(0)
  }, 30000)

  it('el modo Mes actual cubre el mes calendario completo', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)
    await screen.findByTestId('mode-mes', undefined, { timeout: 15000 })
    await screen.findByTestId('muscle-atlas', undefined, { timeout: 15000 })
    expect(screen.getAllByText(/Mes de \d\d\/\d{4}/).length).toBeGreaterThan(0)
  }, 30000)

  it('Rutina sin ciclo muestra un estado explícito y no un período inventado', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)
    await screen.findByTestId('mode-rutina', undefined, { timeout: 15000 })
    fireEvent.click(screen.getByTestId('mode-rutina'))
    // Sin rutinas cargadas no hay ciclo: el atlas lo dice explícitamente.
    await screen.findByTestId('muscle-atlas', undefined, { timeout: 15000 })
    expect(screen.getAllByText(/Sin rutina para medir cumplimiento/).length).toBeGreaterThan(0)
    // Y dentro del atlas no inventa ninguna ventana de 30 días: lo dice.
    const atlas = within(screen.getByTestId('muscle-atlas'))
    expect(atlas.queryByText(/30 días/)).toBeNull()
    expect(atlas.getByRole('alert').textContent).toMatch(/ciclo/i)
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
    await screen.findByTestId('mode-mes', undefined, { timeout: 15000 })

    const volumen = screen.getByTestId('metrica-volumen')
    expect(volumen.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByTestId('metrica-series'))
    expect(screen.getByTestId('metrica-series').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('metrica-volumen').getAttribute('aria-checked')).toBe('false')
  }, 30000)
})
