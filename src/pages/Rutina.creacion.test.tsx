import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { getAllRoutines } from '@/services/storage/routineStore'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({ exercises: [] }),
  fetchByMuscle: async () => ({ exercises: [] }),
  fetchOne: async () => null,
  cacheSet: () => {},
  cacheGet: () => null,
}))

import Rutina from './Rutina'

/** Crea una rutina desde el estado vacío con la modalidad elegida. */
async function createRoutine(mode: 'asistida' | 'simplificada', name: string) {
  fireEvent.click(await screen.findByText(/Nueva rutina/, undefined, { timeout: 10000 }))
  fireEvent.click(await screen.findByRole('button', { name: mode === 'simplificada' ? 'Rutina simplificada' : 'Rutina asistida' }))
  fireEvent.change(screen.getByPlaceholderText(/Rutina de verano/), { target: { value: name } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear rutina' }))
}

const fillAndAdd = async (exName: string, muscle: string) => {
  fireEvent.change(await screen.findByLabelText(/Nombre del ejercicio/, undefined, { timeout: 10000 }), { target: { value: exName } })
  fireEvent.change(screen.getByLabelText('Músculo principal'), { target: { value: muscle } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
  // El alta persiste la rutina (versionado) antes de re-habilitar el botón.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar ejercicio' })).not.toBeDisabled(), { timeout: 15000 })
}

describe('Rutina — modalidades asistida / simplificada', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('crear en modo simplificada abre el formulario y valida nombre y músculo obligatorios', async () => {
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await createRoutine('simplificada', 'Rutina simple')

    // El formulario simplificado queda abierto en el primer día.
    const dialog = await screen.findByLabelText('Rutina simplificada', undefined, { timeout: 10000 })
    expect(dialog).toBeInTheDocument()

    // Sin nombre no agrega.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
    expect(await screen.findByText('Ingresá un nombre')).toBeInTheDocument()
    expect(await db.customExercises.count()).toBe(0)

    // Nombre sin músculo: el músculo principal es obligatorio.
    fireEvent.change(screen.getByLabelText(/Nombre del ejercicio/), { target: { value: 'Press plano con mancuernas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
    expect(await screen.findByText('Elegí el músculo principal')).toBeInTheDocument()
    expect(await db.customExercises.count()).toBe(0)

    // Completa el músculo → agrega al día 1 y crea el custom.
    fireEvent.change(screen.getByLabelText('Músculo principal'), { target: { value: 'pectorales' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
    await waitFor(async () => {
      const list = await getAllRoutines()
      expect(list[0]?.dayExercises[1]?.[0]?.name).toBe('Press plano con mancuernas')
      expect(list[0]?.dayExercises[1]?.[0]?.muscle).toBe('pectorales')
    }, { timeout: 10000 })
    expect(await db.customExercises.count()).toBe(1)
    // Permanece abierto para agregar varios sin recargar.
    expect(screen.getByLabelText(/Nombre del ejercicio/)).toBeInTheDocument()
  }, 40000)

  it('reutiliza el custom existente por nombre sin duplicarlo', async () => {
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await createRoutine('simplificada', 'Rutina reuso')
    await fillAndAdd('Ejercicio Zeta 77 personal', 'dorsales')
    await waitFor(async () => expect(await db.customExercises.count()).toBe(1), { timeout: 10000 })

    // Mismo nombre otra vez: no crea un segundo custom.
    await fillAndAdd('Ejercicio Zeta 77 personal', 'dorsales')
    await waitFor(async () => {
      const list = await getAllRoutines()
      expect(list[0]?.dayExercises[1]).toHaveLength(2)
      expect(await db.customExercises.count()).toBe(1)
    }, { timeout: 10000 })
  }, 40000)

  it('el selector inteligente muestra el badge "Rutina asistida" (flujo Biblioteca)', async () => {
    render(<MemoryRouter><Rutina /></MemoryRouter>)
    await createRoutine('asistida', 'Rutina asistida test')
    // Botón "Ejercicio" del día N°1 (Pecho + tríceps) → IntelligentPicker.
    const ejBtns = await screen.findAllByRole('button', { name: /Ejercicio$/ })
    fireEvent.click(ejBtns[0])
    const badge = await screen.findByText('Rutina asistida', undefined, { timeout: 10000 })
    expect(badge).toBeInTheDocument()
    // El picker sigue siendo el de la Biblioteca (agregar ejercicio).
    expect(screen.getByText('Agregar ejercicio')).toBeInTheDocument()
  }, 40000)
})
