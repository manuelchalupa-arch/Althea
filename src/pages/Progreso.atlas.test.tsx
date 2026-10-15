import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Progreso from './Progreso'

/**
 * Integración con registros REALES (Dexie): una sesión de espalda de hoy debe
 * pintar la vista posterior y dejar el frente inactivo, sin depender del
 * nombre visible del ejercicio (id de biblioteca "lats/...", sin red).
 */
describe('Progreso — atlas con registros reales', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    const now = new Date().toISOString()
    await db.setRecords.put({
      setRecordId: 'se-back:set:1', sessionId: 'sess-back', sessionExerciseId: 'se-back',
      exerciseId: 'lats/remo-test', order: 1, setType: 'NORMAL',
      plannedReps: 10, plannedWeight: 60, actualReps: 10, actualWeight: 60,
      status: 'COMPLETED', completedAt: now, createdAt: now, updatedAt: now,
    } as never)
    await db.trainingSessions.put({
      id: 'sess-back', sessionId: 'sess-back', userId: 'me', routineId: 'r1',
      calendarDate: now.slice(0, 10), routineName: 'Rutina', sessionStatus: 'COMPLETED',
      createdAt: now, updatedAt: now,
    } as never)
  })

  it('la espalda trabajada hoy se colorea y el frente queda inactivo', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)
    // El atlas espera al mapa (ya no hay gráfica que esperar).
    await screen.findByTestId('muscle-atlas', undefined, { timeout: 20000 })
    expect(screen.queryByTestId('atlas-chart')).not.toBeInTheDocument()

    // Vista posterior: dorsal con trabajo → activo (no gris).
    fireEvent.click(screen.getByRole('tab', { name: 'Espalda' }))
    const lats = document.querySelector('[data-muscle-id="latissimus-dorsi"]:not(.is-idle)')
    expect(lats).not.toBeNull()

    // Vista frontal: pectoral sin trabajo → inactivo.
    fireEvent.click(screen.getByRole('tab', { name: 'Frente' }))
    const pec = document.querySelector('[data-muscle-id="pectoralis-major-sternal"].is-idle')
    expect(pec).not.toBeNull()
  }, 40000)

  it('el detalle muestra el ejercicio que aportó, sin inventar datos', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)
    await screen.findByTestId('muscle-atlas', undefined, { timeout: 20000 })

    fireEvent.click(screen.getByRole('tab', { name: 'Espalda' }))
    fireEvent.click(screen.getByRole('button', { name: /Dorsal ancho/ }))
    expect(screen.getByText('remo test')).toBeInTheDocument()
  }, 40000)

  it('el atlas no renderiza ninguna gráfica de barras ni auxiliar', async () => {
    const { container } = render(<MemoryRouter><Progreso /></MemoryRouter>)
    const atlas = await screen.findByTestId('muscle-atlas', undefined, { timeout: 20000 })
    // Ningún resto de gráfica en toda la página (barras, series o equivalente).
    expect(container.querySelector('.atlas-chart')).toBeNull()
    expect(container.querySelector('.atlas-chart__bar')).toBeNull()
    expect(screen.queryByTestId('atlas-chart')).not.toBeInTheDocument()
    expect(atlas.querySelector('svg[role="img"]')).toBeNull()
  }, 40000)
})
