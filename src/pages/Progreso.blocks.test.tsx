import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import Progreso from './Progreso'

describe('Progreso — bloques del resumen del período', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    await db.bodyMeasurements.put({
      id: 'bm-test', localDate: todayKey(), weightKg: 80,
      createdAt: new Date().toISOString(),
    } as never)
  })

  it('muestra los 7 bloques, en orden, y ninguna acción ajena', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    // 1 · mapa muscular
    const mapa = await screen.findByRole('heading', { name: 'Mapa muscular' }, { timeout: 15000 })
    expect(mapa).toBeInTheDocument()

    // 2 · días entrenados — 3 · peso actual — 5 · volumen comparable (KPIs)
    expect(await screen.findByText('Días entrenados', undefined, { timeout: 15000 })).toBeInTheDocument()
    expect(await screen.findByText('Peso actual', undefined, { timeout: 15000 })).toBeInTheDocument()
    expect(await screen.findByText('Volumen comparable', undefined, { timeout: 15000 })).toBeInTheDocument()

    // 4 · recuperación — 6 · nutrición — 7 · informe
    expect(await screen.findByRole('heading', { name: 'Recuperación' }, { timeout: 15000 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Resumen nutricional' }, { timeout: 15000 })).toBeInTheDocument()
    const informe = await screen.findByRole('heading', { name: 'Informe del período' }, { timeout: 15000 })
    expect(informe).toBeInTheDocument()

    // Orden visual de los 7 bloques y aparición única de cada uno
    const bloques = [
      mapa,
      screen.getAllByText('Días entrenados')[0],
      screen.getAllByText('Peso actual')[0],
      screen.getAllByText('Volumen comparable')[0],
      screen.getAllByRole('heading', { name: 'Recuperación' })[0],
      screen.getAllByRole('heading', { name: 'Resumen nutricional' })[0],
      screen.getAllByRole('heading', { name: 'Informe del período' })[0],
    ]
    expect(screen.getAllByRole('heading', { name: 'Recuperación' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { name: 'Resumen nutricional' })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { name: 'Informe del período' })).toHaveLength(1)
    for (let i = 1; i < bloques.length; i++) {
      expect(bloques[i - 1].compareDocumentPosition(bloques[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }

    // Nada de seguimiento ni acciones ajenas dentro de Progreso
    expect(screen.queryByRole('heading', { name: 'Seguimiento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Registrar$/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Detalle completo/)).not.toBeInTheDocument()
  }, 40000)
})
