import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import Progreso from './Progreso'

describe('Progreso — mapa corporal + resumen pequeño + informe PDF', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    await db.bodyMeasurements.put({
      id: 'bm-test', localDate: todayKey(), weightKg: 80,
      createdAt: new Date().toISOString(),
    } as never)
  })

  it('muestra mapa, resumen e informe en orden, y fuera la analítica profunda', async () => {
    render(<MemoryRouter><Progreso /></MemoryRouter>)

    // 1 · mapa muscular
    const mapa = await screen.findByRole('heading', { name: 'Mapa muscular' }, { timeout: 15000 })
    expect(mapa).toBeInTheDocument()

    // 2 · resumen pequeño (3 KPIs)
    expect(await screen.findByText('Días entrenados', undefined, { timeout: 15000 })).toBeInTheDocument()
    expect(await screen.findByText('Peso actual', undefined, { timeout: 15000 })).toBeInTheDocument()
    expect(await screen.findByText('Volumen comparable', undefined, { timeout: 15000 })).toBeInTheDocument()

    // 3 · informe (puerta al PDF descargable)
    const informe = await screen.findByRole('heading', { name: 'Informe del período' }, { timeout: 15000 })
    expect(informe).toBeInTheDocument()
    expect(screen.getByText('Generar informe descargable')).toBeInTheDocument()

    // Orden visual y aparición única
    const bloques = [
      mapa,
      screen.getAllByText('Días entrenados')[0],
      screen.getAllByText('Peso actual')[0],
      screen.getAllByText('Volumen comparable')[0],
      informe,
    ]
    for (let i = 1; i < bloques.length; i++) {
      expect(bloques[i - 1].compareDocumentPosition(bloques[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getAllByRole('heading', { name: 'Informe del período' })).toHaveLength(1)

    // La analítica profunda no vive en la página: se genera como informe PDF
    expect(screen.queryByRole('heading', { name: 'Recuperación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Resumen nutricional' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Evolución por parte muscular' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('progreso-evolution')).not.toBeInTheDocument()
    expect(screen.queryByTestId('progreso-recovery')).not.toBeInTheDocument()
    expect(screen.queryByTestId('progreso-nutrition')).not.toBeInTheDocument()

    // Máximo 2 selectores: acá queda solo el de período (chips)
    expect(screen.getAllByRole('group', { name: 'Período del informe' })).toHaveLength(1)
    expect(screen.queryByLabelText('Parte muscular')).not.toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid^="metric-"]')).toHaveLength(0)
    expect(screen.queryByTestId('progreso-chart')).not.toBeInTheDocument()

    // Nada de seguimiento ni acciones ajenas dentro de Progreso
    expect(screen.queryByRole('heading', { name: 'Seguimiento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Registrar$/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Detalle completo/)).not.toBeInTheDocument()
  }, 40000)
})
