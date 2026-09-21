import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'

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

describe('Entrenar — navegación estable 0→1→2→1→0→1 sin resets', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('Siguiente/Anterior conservan índice, series y sesión única', async () => {
    const { createReadySession, transitionSession } = await import('@/services/training/sessionStore')
    const today = new Date().toISOString().slice(0, 10)
    // Flujo real: Inicio crea la sesión; Entrenar la muestra en curso
    const created = await createReadySession({
      calendarDate: today, routineId: 'r1', routineName: 'Rutina',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: EXERCISES,
    })
    await transitionSession(created.sessionId, 'IN_PROGRESS')
    render(
      <MemoryRouter>
        <Entrenar />
      </MemoryRouter>
    )

    // Pantalla inicial = ejercicio 1 (Press)
    await screen.findByLabelText('Ejercicio siguiente', undefined, { timeout: 10000 })
    expect(screen.getByLabelText('Ejercicio anterior')).toBeDisabled()
    expect(screen.queryByLabelText('Finalizar entrenamiento')).not.toBeInTheDocument()

    const shownExercise = () => {
      // El h2 del ejercicio actual contiene su nombre
      const h2s = document.querySelectorAll('h2')
      for (const h of Array.from(h2s)) {
        const t = (h.textContent || '').toLowerCase()
        for (const name of ['press', 'remo', 'sentadilla']) {
          if (t.includes(name)) { return name }
        }
      }
      return null
    }

    // 0 → 1 → 2 (último: Finalizar reemplaza a Siguiente)
    fireEvent.click(screen.getByLabelText('Ejercicio siguiente'))
    await waitFor(() => {
      expect(shownExercise()).toBe('remo')
    }, { timeout: 8000 })
    fireEvent.click(screen.getByLabelText('Ejercicio siguiente'))
    await waitFor(() => {
      expect(screen.getByLabelText('Finalizar entrenamiento')).toBeInTheDocument()
    }, { timeout: 8000 })
    // Esperar efectos async y verificar que NO volvió a 0
    await new Promise(r => setTimeout(r, 500))
    expect(screen.getByLabelText('Finalizar entrenamiento')).toBeInTheDocument()
    expect(screen.queryByLabelText('Ejercicio siguiente')).not.toBeInTheDocument()
    expect(shownExercise()).toBe('sentadilla')

    // 2 → 1 → 0
    fireEvent.click(screen.getByLabelText('Ejercicio anterior'))
    await waitFor(() => {
      expect(screen.getByLabelText('Ejercicio siguiente')).toBeInTheDocument()
    })
    expect(shownExercise()).toBe('remo')
    fireEvent.click(screen.getByLabelText('Ejercicio anterior'))
    await waitFor(() => {
      expect(screen.getByLabelText('Ejercicio anterior')).toBeDisabled()
    })
    expect(shownExercise()).toBe('press')

    // 0 → 1 de nuevo (continuar aunque el anterior esté completo)
    fireEvent.click(screen.getByLabelText('Ejercicio siguiente'))
    await waitFor(() => {
      expect(shownExercise()).toBe('remo')
    })

    // Una sola sesión en todo el flujo (sin duplicados por navegar)
    expect(await db.trainingSessions.count()).toBe(1)
    // Edición con mismo registro y sin duplicados: cubierto en
    // trainingUx.test.tsx (tabla) y trainingFlow.test.ts (servicio).
  }, 30000)
})
