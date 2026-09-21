import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { unifiedAllCompletedSets, unifiedSetsForPR } from './history'
import { calculateExercisePRs } from './training/prs'
import { buildTrainingContext } from './ai/contextBuilder'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'

describe('FASE 4 — Sin datos ficticios', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('1/4. historial vacío no inventa filas ni gráficos', async () => {
    expect(await unifiedAllCompletedSets()).toEqual([])
    expect(await unifiedSetsForPR('ex-006')).toEqual([])
    const prs = calculateExercisePRs([])
    expect(prs.maxWeight).toBeNull()
    expect(prs.maxEstimated1RM).toBeNull()
  })

  it('6. datos demo (isDemo) no se mezclan con reales', async () => {
    await db.setRecords.put({
      setRecordId: 'demo:set:1', sessionId: 'demo-sess', sessionExerciseId: 'demo-se',
      exerciseId: 'ex-006', order: 1, setType: 'NORMAL',
      plannedReps: 10, plannedWeight: 200, actualReps: 10, actualWeight: 200,
      status: 'COMPLETED', completedAt: '2026-09-10T10:00:00Z',
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
      isDemo: true,
    } as never)
    await db.setRecords.put({
      setRecordId: 'real:set:1', sessionId: 'real-sess', sessionExerciseId: 'real-se',
      exerciseId: 'ex-006', order: 1, setType: 'NORMAL',
      plannedReps: 8, plannedWeight: 80, actualReps: 8, actualWeight: 80,
      status: 'COMPLETED', completedAt: '2026-09-11T10:00:00Z',
      createdAt: '2026-09-11T10:00:00Z', updatedAt: '2026-09-11T10:00:00Z',
    } as never)
    const sets = await unifiedSetsForPR('ex-006')
    expect(sets.length).toBe(1)
    expect(sets[0].weight).toBe(80)
    const prs = calculateExercisePRs(sets)
    expect(prs.maxWeight?.weight).toBe(80)
  })

  it('1/2. Recovery sin check-in avisa y no presenta score como medición', async () => {
    render(<RecoveryCheckForm date="2026-09-20" />)
    await waitFor(() => {
      expect(screen.getByText('Guardar check-in')).toBeInTheDocument()
    })
    expect(screen.getByText(/Sin check-in guardado/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Guardar check-in'))
    await waitFor(() => {
      expect(screen.queryByText(/Sin check-in guardado/)).not.toBeInTheDocument()
    })
  })

  it('3/5. Coach con base vacía recibe ausencia explícita, sin valores inventados', async () => {
    const ctx = await buildTrainingContext('ex-006', 'Sentadilla')
    const flat = JSON.stringify(ctx)
    expect(flat).toMatch(/Sin datos|no registrad/i)
    expect(flat).not.toContain('1500')
  })
})
