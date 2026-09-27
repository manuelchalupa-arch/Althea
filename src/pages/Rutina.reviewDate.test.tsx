import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey, addDaysToKey } from '@/utils/dates'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import { saveAllRoutines, getAllRoutines } from '@/services/storage/routineStore'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

import Rutina from './Rutina'

describe('Rutina — fecha de revisión configurable (E)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('la fecha de revisión de la rutina activa es editable y persiste en Dexie', async () => {
    const iso = new Date().toISOString()
    await saveAllRoutines([{
      id: 'r1', name: 'Rutina fuerza', createdAt: iso, updatedAt: iso,
      rotationDays: 30, cycle: DEFAULT_CYCLE, dayExercises: {},
    } as never], 'r1')

    render(<MemoryRouter><Rutina /></MemoryRouter>)
    const input = await screen.findByLabelText('Fecha de revisión', undefined, { timeout: 10000 }) as HTMLInputElement
    expect(input.type).toBe('date')

    const next = addDaysToKey(todayKey(), 7)
    fireEvent.change(input, { target: { value: next } })

    await waitFor(async () => {
      const list = await getAllRoutines()
      expect(list.find((r) => r.id === 'r1')?.reviewDate).toBe(next)
    }, { timeout: 10000 })
    // El texto informativo refleja la fecha configurada
    expect(screen.getByTestId('routine-review-info').textContent).toContain(next)
  }, 30000)

  it('al crear una rutina se le asigna una fecha de revisión por defecto, editable en el diálogo', async () => {
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    const nueva = await screen.findByText(/Nueva rutina/, undefined, { timeout: 10000 })
    fireEvent.click(nueva)

    const dateInput = await screen.findByLabelText('Fecha de revisión al crear', undefined, { timeout: 5000 }) as HTMLInputElement
    expect(dateInput.value).toBe(addDaysToKey(todayKey(), 30))

    const custom = addDaysToKey(todayKey(), 10)
    fireEvent.change(dateInput, { target: { value: custom } })
    const nameInput = screen.getByPlaceholderText(/Rutina de verano|Nombre/)
    fireEvent.change(nameInput, { target: { value: 'Rutina con revisión' } })
    fireEvent.click(screen.getByText('Crear rutina'))

    await waitFor(async () => {
      const list = await getAllRoutines()
      expect(list.length).toBe(1)
      expect(list[0]?.name).toBe('Rutina con revisión')
      expect(list[0]?.reviewDate).toBe(custom)
    }, { timeout: 10000 })
  }, 30000)
})
