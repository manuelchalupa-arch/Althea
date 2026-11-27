import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

async function chooseCalendarDate(label: string, dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const targetMonth = new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  const trigger = await screen.findByRole('button', { name: label })
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: label })
  for (let i = 0; i < 24; i++) {
    const currentMonth = dialog.querySelector('h2')?.textContent?.trim().toLocaleLowerCase('es-AR')
    if (currentMonth === targetMonth.toLocaleLowerCase('es-AR')) { break }
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mes siguiente' }))
  }
  expect(dialog.querySelector('h2')?.textContent?.trim().toLocaleLowerCase('es-AR')).toBe(targetMonth.toLocaleLowerCase('es-AR'))
  const dayButton = Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.trim() === String(day) && !button.disabled)
  if (!dayButton) { throw new Error(`No se encontró el día ${day} en ${targetMonth}`) }
  fireEvent.click(dayButton)
}

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
    const next = addDaysToKey(todayKey(), 7)
    await chooseCalendarDate('Fecha de revisión', next)

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

    const defaultReview = addDaysToKey(todayKey(), 30)
    const dateTrigger = await screen.findByRole('button', { name: 'Fecha de revisión al crear' })
    expect(dateTrigger.textContent).toContain(defaultReview.split('-').reverse().join('/'))

    const custom = addDaysToKey(todayKey(), 10)
    await chooseCalendarDate('Fecha de revisión al crear', custom)
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
