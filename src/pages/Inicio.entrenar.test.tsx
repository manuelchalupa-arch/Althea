import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { createReadySession, transitionSession } from '@/services/training/sessionStore'
import Inicio from './Inicio'

vi.mock('@/services/ai/aiService', () => ({
  aiService: {
    getChatCompletion: vi.fn().mockResolvedValue({ content: '' }),
  },
}))

describe('Entrenar visibilidad según estado de sesión', () => {
  const mounted: Array<() => void> = []

  const renderInicio = () => {
    const view = render(
      <MemoryRouter>
        <Inicio />
      </MemoryRouter>,
    )
    mounted.push(view.unmount)
    return view
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    try { await Promise.all(db.tables.map(t => t.clear())) } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  afterEach(() => {
    while (mounted.length) mounted.pop()!()
  })

  it('sesión no iniciada → Entrenar NO visible en Inicio', async () => {
    renderInicio()
    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })
    expect(screen.queryByText('Entrenar')).not.toBeInTheDocument()
    expect(screen.queryByText('LANZAR SESION')).not.toBeInTheDocument()
  })

  it('sesión completada → Entrenar NO visible en Inicio', async () => {
    const today = todayKey()
    const created = await createReadySession({
      calendarDate: today,
      routineId: 'r1',
      routineName: 'Rutina',
      plannedDay: 1,
      plannedDayName: 'Pecho',
      actualDay: 1,
      actualDayName: 'Pecho',
      exercises: [{ exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }],
    })
    await transitionSession(created.sessionId, 'IN_PROGRESS')
    await transitionSession(created.sessionId, 'COMPLETING')
    await transitionSession(created.sessionId, 'COMPLETED')

    renderInicio()
    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })
    await waitFor(() => {
      expect(screen.queryByText('Entrenar')).not.toBeInTheDocument()
    }, { timeout: 8000 })
    expect(screen.queryByText('LANZAR SESION')).not.toBeInTheDocument()
  })

  it('día completado → no se ofrece COMENZAR ni se crea otra sesión', async () => {
    const today = todayKey()
    const created = await createReadySession({
      calendarDate: today,
      routineId: 'r1',
      routineName: 'Rutina',
      plannedDay: 1,
      plannedDayName: 'Pecho',
      actualDay: 1,
      actualDayName: 'Pecho',
      exercises: [{ exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }],
    })
    await transitionSession(created.sessionId, 'IN_PROGRESS')
    await transitionSession(created.sessionId, 'COMPLETING')
    await transitionSession(created.sessionId, 'COMPLETED')

    renderInicio()
    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })
    // Ni el CTA del hero ni el de la tarjeta principal aparecen
    await waitFor(() => {
      expect(screen.queryByTestId('inicio-start-training')).not.toBeInTheDocument()
      expect(screen.queryByTestId('inicio-hero-cta')).not.toBeInTheDocument()
      expect(screen.getByTestId('inicio-start-done')).toBeInTheDocument()
    }, { timeout: 8000 })
    expect(screen.queryByRole('button', { name: /Comenzar entrenamiento/i })).not.toBeInTheDocument()
  })
})
