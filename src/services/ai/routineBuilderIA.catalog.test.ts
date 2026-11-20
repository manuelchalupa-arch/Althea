import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/services/storage/db'

// Catálogo determinista: la IA sólo puede devolver estos IDs.
vi.mock('@/services/exerciseGym', () => ({
  fetchByMuscle: async (muscle: string) => ({
    muscle,
    count: 2,
    exercises: ['base', 'variante'].map((slug) => ({
      id: `${muscle}/${slug}`,
      name: `${slug} ${muscle}`,
      muscle,
      bodyPart: 'chest',
      equipment: 'barbell',
      category: 'strength',
      movementPattern: 'push',
      difficulty: 'intermediate',
      secondaryMuscles: [],
      instructions: [],
      file: '',
      gifUrl: '',
    })),
  }),
  fetchAll: async () => ({ exercises: [] }),
  fetchOne: async () => null,
}))

import { detectDaysMention, generateRoutineWithAI } from './routineBuilderIA'

const response = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
})

describe('Rutinas IA — pedido libre y catálogo real', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    await db.open()
    vi.stubEnv('VITE_GROQ_PROXY_URL', 'https://proxy.test')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('detecta los días mencionados en el pedido libre', () => {
    expect(detectDaysMention('Quiero una rutina de cuatro días para hipertrofia')).toBe(4)
    expect(detectDaysMention('entrenar 5 veces por semana')).toBe(5)
    expect(detectDaysMention('quiero mejorar los brazos')).toBeNull()
    expect(detectDaysMention('')).toBeNull()
  })

  it('descarta IDs inventados, rellena desde el catálogo y conserva superseries válidas', async () => {
    const payload = {
      name: 'Rutina IA',
      cycle: {
        startDate: '2026-01-01',
        trainingDays: [
          { n: 1, name: 'Pecho + Tríceps' },
          { n: 2, name: 'Piernas' },
        ],
        weekMap: [null, 1, null, 2, null, null, null],
        methodId: 'hypertrophy',
        methodJustification: 'Volumen para priorizar piernas',
      },
      dayExercises: {
        1: [
          { exId: 'inventado/ejercicio-falso', name: 'Ejercicio inventado', sets: 3, reps: 10, weight: 0 },
          { exId: 'pectorals/base', name: 'base pectorals', sets: 3, reps: 10, weight: 40, supersetId: 'ss1', supersetOrder: 0 },
          { exId: 'triceps/base', name: 'base triceps', sets: 3, reps: 12, weight: 20, supersetId: 'ss1', supersetOrder: 1 },
        ],
        2: [
          { exId: 'quads/base', name: 'base quads', sets: 4, reps: 8, weight: 60 },
        ],
      },
      explanation: { goal: 'Hipertrofia', method: 'Volumen', distribution: '2 días', intensity: 'Media', progression: 'Gradual', priorities: ['piernas'] },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload)))

    const routine = await generateRoutineWithAI({
      goal: 'hipertrofia', daysPerWeek: 2, focus: 'general', injuryNote: '',
      description: 'Tengo las piernas poco desarrolladas y quiero priorizarlas. No quiero burpees.',
    })

    const all = Object.values(routine.dayExercises).flat()
    expect(all.every((e) => !e.exId.includes('inventado'))).toBe(true)
    expect(all.every((e) => /\/(base|variante)$/.test(e.exId))).toBe(true)
    expect(routine.dayExercises[2].length).toBeGreaterThanOrEqual(3)
    // La superserie de dos integrantes se conserva como bloque del mismo día.
    const ss = all.filter((e) => e.supersetId)
    expect(ss.length).toBe(2)
    expect(new Set(ss.map((e) => e.supersetId)).size).toBe(1)
    expect(routine.explanation.priorities).toEqual(['piernas'])
  })

  it('el prompt incluye el pedido libre y prohíbe inventar IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      name: 'R', cycle: { trainingDays: [{ n: 1, name: 'Piernas' }], weekMap: [null, 1, null, null, null, null, null], methodId: 'hypertrophy' },
      dayExercises: { 1: [{ exId: 'quads/base', name: 'base quads', sets: 3, reps: 10, weight: 0 }] },
      explanation: {},
    }))
    vi.stubGlobal('fetch', fetchMock)

    await generateRoutineWithAI({
      goal: 'hipertrofia', daysPerWeek: 1, focus: 'general', injuryNote: '',
      description: 'Quiero priorizar piernas y evitar burpees',
    })

    const body = String(fetchMock.mock.calls[0][1].body)
    expect(body).toContain('Quiero priorizar piernas y evitar burpees')
    expect(body).toContain('Nunca inventes IDs')
  })
})
