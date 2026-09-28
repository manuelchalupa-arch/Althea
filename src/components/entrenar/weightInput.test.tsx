import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ExerciseSeriesTable from '@/components/entrenar/ExerciseSeriesTable'

const base = {
  exerciseId: 'press',
  today: '2026-09-28',
  sets: 2,
  plannedReps: 8,
  plannedWeight: 0,
  plannedSets: [],
  logs: [] as never[],
  onComplete: vi.fn(),
}

describe('FASE 8 — Input de peso: borrar 0 inicial', () => {
  it('peso 0 planificado muestra input vacío (no 0)', async () => {
    render(<ExerciseSeriesTable {...base} />)
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    expect(w1.value).toBe('')
  })

  it('permite borrar el 0 y escribir un valor nuevo', async () => {
    render(<ExerciseSeriesTable {...base} />)
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement

    // Escribir 0 explícitamente
    fireEvent.change(w1, { target: { value: '0' } })
    // 0 = sin peso → vacío
    expect(w1.value).toBe('')

    // Escribir 60
    fireEvent.change(w1, { target: { value: '60' } })
    expect(w1.value).toBe('60')

    // Borrar todo
    fireEvent.change(w1, { target: { value: '' } })
    expect(w1.value).toBe('')

    // Escribir de nuevo
    fireEvent.change(w1, { target: { value: '75' } })
    expect(w1.value).toBe('75')
  })

  it('permite valores decimales', async () => {
    render(<ExerciseSeriesTable {...base} />)
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    fireEvent.change(w1, { target: { value: '62.5' } })
    expect(w1.value).toBe('62.5')
  })

  it('no permite valores inválidos al confirmar (vacío = null)', async () => {
    const onComplete = vi.fn()
    render(<ExerciseSeriesTable {...base} onComplete={onComplete} />)
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument()
    })
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    fireEvent.change(w1, { target: { value: '' } })
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][1]).toBeNull()
  })

  it('series independientes no comparten peso', async () => {
    render(<ExerciseSeriesTable {...base} sets={3} />)
    await waitFor(() => {
      expect(screen.getByLabelText('kilogramos serie 3')).toBeInTheDocument()
    })
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement
    const w2 = screen.getByLabelText('kilogramos serie 2') as HTMLInputElement
    const w3 = screen.getByLabelText('kilogramos serie 3') as HTMLInputElement

    fireEvent.change(w1, { target: { value: '60' } })
    fireEvent.change(w2, { target: { value: '65' } })
    fireEvent.change(w3, { target: { value: '70' } })

    expect(w1.value).toBe('60')
    expect(w2.value).toBe('65')
    expect(w3.value).toBe('70')
  })
})

describe('FASE 8 — Input de reps: borrar valor inicial', () => {
  it('permite borrar reps y escribir nuevo', async () => {
    render(<ExerciseSeriesTable {...base} />)
    await waitFor(() => {
      expect(screen.getByLabelText('repeticiones serie 1')).toBeInTheDocument()
    })
    const r1 = screen.getByLabelText('repeticiones serie 1') as HTMLInputElement
    // Borrar
    fireEvent.change(r1, { target: { value: '' } })
    expect(r1.value).toBe('')
    // Escribir nuevo
    fireEvent.change(r1, { target: { value: '12' } })
    expect(r1.value).toBe('12')
  })
})
