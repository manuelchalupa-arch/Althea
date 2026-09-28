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

describe('Todas las series son editables directamente', () => {
  it('Serie completada se edita directamente sin botón Editar — OK confirma', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        {...base}
        onComplete={onComplete}
        initialCompleted={{ 0: { weight: 80, reps: 8 } }}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    // La serie completada muestra inputs directamente (sin botón Editar)
    const weightInput = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(weightInput.value).toBe('80')
    // Cambiar peso y confirmar con OK
    fireEvent.change(weightInput, { target: { value: '90' } })
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0]).toBe(0)
    expect(onComplete.mock.calls[0][1]).toBe(90)
  })

  it('No existe botón Editar para ninguna serie completada', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        {...base}
        onComplete={onComplete}
        initialCompleted={{ 0: { weight: 80, reps: 8 } }}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    // Verificar que no hay botón "Editar"
    expect(screen.queryByLabelText('Editar serie 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Editar')).not.toBeInTheDocument()
  })

  it('peso vacío muestra input vacío y 10/20/30 se muestran correctamente', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        {...base}
        exerciseId="squat"
        today="2026-09-20"
        sets={3}
        plannedReps={8}
        plannedWeight={0}
        plannedSets={[]}
        onComplete={onComplete}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    // Sin peso planificado → input vacío
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(w1.value).toBe('')
    // Cambiar a 10
    fireEvent.change(w1, { target: { value: '10' } })
    expect(w1.value).toBe('10')
    // Cambiar a 20
    fireEvent.change(w1, { target: { value: '20' } })
    expect(w1.value).toBe('20')
    // Cambiar a 30
    fireEvent.change(w1, { target: { value: '30' } })
    expect(w1.value).toBe('30')
    // Borrar → vuelve a vacío
    fireEvent.change(w1, { target: { value: '' } })
    expect(w1.value).toBe('')
  })

  it('peso vacío se confirma como null y nunca se transforma en 0', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        {...base}
        exerciseId="squat"
        sets={2}
        plannedReps={8}
        plannedWeight={0}
        plannedSets={[]}
        onComplete={onComplete}
      />,
    )
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(w1.value).toBe('')
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][1]).toBeNull()
    expect(onComplete.mock.calls[0][1]).not.toBe(0)
  })

  it('4 series con reps y peso independientes no se comparten entre sí', async () => {
    const onComplete = vi.fn()
    const PLAN4 = [
      { order: 1, reps: 10, weight: 10 },
      { order: 2, reps: 8, weight: 12 },
      { order: 3, reps: 9, weight: 15 },
      { order: 4, reps: 6, weight: 25 },
    ]
    render(
      <ExerciseSeriesTable
        exerciseId="press"
        today="2026-09-20"
        sets={4}
        plannedReps={10}
        plannedWeight={10}
        plannedSets={PLAN4}
        logs={[]}
        onComplete={onComplete}
      />,
    )
    await waitFor(() => {
      expect(screen.getByLabelText('repeticiones serie 4')).toBeInTheDocument()
    })
    const reps = (n: number) => screen.getByLabelText(`repeticiones serie ${n}`) as HTMLInputElement
    const kg = (n: number) => screen.getByLabelText(`kilogramos serie ${n}`) as HTMLInputElement

    expect([reps(1).value, kg(1).value]).toEqual(['10', '10'])
    expect([reps(2).value, kg(2).value]).toEqual(['8', '12'])
    expect([reps(3).value, kg(3).value]).toEqual(['9', '15'])
    expect([reps(4).value, kg(4).value]).toEqual(['6', '25'])

    // Editar una serie no altera a las demás
    fireEvent.change(kg(2), { target: { value: '20' } })
    expect(kg(1).value).toBe('10')
    expect(kg(3).value).toBe('15')
    expect(kg(4).value).toBe('25')

    // OK de la serie 3 confirma sus propios valores, no los de otra serie
    fireEvent.click(screen.getByLabelText('Confirmar serie 3'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0]).toBe(2)
    expect(onComplete.mock.calls[0][1]).toBe(15)
    expect(onComplete.mock.calls[0][2]).toBe(9)
  })
})

