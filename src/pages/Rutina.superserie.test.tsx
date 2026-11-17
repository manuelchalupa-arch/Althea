import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import { saveAllRoutines, getAllRoutines, type RoutineDayExercise } from '@/services/storage/routineStore'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

import Rutina from './Rutina'

type Seed = { name: string; supersetId?: string | null; supersetOrder?: number | null }

const mkEx = (s: Seed, i: number): RoutineDayExercise => ({
  id: `rx-${i}`, exId: `ex-${i}`, sets: 3, reps: 10, weight: 50,
  name: s.name, muscle: 'pectorales', restSec: 90,
  supersetId: s.supersetId ?? null, supersetOrder: s.supersetOrder ?? null,
})

async function seedRoutine(items: Seed[]) {
  const iso = new Date().toISOString()
  await saveAllRoutines([{
    id: 'r1', name: 'Rutina SS', createdAt: iso, updatedAt: iso,
    rotationDays: 30, cycle: DEFAULT_CYCLE,
    dayExercises: { 1: items.map(mkEx) },
  } as never], 'r1')
}

/** Orden de nombres de los ejercicios del día 1 tal como se ven en el DOM. */
const domOrder = () =>
  Array.from(document.querySelectorAll('[data-exrow][data-day="1"]'))
    .map((el) => (el.querySelector('.font-medium') as HTMLElement)?.textContent || '')

const rowOf = (name: string) =>
  Array.from(document.querySelectorAll('[data-exrow][data-day="1"]'))
    .find((el) => (el.querySelector('.font-medium') as HTMLElement)?.textContent === name) as HTMLElement

const dbOrder = async () => {
  const list = await getAllRoutines()
  return (list[0]?.dayExercises[1] || []).map((e) => e.name)
}

