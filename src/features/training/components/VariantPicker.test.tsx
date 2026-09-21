import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { VariantPicker } from './VariantPicker'
import { getVariantsForExercise, type VariantContext } from '@/services/ai/variantService'

vi.mock('@/services/exerciseGym', () => ({
  fetchAll: async () => ({
    exercises: [
      {
        id: 'press-banca', name: 'Press banca', muscle: 'pectorals', bodyPart: 'chest',
        equipment: 'barbell', category: 'strength', movementPattern: 'push',
        difficulty: 'intermediate', secondaryMuscles: ['triceps'],
        instructions: [], file: '', gifUrl: '',
      },
      {
        id: 'press-mancuernas', name: 'Press mancuernas', muscle: 'pectorals', bodyPart: 'chest',
        equipment: 'dumbbell', category: 'strength', movementPattern: 'push',
        difficulty: 'intermediate', secondaryMuscles: ['triceps'],
        instructions: [], file: '', gifUrl: '',
      },
      {
        id: 'sentadilla', name: 'Sentadilla', muscle: 'quads', bodyPart: 'legs',
        equipment: 'barbell', category: 'strength', movementPattern: 'squat',
        difficulty: 'intermediate', secondaryMuscles: [],
        instructions: [], file: '', gifUrl: '',
      },
    ],
  }),
}))

const CTX: VariantContext = { originalExerciseId: 'press-banca', reason: 'equipment' }
const noop = () => {}

describe('BUG Entrenamiento/Variantes — el picker nunca bloquea el flujo', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('1. contexto null no renderiza overlay bloqueante', () => {
    const { container } = render(
      <VariantPicker context={null} userProfile={null} onSelectVariant={noop} onClose={noop} />
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText(/No hay variantes disponibles/)).not.toBeInTheDocument()
  })

  it('3. sin resultados: estado vacío con cierre, sin bloquear', async () => {
    const onClose = vi.fn()
    render(
      <VariantPicker
        context={{ originalExerciseId: 'inexistente-xyz', reason: 'equipment' }}
        userProfile={null}
        onSelectVariant={noop}
        onClose={onClose}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/No hay variantes disponibles/)).toBeInTheDocument()
    })
    // Cerrar por botón y por backdrop
    fireEvent.click(screen.getByText('Volver al ejercicio'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('4. con resultados: muestra variantes y permite seleccionar', async () => {
    const onSelect = vi.fn()
    render(
      <VariantPicker context={CTX} userProfile={null} onSelectVariant={onSelect} onClose={noop} />
    )
    await waitFor(() => {
      expect(screen.getByText('Press mancuernas')).toBeInTheDocument()
    })
    expect(screen.queryByText(/No hay variantes disponibles/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Press mancuernas'))
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1)
    })
    expect(onSelect.mock.calls[0][0].exerciseId).toBe('press-mancuernas')
    expect(onSelect.mock.calls[0][1]).toMatch(/accepted|modified/)
  })

  it('5. razones válidas no lanzan y respetan excluidos', async () => {
    const reasons = ['user_request', 'pain', 'equipment', 'fatigue', 'dislike', 'limitation', 'progression', 'regression'] as const
    for (const reason of reasons) {
      const list = await getVariantsForExercise({ originalExerciseId: 'press-banca', reason }, null)
      expect(Array.isArray(list)).toBe(true)
    }
    // 6. excluidos no aparecen como sustitutos
    const filtered = await getVariantsForExercise(CTX, { excludedExercises: ['press-mancuernas'] } as never)
    expect(filtered.map(v => v.exerciseId)).not.toContain('press-mancuernas')
  })

  it('10. cerrar/cancelar no toca el histórico', async () => {
    await db.setRecords.put({
      setRecordId: 'se1:set:1', sessionId: 's1', sessionExerciseId: 'se1',
      exerciseId: 'press-banca', order: 1, setType: 'NORMAL',
      plannedReps: 8, plannedWeight: 80, actualReps: 8, actualWeight: 80,
      status: 'COMPLETED', completedAt: '2026-09-10T10:00:00Z',
      createdAt: '2026-09-10T10:00:00Z', updatedAt: '2026-09-10T10:00:00Z',
    } as never)
    const onClose = vi.fn()
    render(
      <VariantPicker
        context={{ originalExerciseId: 'inexistente-xyz', reason: 'equipment' }}
        userProfile={null}
        onSelectVariant={noop}
        onClose={onClose}
      />
    )
    await waitFor(() => {
      expect(screen.getByText(/No hay variantes disponibles/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Volver al ejercicio'))
    expect(await db.setRecords.count()).toBe(1)
    expect((await db.setRecords.get('se1:set:1'))?.exerciseId).toBe('press-banca')
  })
})
