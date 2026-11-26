import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'

vi.mock('./groqConfig', () => ({
  getGroqUrl: () => 'https://proxy.test',
  getGroqHeaders: () => ({ 'Content-Type': 'application/json' }),
}))
vi.mock('./aiAuth', () => ({
  getAiAuthHeaders: async () => ({ Authorization: 'Bearer test-token' }),
  aiLimitMessage: (status: number, code?: string) =>
    status === 429 ? `LIMITE_IA:${code === 'quota_exhausted' ? 'Cuota agotada' : 'Limitado'}` : null,
  isLimitError: (m: string) => m.startsWith('LIMITE_IA:'),
  stripLimitPrefix: (m: string) => m.replace(/^LIMITE_IA:/, ''),
  hasAiSession: () => true,
  limitError: (m: string) => `LIMITE_IA:${m}`,
}))
vi.mock('@/services/exerciseGym', () => ({
  fetchByMuscle: async (muscle: string) => ({
    muscle,
    count: 1,
    exercises: [{
      id: `${muscle}/ex0`, name: 'Ejercicio mock', muscle, bodyPart: 'chest',
      equipment: 'barbell', category: 'strength', movementPattern: 'push',
      difficulty: 'intermediate', secondaryMuscles: [], instructions: [], file: '', gifUrl: '',
    }],
  }),
}))

import { generateRoutineWithAI } from './routineBuilderIA'

const wants = { goal: 'hipertrofia', daysPerWeek: 3, focus: 'general', injuryNote: '', description: '3 días' }

describe('generador de rutinas conectado al servicio central', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  it('envía task=routine y el token; ante cuota agotada informa en vez de simular IA', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      clone: () => ({ json: async () => ({ error: 'quota_exhausted' }) }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateRoutineWithAI(wants)).rejects.toThrow('Cuota agotada')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.task).toBe('routine')
    expect(body.stream).toBe(false)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    vi.unstubAllGlobals()
  })
})
