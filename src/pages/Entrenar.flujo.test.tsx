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
const finishRest = () => fireEvent.click(screen.getByText('-15s'))

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
  }, 40000)

  it('al confirmar la serie se inicia el descanso obligatorio y bloquea la navegación', async () => {
    await startSession()
    render(<MemoryRouter><Entrenar /></MemoryRouter>)
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })
    await screen.findByLabelText('Confirmar serie 1', undefined, { timeout: 10000 })

    // Confirmar la serie guarda y marca el ejercicio como hecho
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    await waitFor(async () => {
      expect((await db.setRecords.toArray()).some(r => r.status === 'COMPLETED')).toBe(true)
    }, { timeout: 10000 })
    await screen.findByText(/Desmarcar ejercicio/, undefined, { timeout: 10000 })

    // El descanso se inicia automáticamente al completar la serie
    await waitFor(() => {
      expect(screen.getByText(/Descanso activo/)).toBeInTheDocument()
    }, { timeout: 10000 })

    // La navegación hacia adelante está bloqueada durante el descanso
    const nextBtn = screen.getByLabelText('Ejercicio siguiente')
    fireEvent.click(nextBtn)
    // El ejercicio actual no cambió (sigue en el mismo)
    expect(screen.getByText(/Descanso activo/)).toBeInTheDocument()

    // No hay botón para saltar el descanso
    expect(screen.queryByLabelText('Saltar descanso')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Terminar descanso')).not.toBeInTheDocument()

    // Forzar el descanso a 0 para simular que termina (usando -15s repetidamente)
    // En la práctica, el temporizador llega a 0 solo
    const adjustBtn = screen.getByText('-15s')
    for(let i = 0; i < 10; i++) {
      fireEvent.click(adjustBtn)
    }

    // Terminado el descanso se puede seguir avanzando
    await waitFor(() => {
      expect(screen.queryByText(/Descanso activo/)).not.toBeInTheDocument()
    }, { timeout: 10000 })
    expect(screen.getByLabelText('Ejercicio siguiente')).toBeInTheDocument()
  }, 40000)

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
    await waitFor(() => {
      expect(screen.getByLabelText('Finalizar entrenamiento')).toBeInTheDocument()
    }, { timeout: 10000 })
    expect(screen.queryByLabelText('Ejercicio siguiente')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Finalizar entrenamiento'))
    const heading = await screen.findByRole('heading', { name: 'Finalizar entrenamiento' }, { timeout: 10000 })
    expect(heading).toBeInTheDocument()
    // El modal de cierre ofrece acciones (no es un bloqueo sin salida)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  }, 40000)
})
