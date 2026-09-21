import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import ExerciseSeriesTable from './ExerciseSeriesTable'
import ResultPanel from './ResultPanel'

const base = {
  exerciseId: 'press',
  today: '2026-09-20',
  sets: 2,
  plannedReps: 8,
  plannedWeight: 80,
  logs: [] as never[],
}

describe('Serie completada se puede editar sin duplicar', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('Editar cambia valores y confirma con el mismo orden (sin set nuevo)', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        {...base}
        onComplete={onComplete}
        initialCompleted={{ 0: { weight: 80, reps: 8 } }}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('Editar serie 1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Editar serie 1'))
    const repsInput = screen.getByLabelText('repeticiones serie 1') as HTMLInputElement
    expect(repsInput.value).toBe('8')
    fireEvent.change(repsInput, { target: { value: '10' } })
    fireEvent.click(screen.getByLabelText('Guardar serie 1'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    // Mismo índice/orden: (si, peso, reps, neg, obs)
    expect(onComplete.mock.calls[0][0]).toBe(0)
    expect(onComplete.mock.calls[0][2]).toBe(10)
  })

  it('Cancelar edición no confirma nada', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        {...base}
        onComplete={onComplete}
        initialCompleted={{ 0: { weight: 80, reps: 8 } }}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('Editar serie 1')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Editar serie 1'))
    fireEvent.click(screen.getByLabelText('Cancelar edición serie 1'))
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('Migración exstate: Dexie manda, sin escrituras nuevas', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('borrador legacy se aplica a inputs no confirmados y la clave se elimina', async () => {
    localStorage.setItem('exstate:2026-09-20:press', JSON.stringify({
      weights: { 1: 85 }, reps: { 1: 9 }, checks: {},
    }))
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <ExerciseSeriesTable
        {...base}
        onComplete={() => {}}
        initialCompleted={{ 0: { weight: 80, reps: 8 } }}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('repeticiones serie 2')).toBeInTheDocument()
    })
    // Serie 1 confirmada en Dexie: el borrador NO la pisa (muestra valor + Editar)
    expect(screen.getByLabelText('Editar serie 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('repeticiones serie 1')).not.toBeInTheDocument()
    // Serie 2 sin confirmar: aplica borrador
    expect((screen.getByLabelText('repeticiones serie 2') as HTMLInputElement).value).toBe('9')
    expect(localStorage.getItem('exstate:2026-09-20:press')).toBeNull()
    // Ninguna escritura a localStorage durante uso normal
    expect(setSpy).not.toHaveBeenCalled()
    setSpy.mockRestore()
  })
})

describe('ResultPanel deriva de Dexie', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('muestra volumen/series/cumplimiento y encuesta reales', async () => {
    await db.trainingSessions.put({
      id: 'ts1', sessionId: 'ts1', userId: 'me', routineId: 'r1',
      plannedDay: 1, actualDay: 1, calendarDate: '2026-09-20',
      sessionStatus: 'COMPLETED', plannedSets: 2,
      startedAt: '2026-09-20T10:00:00Z', endedAt: '2026-09-20T10:30:00Z',
      createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:30:00Z',
    } as never)
    await db.sessionExercises.put({
      sessionExerciseId: 'se1', sessionId: 'ts1', exerciseId: 'press',
      order: 0, planned: true, completed: true, status: 'COMPLETED',
      plannedSetCount: 2, actualSetCount: 2, plannedSets: [],
      createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z',
    } as never)
    for (const order of [1, 2]) {
      await db.setRecords.put({
        setRecordId: `se1:set:${order}`, sessionId: 'ts1', sessionExerciseId: 'se1',
        exerciseId: 'press', order, setType: 'NORMAL',
        plannedReps: 8, plannedWeight: 80, actualReps: 8, actualWeight: 80,
        status: 'COMPLETED', completedAt: '2026-09-20T10:05:00Z',
        createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:05:00Z',
      } as never)
    }
    await db.postWorkoutSurveys.put({
      surveyId: 'sv1', sessionId: 'ts1', userId: 'me', calendarDate: '2026-09-20',
      sessionRating: 4, pain: 1, painZone: 'hombro',
      createdAt: '2026-09-20T10:30:00Z',
    } as never)
    render(<ResultPanel today="2026-09-20" sessionStatus="COMPLETED" sessionId="ts1" />)
    await waitFor(() => {
      expect(screen.getByText('1280 kg')).toBeInTheDocument()
    })
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText(/Valoración 4\/5/)).toBeInTheDocument()
    expect(screen.getByText(/Dolor reportado/)).toBeInTheDocument()
  })

  it('sin sesión muestra estado honesto', async () => {
    render(<ResultPanel today="2026-09-20" sessionStatus="COMPLETED" sessionId={null} />)
    await waitFor(() => {
      expect(screen.getByText(/Sesión guardada en historial/)).toBeInTheDocument()
    })
  })
})
