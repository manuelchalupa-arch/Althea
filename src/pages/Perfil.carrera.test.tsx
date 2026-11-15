import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Perfil from './Perfil'

/**
 * R2 (FASE FINAL) — carrera de saveProfile: mientras el perfil no terminó de
 * cargar no se puede guardar (antes un put con base = profile ?? default
 * pisaba un perfil existente con valores predeterminados). Se distingue:
 *   - cargando    → botón inerte ("Cargando…"), guardado bloqueado
 *   - cargado     → editar/guardar normal, conserva campos no editados
 *   - inexistente → guardar crea un perfil nuevo (legítimo)
 */

const renderPerfil = () => render(<MemoryRouter><Perfil /></MemoryRouter>)

async function openDatos() {
  fireEvent.click(await screen.findByRole('button', { name: /Datos personales/ }))
}

// Congela la lectura del perfil para hacer determinista la ventana de carga.
function gateProfileLoad() {
  const original = db.userProfile.get.bind(db.userProfile)
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const spy = vi.spyOn(db.userProfile, 'get').mockImplementation(((...args: unknown[]) =>
    gate.then(() => (original as (...a: unknown[]) => unknown)(...args))) as never)
  return {
    release: () => release(),
    restore: () => spy.mockRestore(),
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

afterEach(() => { vi.restoreAllMocks() })

describe('R2 — carga del perfil', () => {
  it('con perfil existente el botón habilita recién cuando termina de cargar', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', weightKg: 80, onboardingDone: true,
    } as never)
    const g = gateProfileLoad()
    renderPerfil()
    await openDatos()

    // Cargando: inerte y sin prometer edición.
    const loading = screen.getByRole('button', { name: 'Cargando…' })
    expect(loading).toBeDisabled()

    g.release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar datos' })).not.toBeDisabled())
  })

  it('sin perfil existente también termina de cargar (no queda en "Cargando…" para siempre)', async () => {
    renderPerfil()
    await openDatos()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar datos' })).not.toBeDisabled())
  })
})

describe('R2 — guardado con perfil cargado', () => {
  it('guardar conserva identificador, fechas y campos no editados', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', weightKg: 80, heightCm: 175,
      bodyFatPct: 18.5, onboardingDone: true, createdAt: '2026-01-01T00:00:00.000Z',
      nutritionPrefs: { restrictions: ['celiaco'], allergies: [], dislikedFoods: [] },
    } as never)
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Nico')).toBeInTheDocument())

    await openDatos()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar datos' }))
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Nicolas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(async () => {
      const p = await db.userProfile.get('me')
      expect(p?.displayName).toBe('Nicolas')
      // Nada de esto puede perderse en el guardado.
      expect(p?.id).toBe('me')
      expect(p?.createdAt).toBe('2026-01-01T00:00:00.000Z')
      expect(p?.onboardingDone).toBe(true)
      expect(p?.weightKg).toBe(80)
      expect(p?.bodyFatPct).toBe(18.5)
      expect(p?.nutritionPrefs?.restrictions).toEqual(['celiaco'])
    })
  })
})

describe('R2 — concurrencia (carga lenta ≠ perfil inexistente)', () => {
  it('con la carga pendiente no se puede entrar a editar ni guardar nada', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Original', weightKg: 77, onboardingDone: true,
    } as never)
    const g = gateProfileLoad()
    renderPerfil()
    await openDatos()

    const loading = screen.getByRole('button', { name: 'Cargando…' })
    expect(loading).toBeDisabled()
    // Click inerte: React ignora el click de un botón deshabilitado.
    fireEvent.click(loading)
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()

    g.release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar datos' })).not.toBeDisabled())

    // Recién ahora el guardado actúa sobre el perfil YA cargado.
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos' }))
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Después de cargar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(async () => {
      const p = await db.userProfile.get('me')
      expect(p?.displayName).toBe('Después de cargar')
      expect(p?.weightKg).toBe(77) // jamás reemplazado por defaults
      expect(p?.onboardingDone).toBe(true)
    })
  })

  it('la ventana de carga no crea un perfil fantasma con valores por defecto', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Original', onboardingDone: true,
    } as never)
    const g = gateProfileLoad()
    renderPerfil()
    await openDatos()
    expect(screen.getByRole('button', { name: 'Cargando…' })).toBeDisabled()
    g.release()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar datos' })).not.toBeDisabled())
    const rows = await db.userProfile.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].displayName).toBe('Original')
  })
})

describe('R2 — perfil inexistente (creación legítima)', () => {
  it('tras cargar sin perfil, guardar crea uno nuevo con onboardingDone', async () => {
    renderPerfil()
    await openDatos()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar datos' })).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: 'Editar datos' }))
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(async () => {
      const p = await db.userProfile.get('me')
      expect(p?.displayName).toBe('Nuevo')
      expect(p?.onboardingDone).toBe(true)
    })
  })
})
