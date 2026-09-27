import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Nutricion from './Nutricion'

describe('Nutrición — layout macros + hidratación', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('macros e hidratación comparten una fila de dos columnas (una sola en mobile)', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)

    const hidratacion = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 10000 })
    const fila = hidratacion.parentElement as HTMLElement

    // Un único contenedor para ambas columnas: apilada en mobile, 2 en desktop
    expect(fila.className).toContain('grid')
    expect(fila.className).toContain('grid-cols-1')
    expect(fila.className).toContain('lg:grid-cols-2')

    // Columna izquierda: macros/contexto — derecha: hidratación
    expect(within(fila).getByTestId('nutricion-context')).toBeInTheDocument()
    expect(hidratacion.querySelector('[data-testid="water-bottle"]')).not.toBeNull()
    expect(hidratacion.querySelector('[data-testid="nutricion-context"]')).toBeNull()
  }, 30000)

  it('F: MACRO RING en la columna izquierda y BOTELLA a la derecha (1 columna en mobile)', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)

    const hidratacion = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 10000 })
    const fila = hidratacion.parentElement as HTMLElement
    expect(fila.getAttribute('data-testid')).toBe('nutricion-top-grid')
    expect(fila.className).toContain('grid-cols-1')
    expect(fila.className).toContain('lg:grid-cols-2')

    const izquierda = fila.children[0] as HTMLElement
    const derecha = fila.children[1] as HTMLElement
    // Izquierda: el anillo de macros (nunca la botella). Derecha: la botella.
    expect(izquierda.querySelector('[data-testid="macro-ring"]')).not.toBeNull()
    expect(izquierda.querySelector('[data-testid="water-bottle"]')).toBeNull()
    expect(derecha).toBe(hidratacion)
    expect(derecha.querySelector('[data-testid="macro-ring"]')).toBeNull()
    expect(derecha.querySelector('[data-testid="water-bottle"]')).not.toBeNull()
  }, 30000)

  it('la botella de Nutrición es la grande (lg) y registra cada botella configurada', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)

    const svg = await screen.findByTestId('water-bottle-svg', undefined, { timeout: 10000 })
    expect(svg.getAttribute('class')).toContain('w-[208px]')
    expect(svg.getAttribute('class')).toContain('h-[332px]')

    // allowQuickAdd: una acción por botella activa (750 ml y 1000 ml por defecto)
    const b750 = await screen.findByLabelText('Registrar Botella 1 (750 ml)', undefined, { timeout: 10000 })
    expect(b750).toBeInTheDocument()
    expect(screen.getByLabelText('Registrar Botella 2 (1000 ml)')).toBeInTheDocument()
    // La tercera viene inactiva por defecto: no ofrece registrarla
    expect(screen.queryByLabelText('Registrar Botella 3 (1500 ml)')).not.toBeInTheDocument()
  }, 30000)

  it('registrar una botella desde Nutrición suma al total del día', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)
    const b750 = await screen.findByLabelText('Registrar Botella 1 (750 ml)', undefined, { timeout: 10000 })

    await waitFor(() => {
      expect(b750).not.toBeDisabled()
    }, { timeout: 10000 })
    b750.click()

    await waitFor(async () => {
      const summary = await (await import('@/services/recovery/hydrationBottles')).getBottleDailySummary()
      expect(summary.totalMl).toBe(750)
    }, { timeout: 10000 })

    const svg = screen.getByTestId('water-bottle-svg')
    await waitFor(() => {
      expect(svg.getAttribute('data-consumed-ml')).toBe('750')
    }, { timeout: 10000 })
    await waitFor(() => {
      expect(screen.getByTestId('water-bottle-add-bottle-1').textContent).toContain('(1)')
    }, { timeout: 10000 })
  }, 30000)
})