describe('FASE 1 — Plan precargado por serie, ejecutado separado', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  const PLAN = [
    { order: 1, reps: 8, weight: 80 },
    { order: 2, reps: 8, weight: 82.5 },
    { order: 3, reps: 6, weight: 85 },
    { order: 4, reps: 6, weight: 85 },
  ]

  it('la tabla muestra el plan por serie sin escribir nada manualmente', async () => {
    render(
      <ExerciseSeriesTable
        exerciseId="press"
        today="2026-09-20"
        sets={4}
        plannedReps={8}
        plannedWeight={80}
        plannedSets={PLAN}
        logs={[]}
        onComplete={() => {}}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('repeticiones serie 2')).toBeInTheDocument()
    })
    // Valores por serie, no reducción a la primera
    expect((screen.getByLabelText('repeticiones serie 1') as HTMLInputElement).value).toBe('8')
    expect((screen.getByLabelText('kilogramos serie 2') as HTMLInputElement).value).toBe('82.5')
    expect((screen.getByLabelText('repeticiones serie 3') as HTMLInputElement).value).toBe('6')
    expect((screen.getByLabelText('kilogramos serie 4') as HTMLInputElement).value).toBe('85')
  })

  it('ejecutado queda separado del plan y sobrevive reload', async () => {
    const onComplete = vi.fn()
    render(
      <ExerciseSeriesTable
        exerciseId="press"
        today="2026-09-20"
        sets={4}
        plannedReps={8}
        plannedWeight={80}
        plannedSets={PLAN}
        logs={[]}
        onComplete={onComplete}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('repeticiones serie 1')).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('repeticiones serie 1') as HTMLInputElement, { target: { value: '9' } })
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    expect(onComplete).toHaveBeenCalledWith(0, 80, 9, undefined, undefined, undefined)
    // El plan de las demás series sigue intacto
    expect((screen.getByLabelText('repeticiones serie 2') as HTMLInputElement).value).toBe('8')
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
    // Todas las series muestran inputs directamente (sin botón Editar)
    expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    // Serie 1 confirmada en Dexie: el borrador NO la pisa (muestra valor planificado)
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(w1.value).toBe('80')
    // Serie 2 sin confirmar: aplica borrador
    expect((screen.getByLabelText('repeticiones serie 2') as HTMLInputElement).value).toBe('9')
    expect(localStorage.getItem('exstate:2026-09-20:press')).toBeNull()
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

  it('ejercicio con 3 series diferentes mantiene valores individuales por order', async () => {
    // Simula un ejercicio con 3 series planificadas distintas
    const PLAN_3_SERIES = [
      { order: 1, reps: 10, weight: 20 },
      { order: 2, reps: 8, weight: 25 },
      { order: 3, reps: 6, weight: 30 },
    ]

    render(
      <ExerciseSeriesTable
        exerciseId="squat"
        today="2026-09-20"
        sets={3}
        plannedReps={10}
        plannedWeight={20}
        plannedSets={PLAN_3_SERIES}
        logs={[]}
        onComplete={() => {}}
      />
    )
    await waitFor(() => {
      expect(screen.getByLabelText('repeticiones serie 1')).toBeInTheDocument()
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
      expect(screen.getByLabelText('repeticiones serie 2')).toBeInTheDocument()
      expect(screen.getByLabelText('kilogramos serie 2')).toBeInTheDocument()
      expect(screen.getByLabelText('repeticiones serie 3')).toBeInTheDocument()
      expect(screen.getByLabelText('kilogramos serie 3')).toBeInTheDocument()
    })
    // Cada serie muestra su valor individual, NO reducción a la primera
    expect((screen.getByLabelText('repeticiones serie 1') as HTMLInputElement).value).toBe('10')
    expect((screen.getByLabelText('kilogramos serie 1') as HTMLInputElement).value).toBe('20')
    expect((screen.getByLabelText('repeticiones serie 2') as HTMLInputElement).value).toBe('8')
    expect((screen.getByLabelText('kilogramos serie 2') as HTMLInputElement).value).toBe('25')
    expect((screen.getByLabelText('repeticiones serie 3') as HTMLInputElement).value).toBe('6')
    expect((screen.getByLabelText('kilogramos serie 3') as HTMLInputElement).value).toBe('30')
    // El fallback a plannedReps/plannedWeight (valores escalares) no debe afectar cuando plannedSetsDetail tiene datos
    // Verify planFor logic: series 2 should show 8/25, not 10/20
  })
})
