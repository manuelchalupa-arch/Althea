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

    expect(fila.className).toContain('grid')
    expect(fila.className).toContain('grid-cols-1')
    expect(fila.className).toContain('lg:grid-cols-2')

    expect(within(fila).getByTestId('nutricion-context')).toBeInTheDocument()
    expect(hidratacion.querySelector('.althea-bottle')).not.toBeNull()
    expect(hidratacion.querySelector('[data-testid="nutricion-context"]')).toBeNull()
  }, 30000)

  it('F: MACRO PLATE en la columna izquierda y BOTELLA a la derecha (1 columna en mobile)', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)

    const hidratacion = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 10000 })
    const fila = hidratacion.parentElement as HTMLElement
    expect(fila.getAttribute('data-testid')).toBe('nutricion-top-grid')
    expect(fila.className).toContain('grid-cols-1')
    expect(fila.className).toContain('lg:grid-cols-2')

    const izquierda = fila.children[0] as HTMLElement
    const derecha = fila.children[1] as HTMLElement
    expect(izquierda.querySelector('.althea-plate')).not.toBeNull()
    expect(izquierda.querySelector('.althea-bottle')).toBeNull()
    expect(derecha).toBe(hidratacion)
    expect(derecha.querySelector('.althea-plate')).toBeNull()
    expect(derecha.querySelector('.althea-bottle')).not.toBeNull()
  }, 30000)

  it('la botella de Nutrición es la grande (lg) y registra cada botella configurada', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)

    const svg = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 10000 })
    expect(svg.querySelector('.althea-bottle__svg')).not.toBeNull()

    const b750 = await screen.findByRole('button', { name: /Botella 1/ }, { timeout: 10000 })
    expect(b750).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Botella 2/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Botella 3/ })).not.toBeInTheDocument()
  }, 30000)

  it('registrar una botella desde Nutrición suma al total del día', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)
    const b750 = await screen.findByRole('button', { name: /Botella 1.*750/ }, { timeout: 10000 })

    await waitFor(() => {
      expect(b750).not.toBeDisabled()
    }, { timeout: 10000 })
    b750.click()

    await waitFor(async () => {
      const summary = await (await import('@/services/recovery/hydrationBottles')).getBottleDailySummary()
      expect(summary.totalMl).toBe(750)
    }, { timeout: 10000 })

    const bottle = document.querySelector('.althea-bottle')
    await waitFor(() => {
      expect(bottle?.querySelector('.althea-bottle__label')?.textContent).toContain('750')
    }, { timeout: 10000 })
  }, 30000)
})
