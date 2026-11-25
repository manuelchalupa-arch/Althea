import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { saveAllRoutines } from '@/services/storage/routineStore'
import { DEFAULT_CYCLE, type CycleConfig } from '@/utils/cycle'
import Inicio from './Inicio'

vi.mock('@/services/ai/aiService', () => ({
  aiService: {
    getChatCompletion: vi.fn().mockResolvedValue({ content: '' }),
  },
}))

type RoutineSeed = { id: string; name: string; dayExercises: Record<number, unknown[]>; cycle?: CycleConfig }

async function seedRoutine(routine: RoutineSeed) {
  const iso = new Date(Date.now() - 5 * 86400000).toISOString()
  await saveAllRoutines([{
    createdAt: iso,
    updatedAt: iso,
    rotationDays: 30,
    cycle: DEFAULT_CYCLE,
    ...routine,
  } as never], routine.id)
}

const day1Exercise = { id: 'e1', exId: 'ex-press', sets: 3, reps: 8, weight: 60, name: 'Press de banca' }
const day2Exercise = { id: 'e2', exId: 'ex-remo', sets: 4, reps: 10, weight: 40, name: 'Remo con barra' }

describe('Inicio — selector "Cambiar entrenamiento de hoy"', () => {
  const mounted: Array<() => void> = []
  const renderInicio = () => {
    const view = render(<MemoryRouter><Inicio /></MemoryRouter>)
    mounted.push(view.unmount)
    return view
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    try { await Promise.all(db.tables.map(t => t.clear())) } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })
  afterEach(() => { while (mounted.length) mounted.pop()!() })

  it('lista solo los días de la rutina asignada con sus ejercicios reales', async () => {
    // La rutina tiene 2 días; el ciclo canónico (DEFAULT_CYCLE) tiene 4.
    await seedRoutine({ id: 'r-sel', name: 'Rutina asignada', dayExercises: { 1: [day1Exercise], 2: [day2Exercise] } })
    renderInicio()
    await waitFor(() => expect(screen.getByText(/¡Hola!/)).toBeInTheDocument(), { timeout: 8000 })

    fireEvent.click(screen.getByTestId('inicio-change-day-hero'))
    const modal = await screen.findByTestId('inicio-change-day-modal', undefined, { timeout: 8000 })

    // Días reales de la rutina, con los ejercicios que contienen.
    await waitFor(() => expect(within(modal).getByTestId('inicio-change-day-1').textContent).toContain('Press de banca'), { timeout: 8000 })
    // Los días del ciclo sin ejercicios NO se ofrecen como entrenamiento.
    expect(within(modal).queryByTestId('inicio-change-day-3')).not.toBeInTheDocument()
    expect(within(modal).queryByTestId('inicio-change-day-4')).not.toBeInTheDocument()
    expect(within(modal).getByTestId('inicio-change-day-1').textContent).toContain('1 ejercicio')
    expect(within(modal).getByTestId('inicio-change-day-2').textContent).toContain('Remo con barra')
  }, 30000)

  it('al elegir un día, la tarjeta carga SUS ejercicios y refresca al cambiar la rutina', async () => {
    await seedRoutine({ id: 'r-sel', name: 'Rutina asignada', dayExercises: { 1: [day1Exercise], 2: [day2Exercise] } })
    renderInicio()
    await waitFor(() => expect(screen.getByText(/¡Hola!/)).toBeInTheDocument(), { timeout: 8000 })

    fireEvent.click(screen.getByTestId('inicio-change-day-hero'))
    await screen.findByTestId('inicio-change-day-modal', undefined, { timeout: 8000 })
    // Espera a que el selector muestre la rutina real (los días del ciclo sin
    // ejercicios salen deshabilitados hasta que carga el plan asignado).
    await waitFor(() => expect((screen.getByTestId('inicio-change-day-2') as HTMLButtonElement).disabled).toBe(false), { timeout: 8000 })
    fireEvent.click(screen.getByTestId('inicio-change-day-2'))
    await waitFor(() => expect(screen.queryByTestId('inicio-change-day-modal')).not.toBeInTheDocument(), { timeout: 8000 })
    // La tarjeta del día muestra los ejercicios del día elegido.
    await waitFor(() => expect(screen.getByText('Remo con barra')).toBeInTheDocument(), { timeout: 8000 })

    // Cambio de rutina asignada (mismo día, otro contenido) + aviso global:
    // el selector se refresca sin recargar la página.
    await seedRoutine({ id: 'r-sel', name: 'Rutina asignada', dayExercises: {
      1: [{ id: 'e1', exId: 'ex-press', sets: 3, reps: 8, weight: 60, name: 'Press militar' }],
      2: [day2Exercise],
    } })
    fireEvent.click(screen.getByTestId('inicio-change-day-hero'))
    const modal = await screen.findByTestId('inicio-change-day-modal', undefined, { timeout: 8000 })
    window.dispatchEvent(new Event('routineChange'))
    await waitFor(() => expect(within(modal).getByTestId('inicio-change-day-1').textContent).toContain('Press militar'), { timeout: 8000 })
    expect(within(modal).getByTestId('inicio-change-day-1').textContent).not.toContain('Press de banca')
  }, 30000)
})
