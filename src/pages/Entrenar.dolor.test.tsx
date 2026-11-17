import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

import Entrenar from './Entrenar'
import ExercisePainPrompt from '@/components/entrenar/ExercisePainPrompt'

const EXERCISES = [
  { exId: 'press', name: 'Press', sets: 3, reps: 8, weight: 80 },
  { exId: 'remo', name: 'Remo', sets: 1, reps: 8, weight: 60 },
]

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

describe('Consulta de dolor post-ejercicio', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('nunca aparece entre series; se pide UNA vez al terminar el ejercicio y "No" no registra', async () => {
    await startSession()
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    // Serie 1 de 3: sin consulta de dolor (nunca entre series).
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    await waitFor(() => expect(screen.getByLabelText('kilogramos serie 2')).toBeInTheDocument(), { timeout: 10000 })
    expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument()

    // Serie 2 de 3: sigue sin consulta.
    fireEvent.click(screen.getByLabelText('Confirmar serie 2'))
    await waitFor(() => expect(screen.getByLabelText('kilogramos serie 3')).toBeInTheDocument(), { timeout: 10000 })
    expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument()

    // Última serie: el ejercicio terminó → consulta antes del siguiente.
    fireEvent.click(screen.getByLabelText('Confirmar serie 3'))
    await screen.findByTestId('pain-prompt', undefined, { timeout: 10000 })
    fireEvent.click(screen.getByLabelText('No sentí dolor'))
    await waitFor(() => expect(screen.queryByTestId('pain-prompt')).not.toBeInTheDocument())
    // "No" no escribe registro de dolor.
    expect(await db.painLogs.count()).toBe(0)
  }, 40000)

  it('"Sí" exige zona obligatoria y guarda un único registro por ejercicio y día', async () => {
    const onAnswered = vi.fn()
    const { unmount } = render(<ExercisePainPrompt exerciseId="press" exerciseName="Press" onAnswered={onAnswered} />)
    fireEvent.click(screen.getByLabelText('Sí sentí dolor'))
    // Sin zona no se puede guardar.
    const guardar = screen.getByRole('button', { name: /Guardar y seguir/ })
    expect(guardar).toBeDisabled()
    expect(await db.painLogs.count()).toBe(0)
    fireEvent.change(screen.getByLabelText('Zona con dolor'), { target: { value: 'pecho' } })
    expect(guardar).not.toBeDisabled()
    fireEvent.click(guardar)
    await waitFor(async () => expect(await db.painLogs.count()).toBe(1), { timeout: 10000 })
    const log = (await db.painLogs.toArray())[0]
    expect(log.zone).toBe('pecho')
    expect(log.exerciseId).toBe('press')
    expect(log.localDate).toBe(todayKey())
    expect(onAnswered).toHaveBeenCalledTimes(1)
    unmount()

    // Mismo ejercicio y mismo día: segunda respuesta NO duplica el registro.
    render(<ExercisePainPrompt exerciseId="press" exerciseName="Press" onAnswered={onAnswered} />)
    fireEvent.click(screen.getByLabelText('Sí sentí dolor'))
    fireEvent.change(screen.getByLabelText('Zona con dolor'), { target: { value: 'pecho' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar y seguir/ }))
    await waitFor(() => expect(screen.queryByTestId('pain-prompt')).toBeTruthy())
    await new Promise((r) => setTimeout(r, 300))
    expect(await db.painLogs.count()).toBe(1)
  }, 40000)

  it('"No" responde sin escribir en db y llama onAnswered una sola vez', async () => {
    const onAnswered = vi.fn()
    render(<ExercisePainPrompt exerciseId="remo" exerciseName="Remo" onAnswered={onAnswered} />)
    fireEvent.click(screen.getByLabelText('No sentí dolor'))
    expect(onAnswered).toHaveBeenCalledTimes(1)
    expect(await db.painLogs.count()).toBe(0)
  })
})
