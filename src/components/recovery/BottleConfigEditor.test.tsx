import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { getBottleConfigs } from '@/services/recovery/hydrationBottles'
import { BottleConfigEditor } from './BottleConfigEditor'

describe('BottleConfigEditor — 3 capacidades editables', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('ofrece 3 botellas con su capacidad en litros y guarda los cambios en ml', async () => {
    render(<BottleConfigEditor />)

    const toggle = await screen.findByTestId('bottle-config-toggle', undefined, { timeout: 10000 })

    // El editor carga las configs en un efecto: se espera la lectura y luego se
    // abre (con sleeps: hacer click dentro de waitFor entra en bucle de mutaciones)
    await waitFor(async () => {
      expect((await getBottleConfigs()).length).toBe(3)
    }, { timeout: 10000 })
    for (let i = 0; i < 10 && !screen.queryByLabelText('Capacidad en litros de la botella 1'); i++) {
      fireEvent.click(toggle)
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(screen.getByLabelText('Capacidad en litros de la botella 1')).toBeInTheDocument()

    const cap = (n: number) => screen.getByLabelText(`Capacidad en litros de la botella ${n}`) as HTMLInputElement
    const nombre = (n: number) => screen.getByLabelText(`Nombre de la botella ${n}`) as HTMLInputElement
    const activa = (n: number) => screen.getByLabelText(`Botella ${n} activa`) as HTMLInputElement

    // Tres capacidades visibles y editables
    expect(cap(1).value).toBe('0.75')
    expect(cap(2).value).toBe('1.00')
    expect(cap(3).value).toBe('1.50')
    expect(nombre(1).value).toBe('Botella 1')
    expect(activa(1).checked).toBe(true)
    expect(activa(3).checked).toBe(false)

    // Editar una capacidad no altera a las otras
    fireEvent.change(cap(2), { target: { value: '1.25' } })
    expect(cap(1).value).toBe('0.75')
    expect(cap(3).value).toBe('1.50')

    fireEvent.click(screen.getByTestId('bottle-config-save'))

    await waitFor(async () => {
      const cfgs = await getBottleConfigs()
      const b2 = cfgs.find((c) => c.id === 'bottle-2')
      expect(b2?.capacityMl).toBe(1250)
      expect(b2?.capacityLiters).toBe(1.25)
      expect(cfgs.find((c) => c.id === 'bottle-1')?.capacityMl).toBe(750)
      expect(cfgs.find((c) => c.id === 'bottle-3')?.capacityMl).toBe(1500)
    }, { timeout: 10000 })

    // Se cierra el editor tras guardar
    await waitFor(() => {
      expect(screen.queryByLabelText('Capacidad en litros de la botella 1')).not.toBeInTheDocument()
    }, { timeout: 10000 })
  }, 30000)
})
