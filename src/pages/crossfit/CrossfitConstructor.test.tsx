import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'

import CrossfitConstructor from './CrossfitConstructor'

/**
 * Smoke test del constructor de WOD: validación de frontera, alta real en
 * cfWods y clasificación G/M/W automática desde el catálogo.
 */
describe('CrossfitConstructor', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('rechaza guardar sin nombre y sin movimientos', async () => {
    render(<CrossfitConstructor />)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar WOD' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Poné un nombre para el WOD.')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'WOD de prueba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar WOD' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Agregá al menos un movimiento.')

    expect(await db.cfWods.count()).toBe(0)
  })

  it('agrega movimientos, clasifica G/M/W automáticamente y guarda el WOD', async () => {
    render(<CrossfitConstructor />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cruce de prueba' } })

    // Pull-Up (G) desde el catálogo.
    fireEvent.change(screen.getByLabelText('Agregar desde el catálogo'), { target: { value: 'cf-pull-up' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(screen.getByText('Pull-Up')).toBeInTheDocument()
    expect(screen.getByText(/Detectado: G \(/)).toBeInTheDocument()

    // Thruster (W): la clasificación se amplía sola.
    fireEvent.change(screen.getByLabelText('Agregar desde el catálogo'), { target: { value: 'cf-thruster' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(screen.getByText(/Detectado: G \(Gimnasia\) \+ W \(Weightlifting\)/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar WOD' }))
    await waitFor(async () => expect(await db.cfWods.count()).toBe(1))

    const wod = (await db.cfWods.toArray())[0]
    expect(wod.name).toBe('Cruce de prueba')
    expect(wod.format).toBe('AMRAP')
    expect(wod.modalities).toEqual(['G', 'W'])
    expect(wod.modalitiesManual).toBeFalsy()
    expect(wod.movements).toHaveLength(2)
    expect(wod.movements[0].name).toBe('Pull-Up')
  })

  it('el override manual de modalidades se marca como manual', async () => {
    render(<CrossfitConstructor />)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Override' } })
    fireEvent.change(screen.getByLabelText('Agregar desde el catálogo'), { target: { value: 'cf-pull-up' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    // Quita G en modo manual: queda sin modalidad → no debería guardar.
    fireEvent.click(screen.getByRole('button', { name: /G · Gimnasia/ }))
    expect(screen.getByText('manual')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar WOD' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Elegí al menos una modalidad')

    // Vuelve a automática y guarda bien.
    fireEvent.click(screen.getByRole('button', { name: 'Volver a automática' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar WOD' }))
    await waitFor(async () => expect(await db.cfWods.count()).toBe(1))
    const wod = (await db.cfWods.toArray())[0]
    expect(wod.modalities).toEqual(['G'])
    expect(wod.modalitiesManual).toBeFalsy()
  })
})