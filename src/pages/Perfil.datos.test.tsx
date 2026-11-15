import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Perfil from './Perfil'

/**
 * Integridad de datos (auditoría §3.E): ocultar «Grasa %» y «Músculo kg» de
 * la interfaz NO puede borrar ni impedir conservar los valores persistidos,
 * y guardar sin datos antropométricos no debe crear filas vacías en
 * bodyMeasurements (contaminación del histórico de Progreso).
 */
const renderPerfil = () => render(<MemoryRouter><Perfil /></MemoryRouter>)

async function openDatos() {
  fireEvent.click(await screen.findByRole('button', { name: /Datos personales/ }))
  await screen.findByText('Editar datos')
}

describe('Perfil — campos ocultos preservan datos (sin pérdida)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('Grasa % y Músculo kg no se muestran, pero al guardar siguen intactos', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Nico', weightKg: 80, heightCm: 175,
      bodyFatPct: 18.5, muscleMassKg: 34, onboardingDone: true,
    } as never)
    renderPerfil()
    // Esperar la carga del perfil para editar sobre la copia completa.
    await waitFor(() => expect(screen.getByText('Nico')).toBeInTheDocument())

    await openDatos()
    // Vista: los campos redundantes no aparecen.
    expect(screen.queryByText('Grasa')).not.toBeInTheDocument()
    expect(screen.queryByText('Músculo')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Editar datos'))
    expect(screen.queryByLabelText(/Grasa/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Músculo/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(async () => {
      const p = await db.userProfile.get('me')
      expect(p?.bodyFatPct).toBe(18.5)
      expect(p?.muscleMassKg).toBe(34)
      expect(p?.weightKg).toBe(80)
    })
    // Además la medición del día quedó registrada con los valores reales.
    const rows = await db.bodyMeasurements.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].bodyFatPct).toBe(18.5)
    expect(rows[0].muscleMassKg).toBe(34)
  })

  it('guardar sin datos antropométricos no inserta filas vacías en bodyMeasurements', async () => {
    await db.userProfile.put({ id: 'me', displayName: 'Nico', onboardingDone: true } as never)
    renderPerfil()
    await waitFor(() => expect(screen.getByText('Nico')).toBeInTheDocument())

    await openDatos()
    fireEvent.click(screen.getByText('Editar datos'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(async () => {
      const p = await db.userProfile.get('me')
      expect(p?.displayName).toBe('Nico')
    })
    expect(await db.bodyMeasurements.toArray()).toHaveLength(0)
  })
})
