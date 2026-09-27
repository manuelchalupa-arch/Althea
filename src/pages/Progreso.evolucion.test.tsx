import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import Progreso from './Progreso'

describe('Progreso — período, métrica y evolución', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    await db.bodyMeasurements.put({
      id: 'bm-evol', localDate: todayKey(), weightKg: 80,
      createdAt: new Date().toISOString(),
    } as never)
  })

  it('permite cambiar el período y refleja la selección', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    const p7 = await screen.findByTestId('period-7', undefined, { timeout: 15000 })
    const p30 = screen.getByTestId('period-30')
    expect(p30.getAttribute('aria-pressed')).toBe('true')
    expect(p7.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(p7)
    expect(screen.getByTestId('period-7').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('period-30').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Últimos 7 días')).toBeInTheDocument()
  }, 30000)

  it('expone el selector de parte muscular, las métricas y el gráfico', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    const evolution = await screen.findByRole('heading', { name: 'Evolución por parte muscular' }, { timeout: 15000 })
    expect(evolution).toBeInTheDocument()
    const card = evolution.parentElement

    const part = screen.getByLabelText('Parte muscular')
    expect(part.tagName).toBe('SELECT')

    const volumen = screen.getByTestId('metric-volumen')
    expect(volumen.getAttribute('aria-pressed')).toBe('true')
    // ayuda de la métrica activa
    expect(screen.getByText('Suma de kg×reps del día.')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('metric-peso'))
    expect(screen.getByTestId('metric-peso').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('metric-volumen').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Peso máximo del día (kg).')).toBeInTheDocument()
    expect(card).toBeTruthy()

    // sin series en el período seleccionado: el gráfico lo dice, no inventa curvas
    expect(screen.getByTestId('progreso-chart').textContent).toContain('Sin datos suficientes')
  }, 30000)

  it('permite elegir un rango personalizado', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    const custom = await screen.findByTestId('period-custom', undefined, { timeout: 15000 })
    expect(screen.queryByLabelText(/Desde/)).toBeNull()

    fireEvent.click(custom)
    expect(screen.getByText('Rango personalizado')).toBeInTheDocument()
    expect(screen.getByLabelText(/Desde/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Hasta/)).toBeInTheDocument()
  }, 30000)
})
