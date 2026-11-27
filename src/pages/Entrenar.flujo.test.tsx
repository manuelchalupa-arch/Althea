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

const EXERCISES = [
  { exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 },
  { exId: 'remo', name: 'Remo', sets: 1, reps: 8, weight: 60 },
  { exId: 'sentadilla', name: 'Sentadilla', sets: 1, reps: 8, weight: 100 },
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

const nextExercise = () => fireEvent.click(screen.getByLabelText('Ejercicio siguiente'))

describe('Entrenar — OK, descanso y finalizado sin bloqueos', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Limpiar tablas sin cerrar Dexie: db.delete() deja promesas de fondo
    // rechazando con DatabaseClosedError entre test y test.
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('OK persiste la serie en Dexie y el input sigue directamente editable', async () => {
    await startSession()
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })
    await screen.findByLabelText('kilogramos serie 1', undefined, { timeout: 10000 })

    const w = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(w.value).toBe('80')
    fireEvent.change(w, { target: { value: '85' } })
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))

    await waitFor(async () => {
      const recs = await db.setRecords.toArray()
      // Las 3 series están sembradas en PENDING; solo la confirmada pasa a COMPLETED
      const press = recs.filter((r) => r.exerciseId === 'press')
      expect(press).toHaveLength(1)
      expect(press[0].status).toBe('COMPLETED')
      expect(press[0].actualWeight).toBe(85)
      expect(press[0].actualReps).toBe(8)
      expect(recs.filter((r) => r.status === 'COMPLETED')).toHaveLength(1)
    }, { timeout: 10000 })

    // La serie confirmada sigue visible y editable sin botón "Editar"
    const after = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(after.value).toBe('85')
    expect(after.disabled).toBe(false)
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()

    // Al completar el ejercicio aparece la consulta de dolor (una sola vez,
    // antes del siguiente). El descanso entre ejercicios se inicia RECIÉN al
    // responder, y se guarda en restTimerState para no caer durante el test
    // siguiente (beforeEach limpia las tablas; ese descanso heredado bloquea
    // el avance y deja "Anterior" deshabilitado).
    await screen.findByTestId('pain-prompt', undefined, { timeout: 10000 })
    fireEvent.click(screen.getByLabelText('No sentí dolor'))
    await waitFor(async () => {
      expect(await db.restTimerState.get('between-exercises')).toBeTruthy()
    }, { timeout: 10000 })
  }, 40000)

  // La navegación durante el descanso se verifica en navegador real en tests/fase2-qa.spec.ts.

  it('FINALIZAR en la última serie abre el flujo de cierre sin quedarse bloqueado', async () => {
    await startSession()
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })

    // Ir al último ejercicio (sin descansos: nada fue confirmado aún)
    nextExercise()
    await waitFor(() => {
      expect(screen.getByLabelText('Ejercicio anterior')).not.toBeDisabled()
    }, { timeout: 10000 })
    nextExercise()
    // Último ejercicio: la fila deja de ofrecer "Siguiente" y NO duplica
    // Finalizar — queda uno solo en toda la pantalla (resumen lateral).
    await waitFor(() => {
      expect(screen.queryByLabelText('Ejercicio siguiente')).not.toBeInTheDocument()
    }, { timeout: 10000 })
    expect(screen.getByLabelText('Ejercicio anterior')).not.toBeDisabled()
    const finish = screen.getAllByLabelText('Finalizar entrenamiento')
    expect(finish).toHaveLength(1)

    fireEvent.click(finish[0])
    const heading = await screen.findByRole('heading', { name: 'Finalizar entrenamiento' }, { timeout: 10000 })
    expect(heading).toBeInTheDocument()
    // El modal de cierre ofrece acciones (no es un bloqueo sin salida)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  }, 40000)
})
