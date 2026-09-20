import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { RecommendationCard, type Recommendation } from './RecommendationCard'
import { PeriodizationEditor } from './PeriodizationEditor'

const baseRec: Recommendation = {
  id: 'rec-1',
  type: 'recovery',
  title: 'Considerar descarga',
  description: 'Bajar volumen hoy.',
  reasoning: 'Cálculo a partir de tus registros.',
  evidence: ['Dato: último score 42/100', 'Cálculo: tendencia declining'],
  action: { label: 'Aceptar', type: 'accept' },
  severity: 'warning',
  timestamp: new Date().toISOString(),
}

describe('US4 — Integración UI (RecommendationCard + PeriodizationEditor)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('RecommendationCard muestra título, descripción y evidencia con showWhy', () => {
    render(<RecommendationCard recommendation={baseRec} onAction={() => {}} showWhy />)
    expect(screen.getByText('Considerar descarga')).toBeInTheDocument()
    expect(screen.getByText('Bajar volumen hoy.')).toBeInTheDocument()
    expect(screen.getByText(/¿POR QUÉ\?/)).toBeInTheDocument()
    expect(screen.getByText('Cálculo a partir de tus registros.')).toBeInTheDocument()
    expect(screen.getByText('Dato: último score 42/100')).toBeInTheDocument()
  })

  it('RecommendationCard oculta el porqué sin showWhy', () => {
    render(<RecommendationCard recommendation={baseRec} onAction={() => {}} />)
    expect(screen.queryByText(/¿POR QUÉ\?/)).not.toBeInTheDocument()
  })

  it('RecommendationCard aceptar/descartar llama onAction sin modificar rutina', async () => {
    const onAction = vi.fn()
    const { unmount } = render(<RecommendationCard recommendation={baseRec} onAction={onAction} />)
    fireEvent.click(screen.getByText('Aceptar'))
    expect(onAction).toHaveBeenCalledWith('rec-1', 'accept', undefined)
    unmount()

    render(<RecommendationCard recommendation={baseRec} onAction={onAction} />)
    fireEvent.click(screen.getByText('Descartar'))
    expect(onAction).toHaveBeenCalledWith('rec-1', 'dismiss', undefined)
    expect(await db.trainingSessions.count()).toBe(0)
  })

  it('PeriodizationEditor muestra ciclo actual desde el perfil', async () => {
    await db.userProfile.put({
      id: 'me',
      goal: 'fuerza', level: 'intermedio', availableDays: [1, 3, 5],
      trainingTime: '60', equipment: ['barra'],
      units: { weight: 'kg', liquid: 'ml' }, lang: 'es',
      coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
      cycle: {
        startDate: '2026-09-01',
        trainingDays: [{ n: 1, name: 'Pecho' }, { n: 2, name: 'Espalda' }],
        weekMap: [null, 1, null, 2, null, null, null],
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any)

    render(<PeriodizationEditor />)
    await waitFor(() => {
      expect(screen.getByText('Periodización')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Ciclo actual')).toBeInTheDocument()
    })
  })

  it('PeriodizationEditor muestra estado vacío sin ciclo', async () => {
    render(<PeriodizationEditor />)
    await waitFor(() => {
      expect(screen.getByText('Periodización')).toBeInTheDocument()
    })
  })
})
