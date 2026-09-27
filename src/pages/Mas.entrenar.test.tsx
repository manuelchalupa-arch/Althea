import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

import Mas from './Mas'

const entrenarLinks = () =>
  screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/entrenar')

async function createActiveSession() {
  const { createReadySession, transitionSession } = await import('@/services/training/sessionStore')
  const created = await createReadySession({
    calendarDate: todayKey(), routineId: 'r1', routineName: 'Rutina Push',
    plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
    exercises: [{ exId: 'press', name: 'Press', sets: 3, reps: 8, weight: 80 }],
  })
  await transitionSession(created.sessionId, 'IN_PROGRESS')
  return created.sessionId
}

describe('Más — acceso a Entrenar', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    try { await db.delete() } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  it('sin sesión activa no muestra el acceso a Entrenar', async () => {
    render(<MemoryRouter><Mas /></MemoryRouter>)
    await screen.findByText(/rutinas registradas/, undefined, { timeout: 10000 })
    // deja terminar el chequeo async de sesión activa
    await new Promise((r) => setTimeout(r, 500))
    expect(entrenarLinks()).toHaveLength(0)
    // el resto de accesos sigue completo
    expect(screen.getByRole('link', { name: /Calendario/ })).toBeInTheDocument()
  }, 30000)

  it('con sesión activa muestra el acceso a Entrenar', async () => {
    await createActiveSession()
    render(<MemoryRouter><Mas /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /Entrenar/ }, { timeout: 10000 })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/entrenar')
    expect(entrenarLinks().length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByRole('link', { name: /Rutinas/ })).toBeInTheDocument())
  }, 30000)
})
