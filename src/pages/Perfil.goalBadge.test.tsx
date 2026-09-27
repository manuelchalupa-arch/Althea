import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Perfil from './Perfil'

// FASE 2 - S8 - plan U2 (default de objetivo en Perfil). El codigo era:
//   const goal = GOAL_MAP[profile?.trainingGoal] || GOAL_MAP.hypertrophy
// `profile` arranca en null y se carga de forma asincrona desde Dexie, asi que
// en el primer render (y para siempre, si no hay perfil) la pagina anunciaba
// "Hipertrofia" como si fuera el objetivo del usuario. Era informacion falsa:
// el usuario nunca la eligio. Ahora el badge solo se pinta con un objetivo real.

const renderPerfil = () => render(<MemoryRouter><Perfil /></MemoryRouter>)

describe('S8 - Perfil: el badge de objetivo no inventa un objetivo', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('sin perfil guardado no muestra ningun objetivo (no inventa Hipertrofia)', async () => {
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Atleta')).toBeInTheDocument())
    expect(screen.queryByText('Hipertrofia')).not.toBeInTheDocument()
    expect(screen.queryByText('Fuerza')).not.toBeInTheDocument()
  })

  it('con objetivo guardado muestra ese objetivo y no otro', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Nico', trainingGoal: 'strength' } as never)
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Fuerza')).toBeInTheDocument())
    expect(screen.queryByText('Hipertrofia')).not.toBeInTheDocument()
    expect(screen.getByText('Nico')).toBeInTheDocument()
  })

  it('un objetivo guardado como hipertrofia si se muestra (no se elimino el caso real)', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Nico', trainingGoal: 'hypertrophy' } as never)
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Hipertrofia')).toBeInTheDocument())
  })

  it('un trainingGoal desconocido no cae a Hipertrofia (no muestra ningun badge)', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Nico', trainingGoal: 'no_existe' } as never)
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Nico')).toBeInTheDocument())
    expect(screen.queryByText('Hipertrofia')).not.toBeInTheDocument()
  })

  it('un trainingGoal ausente en el perfil guardado tampoco inventa Hipertrofia', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Nico' } as never)
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Nico')).toBeInTheDocument())
    expect(screen.queryByText('Hipertrofia')).not.toBeInTheDocument()
  })
})
