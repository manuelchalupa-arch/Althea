import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ExerciseSeriesTable from '@/components/entrenar/ExerciseSeriesTable'

const base = {
  exerciseId: 'press',
  today: '2026-09-28',
  sets: 2,
  plannedReps: 8,
  plannedWeight: 0,
  plannedSets: [] as never[],
  logs: [] as never[],
  onComplete: vi.fn(),
}

beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })

describe('Unidades de carga (loadModel integrado)', () => {
  it('alterna KG/LB sin tocar el dato almacenado (kg canónico)', async () => {
    render(<ExerciseSeriesTable {...base} />)
    await waitFor(() => expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument())
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement

    fireEvent.change(w1, { target: { value: '100' } })
    expect(w1.value).toBe('100')

    // LB: el mismo peso se muestra convertido con la equivalencia conocida
    fireEvent.click(screen.getByRole('button', { name: 'LB' }))
    expect((screen.getByLabelText('kilogramos serie 1') as HTMLInputElement).value).toBe('220.5')

    // De vuelta a KG: sigue siendo el mismo dato
    fireEvent.click(screen.getByRole('button', { name: 'KG' }))
    expect((screen.getByLabelText('kilogramos serie 1') as HTMLInputElement).value).toBe('100')
    expect(localStorage.getItem('althea:loadUnit')).toBe('KG')
  })

  it('en LB, un número solo se interpreta como libras y se guarda en kg', async () => {
    render(<ExerciseSeriesTable {...base} />)
    await waitFor(() => expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'LB' }))
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement

    fireEvent.change(w1, { target: { value: '45' } })
    // 45 lb = 20.4 kg → al salir del campo se muestra en la unidad activa
    fireEvent.blur(w1)
    expect((screen.getByLabelText('kilogramos serie 1') as HTMLInputElement).value).toBe('45')
  })

  it('acepta sufijo tipeado "45 lb" y conserva el original al confirmar', async () => {
    const onComplete = vi.fn()
    render(<ExerciseSeriesTable {...base} onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument())
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement

    fireEvent.change(w1, { target: { value: '45 lb' } })
    // Se ve el equivalencia y el original preservado
    expect(screen.getByText('45 lb → 20.4 kg')).toBeInTheDocument()
    fireEvent.blur(w1)
    // En KG activo, normalizado a kg
    expect((screen.getByLabelText('kilogramos serie 1') as HTMLInputElement).value).toBe('20.4')

    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    expect(onComplete.mock.calls[0][1]).toBe(20.4)
    expect(onComplete.mock.calls[0][5]).toBe('45 lb')
  })

  it('sin equivalencia kg (placas) no inventa peso y avisa en la fila', async () => {
    const onComplete = vi.fn()
    render(<ExerciseSeriesTable {...base} onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByLabelText('kilogramos serie 1')).toBeInTheDocument())
    const w1 = screen.getByLabelText('kilogramos serie 1') as HTMLInputElement

    fireEvent.change(w1, { target: { value: '75' } })
    fireEvent.change(w1, { target: { value: '2 placas' } })
    expect(screen.getByText(/sin equivalencia kg/)).toBeInTheDocument()
    // El último peso válido sigue disponible y el original NO se declara
    fireEvent.blur(w1)
    expect((screen.getByLabelText('kilogramos serie 1') as HTMLInputElement).value).toBe('75')
    fireEvent.click(screen.getByLabelText('Confirmar serie 1'))
    expect(onComplete.mock.calls[0][1]).toBe(75)
    expect(onComplete.mock.calls[0][5]).toBeUndefined()
  })
})
