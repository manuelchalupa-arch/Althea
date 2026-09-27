import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey, addDaysToKey } from '@/utils/dates'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import { saveAllRoutines } from '@/services/storage/routineStore'
import { createReadySession, transitionSession } from '@/services/training/sessionStore'
import Inicio from './Inicio'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

async function seedRoutine(daysOld: number, rotationDays: number) {
  const iso = daysAgoISO(daysOld)
  await saveAllRoutines([{
    id: 'r-revision',
    name: 'Rutina fuerza',
    createdAt: iso,
    updatedAt: iso,
    rotationDays,
    cycle: DEFAULT_CYCLE,
    dayExercises: {},
  } as never], 'r-revision')
}

async function seedRoutineWithReview(daysOld: number, rotationDays: number, reviewDate: string) {
  const iso = daysAgoISO(daysOld)
  await saveAllRoutines([{
    id: 'r-revision',
    name: 'Rutina fuerza',
    createdAt: iso,
    updatedAt: iso,
    rotationDays,
    reviewDate,
    cycle: DEFAULT_CYCLE,
    dayExercises: {},
  } as never], 'r-revision')
}

describe('Inicio — fecha de revisión configurable (E)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    try { await db.delete() } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  it('la fecha manual manda: recién creada pero reviewDate vencida ayer → aviso con esa fecha', async () => {
    const yesterday = addDaysToKey(todayKey(), -1)
    await seedRoutineWithReview(5, 30, yesterday)
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => { expect(screen.getByText(/¡Hola!/)).toBeInTheDocument() }, { timeout: 8000 })
    const banner = await screen.findByTestId('routine-review-warning', undefined, { timeout: 8000 })
    expect(banner.textContent).toContain(`venció el ${yesterday}`)
    expect(screen.getByRole('link', { name: /Revisar la rutina/i })).toBeInTheDocument()
  })

  it('la fecha manual manda: rutina vieja pero reviewDate futura → sin aviso', async () => {
    const tomorrow = addDaysToKey(todayKey(), 1)
    await seedRoutineWithReview(40, 30, tomorrow)
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => { expect(screen.getByText(/¡Hola!/)).toBeInTheDocument() }, { timeout: 8000 })
    await waitFor(() => {
      expect(screen.queryByTestId('routine-review-warning')).not.toBeInTheDocument()
    }, { timeout: 8000 })
  })
})

describe('Inicio — revisión de la rutina (aviso NO bloqueante)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    try { await db.delete() } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  it('antes de vencer la fecha de revisión: estado normal, sin advertencia', async () => {
    await seedRoutine(10, 30)
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })
    await waitFor(() => {
      expect(screen.queryByTestId('routine-review-warning')).not.toBeInTheDocument()
    }, { timeout: 8000 })
  })

  it('al llegar o superar la fecha: advertencia roja visible que pide revisión/modificación', async () => {
    await seedRoutine(40, 30)
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByText(/¡Hola!/)).toBeInTheDocument()
    }, { timeout: 8000 })

    const banner = await screen.findByTestId('routine-review-warning', undefined, { timeout: 8000 })
    expect(banner).toBeInTheDocument()
    expect(banner.getAttribute('role')).toBe('alert')
    expect(banner.textContent).toMatch(/40 días/)
    expect(banner.textContent).toMatch(/límite 30/)
    expect(banner.textContent).toMatch(/requiere revisión o modificación/)
    // Rojo: utilidad de error de la design system (borde + texto + fondo)
    expect(banner.className).toContain('border-error')
    expect(banner.className).toContain('bg-error')
    expect(banner.querySelector('.text-error')).not.toBeNull()
    // Acción para modificar la rutina
    expect(screen.getByRole('link', { name: /Revisar la rutina/i })).toBeInTheDocument()
  })

  it('la advertencia NO bloquea: con sesión activa sigue apareciendo Entrenar/Continuar', async () => {
    await seedRoutine(40, 30)
    // Hoy es día de entrenamiento en el ciclo (así Inicio ofrece Continuar)
    await db.userProfile.put({
      id: 'me',
      cycle: { ...DEFAULT_CYCLE, startDate: todayKey(), weekMap: [1, 1, 1, 1, 1, 1, 1] },
    } as never)
    const { sessionId } = await createReadySession({
      calendarDate: todayKey(), routineId: 'r-revision', routineName: 'Rutina fuerza',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: [{ exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }],
    })
    await transitionSession(sessionId, 'IN_PROGRESS')

    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByTestId('routine-review-warning')).toBeInTheDocument()
    }, { timeout: 8000 })
    // Sin modal/puerta que bloquee la pantalla
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // El acceso a entrenar sigue visible y operativo
    expect(await screen.findByText('Continuar', undefined, { timeout: 8000 })).toBeInTheDocument()
    expect(screen.getByText('Cambiar día')).toBeInTheDocument()
  }, 30000)
})
