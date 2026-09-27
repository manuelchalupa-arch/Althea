import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { DEFAULT_CYCLE } from '@/utils/cycle'
import { saveAllRoutines } from '@/services/storage/routineStore'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

import Entrenar from './Entrenar'
import Inicio from './Inicio'

const LocationSpy = () => {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}</div>
}

async function seedTrainingDay() {
  const iso = new Date().toISOString()
  const cycle = { ...DEFAULT_CYCLE, startDate: todayKey(), weekMap: [1, 1, 1, 1, 1, 1, 1] }
  await db.userProfile.put({ id: 'me', cycle } as never)
  await saveAllRoutines([{
    id: 'r1', name: 'Rutina', createdAt: iso, updatedAt: iso, rotationDays: 30,
    cycle,
    dayExercises: { 1: [{ id: 'e1', exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }] },
  } as never], 'r1')
}

describe('D — /entrenar solo muestra sesión activa (fuente de verdad)', () => {
  const mounted: Array<() => void> = []
  const renderIn = (entry: string, withEntrenar = true) => {
    const view = render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/entrenar" element={withEntrenar ? <Entrenar /> : null} />
          <Route path="/inicio" element={<div data-testid="inicio-screen">Inicio</div>} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>,
    )
    mounted.push(view.unmount)
    return view
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  afterEach(() => { while (mounted.length) mounted.pop()!() })

  it('sin sesión activa: /entrenar redirige a /inicio y NO crea sesiones', async () => {
    await seedTrainingDay()
    renderIn('/entrenar')
    await waitFor(() => {
      expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    }, { timeout: 15000 })
    expect(screen.getByTestId('loc').textContent).toBe('/inicio')
    expect(await db.trainingSessions.count()).toBe(0)
  }, 30000)

  it('la CTA de Inicio crea la sesión (READY) y navega a /entrenar', async () => {
    await seedTrainingDay()
    const view = render(
      <MemoryRouter initialEntries={['/inicio']}>
        <Routes>
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/entrenar" element={<div data-testid="entrenar-screen">Entrenar</div>} />
        </Routes>
        <LocationSpy />
      </MemoryRouter>,
    )
    mounted.push(view.unmount)

    const cta = await screen.findByTestId('inicio-start-training', undefined, { timeout: 15000 })
    expect(cta.textContent).toMatch(/COMENZAR ENTRENAMIENTO/)
    cta.click()

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/entrenar')
    }, { timeout: 15000 })
    expect(await db.trainingSessions.count()).toBe(1)
    const s = await db.trainingSessions.toArray()
    expect((s[0] as { sessionStatus: string }).sessionStatus).toBe('READY')
  }, 40000)
})
