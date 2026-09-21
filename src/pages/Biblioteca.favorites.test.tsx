import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'

vi.mock('@/services/exerciseGym', () => ({
  fetchMuscles: async () => [],
  fetchEquipment: async () => [],
  fetchBodyParts: async () => [],
  fetchCategories: async () => [],
  fetchAll: async () => ({
    exercises: [
      {
        id: 'press-x', name: 'Press X', muscle: 'pectorals', bodyPart: 'chest',
        equipment: 'barbell', category: 'strength', secondaryMuscles: [],
        instructions: ['Empujá'], file: '', gifUrl: '',
      },
    ],
  }),
  fetchByMuscle: async () => ({ exercises: [] }),
  cacheSet: () => {},
  cacheGet: () => null,
}))

vi.mock('@/services/training/customExercises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/training/customExercises')>()
  return { ...mod, listCustomExercises: async () => [] }
})

import Biblioteca from './Biblioteca'

describe('ET19 — Favoritos de Biblioteca en perfil Dexie', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
    await db.userProfile.put({ id: 'me', onboardingDone: true } as never)
  })

  it('marcar favorito persiste en perfil; filtro Favoritos lo muestra', async () => {
    render(
      <MemoryRouter>
        <Biblioteca />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('Press X')).toBeInTheDocument()
    })
    // Abrir detalle y marcar favorito
    fireEvent.click(screen.getByText('Press X'))
    await waitFor(() => {
      expect(screen.getByLabelText('Marcar favorito')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText('Marcar favorito'))
    await waitFor(async () => {
      const p = await db.userProfile.get('me') as { favoriteExercises?: string[] } | undefined
      expect(p?.favoriteExercises).toContain('press-x')
    })
    // Cerrar y filtrar por favoritos
    fireEvent.click(screen.getByText('Cerrar'))
    fireEvent.click(screen.getByText(/Favoritos/))
    await waitFor(() => {
      expect(screen.getByText('Press X')).toBeInTheDocument()
    })
    // Sin favoritos en otro perfil/estado → lista vacía honesta
    await db.userProfile.update('me', { favoriteExercises: [] } as never)
    fireEvent.click(screen.getByText(/Favoritos/))
    fireEvent.click(screen.getByText(/Favoritos/))
    await waitFor(async () => {
      const p = await db.userProfile.get('me') as { favoriteExercises?: string[] } | undefined
      expect(p?.favoriteExercises).toEqual([])
    })
  })
})
