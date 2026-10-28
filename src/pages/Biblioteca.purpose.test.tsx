import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({
    exercises: [
      { id: 'pectorals/barbell-bench-press', name: 'Press de banca con barra', muscle: 'pectorals', bodyPart: 'chest', equipment: 'barbell', category: 'strength', secondaryMuscles: [], instructions: [], file: '', gifUrl: '' },
      { id: 'biceps/band-curl', name: 'Curl con banda', muscle: 'biceps', bodyPart: 'arms', equipment: 'band', category: 'strength', secondaryMuscles: [], instructions: [], file: '', gifUrl: '' },
      { id: 'calves/stretch-calf-wall', name: 'Estiramiento, con manos en la pared, gemelo', muscle: 'calves', bodyPart: 'legs', equipment: 'bodyweight', category: 'stretching', secondaryMuscles: [], instructions: [], file: '', gifUrl: '' },
      { id: 'cardio/jack-jump-male', name: 'Salto, jack', muscle: 'cardio', bodyPart: 'cardio', equipment: 'bodyweight', category: 'cardio', secondaryMuscles: [], instructions: [], file: '', gifUrl: '' },
    ],
  }),
  cacheSet: () => {},
  cacheGet: () => null,
}))

vi.mock('@/services/training/customExercises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/training/customExercises')>()
  return { ...mod, listCustomExercises: async () => [] }
})

import Biblioteca from './Biblioteca'

const groupButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const purposeButton = (name: string) => screen.getByRole('button', { name })

describe('Biblioteca — separación por finalidad', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
    await db.userProfile.put({ id: 'me', onboardingDone: true } as never)
  })

  it('cada finalidad muestra solo sus ejercicios y no mezcla categorías', async () => {
    render(<MemoryRouter><Biblioteca /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Press de banca con barra')).toBeInTheDocument())

    // Estiramientos: aparecen los de su categoría, no los convencionales.
    fireEvent.click(purposeButton('Estiramientos'))
    await waitFor(() => expect(screen.getByText('Estiramiento de cuádriceps con banda')).toBeInTheDocument())
    expect(screen.getByText('Estiramiento, con manos en la pared, gemelo')).toBeInTheDocument()
    expect(screen.queryByText('Press de banca con barra')).not.toBeInTheDocument()
    expect(screen.queryByText('Curl con banda')).not.toBeInTheDocument()

    // Calentamiento: independiente, solo los de activación.
    fireEvent.click(purposeButton('Calentamiento'))
    await waitFor(() => expect(screen.getByText('Salto, jack')).toBeInTheDocument())
    expect(screen.queryByText('Estiramiento de cuádriceps con banda')).not.toBeInTheDocument()
    expect(screen.queryByText('Press de banca con barra')).not.toBeInTheDocument()

    // Movilidad: solo los de rango articular.
    fireEvent.click(purposeButton('Movilidad'))
    await waitFor(() => expect(screen.getByText('Estiramiento gato-vaca')).toBeInTheDocument())
    expect(screen.queryByText('Estiramiento de cuádriceps con banda')).not.toBeInTheDocument()
    expect(screen.queryByText('Salto, jack')).not.toBeInTheDocument()
  })

  it('los grupos musculares siguen todos visibles con cualquier finalidad', async () => {
    render(<MemoryRouter><Biblioteca /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Press de banca con barra')).toBeInTheDocument())

    fireEvent.click(purposeButton('Estiramientos'))
    for (const g of ['Piernas', 'Pecho', 'Espalda', 'Core', 'Hombros y brazos']) {
      expect(groupButton(g)).toBeInTheDocument()
    }
  })

  it('un grupo convencional no arrastra estiramientos', async () => {
    render(<MemoryRouter><Biblioteca /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Press de banca con barra')).toBeInTheDocument())

    fireEvent.click(groupButton('Piernas'))
    await waitFor(() => expect(screen.getByText('Prensa de piernas 45°')).toBeInTheDocument())
    expect(screen.queryByText('Estiramiento de cuádriceps con banda')).not.toBeInTheDocument()
  })
})
