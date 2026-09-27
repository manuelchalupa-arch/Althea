import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { createReadySession, transitionSession } from '@/services/training/sessionStore'
import AppNav from './AppNav'

const EXERCISES = [{ exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }]

describe('AppNav — /entrenar solo visible con sesión activa', () => {
  beforeEach(async () => {
    try { await db.delete() } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  it('sin sesión activa NO aparece Entrenar en la navegación', async () => {
    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getAllByLabelText('Inicio').length).toBeGreaterThan(0)
    }, { timeout: 8000 })
    // Esperar el resolutor async de getActiveSession
    await waitFor(() => {
      expect(screen.queryAllByLabelText('Entrenar')).toHaveLength(0)
    }, { timeout: 8000 })
    // El resto de la navegación sigue completo
    expect(screen.getAllByLabelText('Nutrición').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Progreso').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Más').length).toBeGreaterThan(0)
  })

  it('con sesión activa SÍ aparece Entrenar en la navegación', async () => {
    const { sessionId } = await createReadySession({
      calendarDate: todayKey(), routineId: 'r1', routineName: 'Rutina',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: EXERCISES,
    })
    await transitionSession(sessionId, 'IN_PROGRESS')

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.queryAllByLabelText('Entrenar').length).toBeGreaterThan(0)
    }, { timeout: 8000 })
  })
})
