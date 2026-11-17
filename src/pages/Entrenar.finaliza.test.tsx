import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

import Entrenar from './Entrenar'

const EXERCISES = [
  { exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 },
  { exId: 'remo', name: 'Remo', sets: 1, reps: 8, weight: 60 },
]

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="route-path">{loc.pathname}</div>
}

const renderEntrenar = () =>
  render(
    <MemoryRouter initialEntries={['/entrenar']}>
      <LocationProbe />
      <Routes>
        <Route path="/entrenar" element={<Entrenar />} />
        <Route path="/" element={<div data-testid="inicio">Inicio</div>} />
      </Routes>
    </MemoryRouter>,
  )

async function startSession() {
  const { createReadySession, transitionSession } = await import('@/services/training/sessionStore')
  const created = await createReadySession({
    calendarDate: todayKey(), routineId: 'r1', routineName: 'Rutina',
    plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
    exercises: EXERCISES,
  })
  await transitionSession(created.sessionId, 'IN_PROGRESS')
  return created.sessionId
}

/** Confirma la única serie de cada ejercicio y responde "No" al dolor. */
async function confirmAll() {
  for (let i = 0; i < EXERCISES.length; i++) {
    const confirmBtn = await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 })
    fireEvent.click(confirmBtn)
    const prompt = await screen.findByTestId('pain-prompt', undefined, { timeout: 10000 })
    expect(prompt).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('No sentí dolor'))
    if (i < EXERCISES.length - 1) {
      await waitFor(() => expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument())
    }
  }
}

const openFinish = async () => {
  fireEvent.click(screen.getAllByLabelText('Finalizar entrenamiento')[0])
}

describe('Entrenar — finalización', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('confirmar guarda la sesión, la marca COMPLETED y vuelve a Inicio', async () => {
    const sid = await startSession()
    renderEntrenar()
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })
    await confirmAll()
    await openFinish()
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar . COMPLETADO/ }))
    await screen.findByTestId('inicio', undefined, { timeout: 10000 })
    // Regreso a Inicio por router (sin location.reload: la SPA siguió viva).
    expect(screen.getByTestId('route-path').textContent).toBe('/')
    const s = await db.trainingSessions.get(sid)
    expect(s?.sessionStatus).toBe('COMPLETED')
    // La sesión finalizada no queda visible como activa en Entrenar.
    const { getActiveSession } = await import('@/services/training/sessionStore')
    expect(await getActiveSession()).toBeNull()
  }, 60000)

  it('doble clic en confirmar no duplica la finalización', async () => {
    const sid = await startSession()
    renderEntrenar()
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })
    await confirmAll()
    await openFinish()
    const btn = await screen.findByRole('button', { name: /Confirmar . COMPLETADO/ })
    fireEvent.click(btn)
    fireEvent.click(btn)
    await screen.findByTestId('inicio', undefined, { timeout: 10000 })
    const events = await db.sessionEvents.toArray()
    const completed = events.filter((e) => e.toStatus === 'COMPLETED' || e.type === 'SESSION_COMPLETED')
    expect(completed).toHaveLength(1)
    expect((await db.trainingSessions.get(sid))?.sessionStatus).toBe('COMPLETED')
  }, 60000)

  it('guardado fallido muestra error, deja la sesión recuperable y el reintento funciona', async () => {
    const sid = await startSession()
    renderEntrenar()
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })
    await confirmAll()
    await openFinish()
    await screen.findByRole('button', { name: /Confirmar . COMPLETADO/ }, { timeout: 10000 })
    const putSpy = vi.spyOn(db.trainingSessions, 'put').mockRejectedValueOnce(new Error('Red caída'))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar . COMPLETADO/ }))
    // Error visible + modal abierto + sesión no finalizada (recuperable:
    // COMPLETING es el estado de "guardado a medias" y reintenta desde ahí).
    await screen.findByText(/Red caída/, undefined, { timeout: 10000 })
    const failedStatus = (await db.trainingSessions.get(sid))?.sessionStatus
    expect(['IN_PROGRESS', 'COMPLETING', 'PAUSED']).toContain(failedStatus)
    expect(screen.getByTestId('route-path').textContent).toBe('/entrenar')
    putSpy.mockRestore()
    // Reintento: guarda y vuelve a Inicio.
    fireEvent.click(screen.getByRole('button', { name: /Confirmar . COMPLETADO/ }))
    await screen.findByTestId('inicio', undefined, { timeout: 10000 })
    expect((await db.trainingSessions.get(sid))?.sessionStatus).toBe('COMPLETED')
  }, 60000)
})