describe('Rutina — superseries y reordenamiento', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Los guardados asíncronos del test anterior (import + Dexie) pueden llegar
    // tarde y pisar la siembra: se drenan antes de limpiar.
    await new Promise((r) => setTimeout(r, 150))
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('subir/bajar mueve desde principio a final e intermedio, y el orden persiste tras re-render', async () => {
    await seedRoutine([{ name: 'Ej A' }, { name: 'Ej B' }, { name: 'Ej C' }, { name: 'Ej D' }])
    const { unmount } = render(<MemoryRouter><Rutina /></MemoryRouter>)
    await waitFor(() => expect(domOrder()[0]).toBe('Ej A'), { timeout: 10000 })

    // Intermedio: bajar A una vez → B,A,C,D.
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Ej A' }))
    await waitFor(() => expect(domOrder()).toEqual(['Ej B', 'Ej A', 'Ej C', 'Ej D']), { timeout: 10000 })

    // Vuelve al principio.
    fireEvent.click(screen.getByRole('button', { name: 'Subir Ej A' }))
    await waitFor(() => expect(domOrder()).toEqual(['Ej A', 'Ej B', 'Ej C', 'Ej D']), { timeout: 10000 })

    // Principio → final: dos bajes consecutivos sobre A (esperando cada
    // re-render, como en un uso real de taps separados).
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Ej A' }))
    await waitFor(() => expect(domOrder()).toEqual(['Ej B', 'Ej A', 'Ej C', 'Ej D']), { timeout: 10000 })
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Ej A' }))
    await waitFor(() => expect(domOrder()).toEqual(['Ej B', 'Ej C', 'Ej A', 'Ej D']), { timeout: 10000 })

    // Extremos: subir en el primero / bajar en el último no rompen nada.
    fireEvent.click(screen.getByRole('button', { name: 'Subir Ej B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Ej D' }))
    await waitFor(async () => expect(await dbOrder()).toEqual(['Ej B', 'Ej C', 'Ej A', 'Ej D']), { timeout: 10000 })

    // Persistencia: re-render nuevo lee el mismo orden desde Dexie.
    unmount()
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await waitFor(() => expect(domOrder()).toEqual(['Ej B', 'Ej C', 'Ej A', 'Ej D']), { timeout: 10000 })
  }, 60000)

  it('reordenar respeta el bloque de superserie como unidad', async () => {
    await seedRoutine([
      { name: 'Ej A', supersetId: 'ss1', supersetOrder: 0 },
      { name: 'Ej B', supersetId: 'ss1', supersetOrder: 1 },
      { name: 'Ej C' },
    ])
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await waitFor(() => expect(domOrder()[0]).toBe('Ej A'), { timeout: 10000 })

    // Bajar sobre el último miembro del bloque (B) mueve la unidad completa
    // por delante de C; bajar sobre A (interno) lo movería dentro del bloque.
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Ej B' }))
    await waitFor(() => expect(domOrder()).toEqual(['Ej C', 'Ej A', 'Ej B']), { timeout: 10000 })
    const after = await dbOrder()
    expect(after).toEqual(['Ej C', 'Ej A', 'Ej B'])
    const list = await getAllRoutines()
    const arr = list[0]?.dayExercises[1] || []
    expect(arr[1]?.supersetId).toBe('ss1')
    expect(arr[2]?.supersetId).toBe('ss1')
    // El orden interno del bloque no se rompió.
    expect(arr[1]?.supersetOrder).toBe(0)
    expect(arr[2]?.supersetOrder).toBe(1)

    // Subir A (primera unidad, desde el inicio del bloque) pasa por delante de C.
    fireEvent.click(screen.getByRole('button', { name: 'Subir Ej A' }))
    await waitFor(() => expect(domOrder()).toEqual(['Ej A', 'Ej B', 'Ej C']), { timeout: 10000 })
  }, 60000)

  it('crear un bloque SS de 2+ lo hace contiguo, con badge, y se disuelve al quitar un miembro', async () => {
    await seedRoutine([{ name: 'Ej A' }, { name: 'Ej B' }, { name: 'Ej C' }])
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await waitFor(() => expect(domOrder()[0]).toBe('Ej A'), { timeout: 10000 })

    // Selección en el borrador (A y C, no contiguos).
    fireEvent.click(screen.getByRole('button', { name: 'Superserie Ej A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Superserie Ej C' }))
    expect(await screen.findByText(/Superserie: 2 seleccionados/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Crear bloque' }))

    // A y C quedan contiguos en la posición del primero, con badges SS 1/2 y 2/2.
    await waitFor(() => expect(domOrder()).toEqual(['Ej A', 'Ej C', 'Ej B']), { timeout: 10000 })
    expect(screen.getByText('SS 1/2')).toBeInTheDocument()
    expect(screen.getByText('SS 2/2')).toBeInTheDocument()
    // El guardado a Dexie es asíncrono respecto al render.
    await waitFor(async () => {
      const l = await getAllRoutines()
      const a = l[0]?.dayExercises[1] || []
      expect(a[0]?.supersetId).toBeTruthy()
      expect(a[1]?.supersetId).toBe(a[0]?.supersetId)
      expect(a[2]?.supersetId).toBeFalsy()
    }, { timeout: 10000 })

    // Quitar un miembro disuelve el bloque (quedan menos de 2).
    fireEvent.click(screen.getByRole('button', { name: 'Superserie Ej A' }))
    await waitFor(async () => {
      const l = await getAllRoutines()
      expect((l[0]?.dayExercises[1] || []).every((e) => !e.supersetId)).toBe(true)
    }, { timeout: 10000 })
    expect(screen.queryByText(/^SS \d\/\d$/)).not.toBeInTheDocument()
  }, 60000)

  it('el arrastre táctil desde el grip reordena la fila bajo el puntero', async () => {
    await seedRoutine([{ name: 'Ej A' }, { name: 'Ej B' }, { name: 'Ej C' }])
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await waitFor(() => expect(domOrder()[0]).toBe('Ej A'), { timeout: 10000 })

    const grip = screen.getByRole('button', { name: 'Reordenar Ej A' })
    // jsdom no implementa elementFromPoint: el puntero "apunta" a la fila de C.
    const orig = document.elementFromPoint
    document.elementFromPoint = (() => rowOf('Ej C')) as typeof document.elementFromPoint
    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: 900 })
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 10, clientY: 900 })
    document.elementFromPoint = orig

    await waitFor(() => expect(domOrder()).toEqual(['Ej B', 'Ej C', 'Ej A']), { timeout: 10000 })
    expect(await dbOrder()).toEqual(['Ej B', 'Ej C', 'Ej A'])
  }, 60000)

  it('reordenar la rutina no altera una sesión ya iniciada', async () => {
    await seedRoutine([{ name: 'Ej A' }, { name: 'Ej B' }, { name: 'Ej C' }])
    const { createReadySession, transitionSession, getSessionExercises } = await import('@/services/training/sessionStore')
    const created = await createReadySession({
      calendarDate: todayKey(), routineId: 'r1', routineName: 'Rutina SS',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: [
        { exId: 'ex-0', name: 'Ej A', sets: 3, reps: 10, weight: 50 },
        { exId: 'ex-1', name: 'Ej B', sets: 3, reps: 10, weight: 50 },
        { exId: 'ex-2', name: 'Ej C', sets: 3, reps: 10, weight: 50 },
      ] as never,
    })
    await transitionSession(created.sessionId, 'IN_PROGRESS')

    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await waitFor(() => expect(domOrder()[0]).toBe('Ej A'), { timeout: 10000 })
    fireEvent.click(screen.getByRole('button', { name: 'Bajar Ej A' }))
    await waitFor(async () => expect(await dbOrder()).toEqual(['Ej B', 'Ej A', 'Ej C']), { timeout: 10000 })

    // La sesión en curso conserva su orden original.
    const sesEx = await getSessionExercises(created.sessionId)
    expect(sesEx.map((e) => e.exerciseId)).toEqual(['ex-0', 'ex-1', 'ex-2'])
    const s = await db.trainingSessions.get(created.sessionId)
    expect(s?.sessionStatus).toBe('IN_PROGRESS')
  }, 60000)
})
