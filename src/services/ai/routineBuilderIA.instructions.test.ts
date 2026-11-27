import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/services/storage/db'

// Catálogo determinista y variado: 12 ejercicios por músculo, equipo rotado
// (barbell / dumbbell / bodyweight). El ex0 se llama "press banca plano" para
// poder probar exclusiones por nombre.
vi.mock('@/services/exerciseGym', () => ({
  fetchByMuscle: async (muscle: string) => ({
    muscle,
    count: 12,
    exercises: muscle === 'cardio'
      ? Array.from({ length: 8 }, (_, i) => ({ id: `cardio/cardio${i}`, name: `Cardio suave ${i}`, muscle: 'cardio', bodyPart: 'cardio', equipment: 'bodyweight', category: 'cardio', secondaryMuscles: [], instructions: [], file: '', gifUrl: '' }))
      : [
      ...(muscle === 'pectorals' ? [{ id: 'pectorals/stretch-test', name: 'Estiramiento de pecho', muscle: 'pectorals', bodyPart: 'chest', equipment: 'bodyweight', category: 'stretching', secondaryMuscles: [], instructions: [], file: '', gifUrl: '' }] : []),
      ...Array.from({ length: 12 }, (_, i) => ({
      id: `${muscle}/ex${i}`,
      name: i === 0 ? 'press banca plano' : `${muscle} ex${i}`,
      muscle,
      bodyPart: 'chest',
      equipment: ['barbell', 'dumbbell', 'bodyweight'][i % 3],
      category: 'strength',
      movementPattern: 'push',
      difficulty: 'intermediate',
      secondaryMuscles: [],
      instructions: [],
      file: '',
      gifUrl: '',
    })),
      ],
  }),
  fetchAll: async () => ({ exercises: [] }),
  fetchOne: async () => null,
}))

vi.mock('./groqConfig', () => ({
  getProxyUrl: vi.fn(() => ''),
  getGroqHeaders: () => ({ 'Content-Type': 'application/json' }),
}))
// El contrato de sesión real se cubre en aiAuth.test.ts; acá se aísla la
// interpretación del pedido y la validación del catálogo.
vi.mock('./aiAuth', () => ({
  getAiAuthHeaders: async () => ({ Authorization: 'Bearer test-token' }),
  aiLimitMessage: (status: number, code?: string) =>
    status === 429 ? `LIMITE_IA:${code === 'quota_exhausted' ? 'Cuota agotada' : 'Limitado'}` : null,
  isLimitError: (m: string) => m.startsWith('LIMITE_IA:'),
  stripLimitPrefix: (m: string) => m.replace(/^LIMITE_IA:/, ''),
  hasAiSession: () => true,
  limitError: (m: string) => `LIMITE_IA:${m}`,
}))

import { getProxyUrl } from './groqConfig'
import { generateRoutineWithAI, parseRoutineInstructions, parseRoutineSequence, validateGeneratedRoutine } from './routineBuilderIA'

const wants = (description: string, daysPerWeek = 4) => ({
  goal: 'hipertrofia', daysPerWeek, focus: 'general', injuryNote: '', description,
})

const allEx = (r: Awaited<ReturnType<typeof generateRoutineWithAI>>) =>
  Object.values(r.dayExercises).flat()

describe('Rutinas IA — el pedido libre se interpreta y se aplica', () => {
  beforeEach(async () => {
    localStorage.clear()
    vi.mocked(getProxyUrl).mockReturnValue('')
    await db.delete()
    await db.open()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('estructura el pedido: split, duración, equipo, prioridades y exclusiones', () => {
    const i = parseRoutineInstructions(
      'Quiero 4 días torso/piernas de 30 minutos; priorizar espalda y hombros. Solo tengo mancuernas. No quiero press banca.',
    )
    expect(i.days).toBe(4)
    expect(i.split).toBe('torso_piernas')
    expect(i.sessionMinutes).toBe(30)
    expect(i.equipment).toEqual(['dumbbell'])
    expect(i.priorities).toEqual(expect.arrayContaining(['lats', 'delts']))
    expect(i.excludes.join(' ')).toContain('press banca')
    expect(i.level).toBeNull()
    expect(parseRoutineInstructions('Solo tengo máquinas').equipment).toEqual(['machine'])
  })

  it('aplica la secuencia solicitada, con cuatro ejercicios principales en dos superseries', async () => {
    const description = [
      'Un ejercicio de estiramiento calentamiento',
      'Cuatro ejercicios de un grupo muscular principal con super series',
      'Tres ejercicios de grupo muscular secundario',
      'Cardio suave para bajar el ritmo cardíaco',
    ].join('\n')
    expect(parseRoutineSequence(description)).toEqual({ warmupCount: 1, primaryCount: 4, primarySupersets: true, secondaryCount: 3, cooldownCount: 1 })
    const r = await generateRoutineWithAI({ goal: 'hipertrofia', daysPerWeek: 1, focus: 'pectorals', injuryNote: '', description })
    const list = r.dayExercises[1]
    expect(list).toHaveLength(9)
    expect(list.map(e=>e.sequenceRole)).toEqual(['warmup','primary','primary','primary','primary','secondary','secondary','secondary','cooldown'])
    expect(list[0].isStretch).toBe(true)
    expect(list.slice(1,5).every(e=>!!e.supersetId)).toBe(true)
    expect(new Set(list.slice(1,5).map(e=>e.supersetId)).size).toBe(2)
    expect(list[5].muscle).not.toBe('pectorals')
    expect(list[8].muscle).toBe('cardio')
  })

  it('reintenta una vez cuando el modelo devuelve JSON malformado y conserva los días elegidos', async () => {
    vi.mocked(getProxyUrl).mockReturnValue('https://proxy.test')
    const trainingDays = [{ n: 1, name: 'Día 1' }, { n: 2, name: 'Día 2' }, { n: 3, name: 'Día 3' }]
    const payload = {
      name: 'Rutina recuperada',
      cycle: {
        startDate: '2026-11-27',
        trainingDays,
        weekMap: [null, 1, null, 2, null, 3, null],
        methodId: 'hypertrophy',
        methodJustification: 'Rutina de tres días',
      },
      dayExercises: {
        1: [{ exId: 'pectorals/ex1', sets: 3, reps: 10, weight: 0 }],
        2: [{ exId: 'quads/ex1', sets: 3, reps: 10, weight: 0 }],
        3: [{ exId: 'lats/ex1', sets: 3, reps: 10, weight: 0 }],
      },
      explanation: {},
    }
    const response = (content: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response('La respuesta no es JSON'))
      .mockResolvedValueOnce(response(JSON.stringify(payload)))
    vi.stubGlobal('fetch', fetchMock)

    const routine = await generateRoutineWithAI({
      goal: 'hipertrofia', daysPerWeek: 3, focus: 'general', injuryNote: '',
      description: '3 días', allowedEquipment: ['dumbbell'],
      availableDays: [1, 3, 5], methodId: 'hypertrophy',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(secondRequest.messages[1].content).toContain('CORRECCIONES OBLIGATORIAS')
    expect(routine.cycle.weekMap).toEqual([null, 1, null, 2, null, 3, null])
  })

  it('valida equipamiento por tipo: máquina acepta lever, estiramiento corporal no requiere implementos y fuerza corporal sí', () => {
    const validate = (eq: string, purpose: 'conventional' | 'stretch', selected: string[], isStretch = false) => {
      const exId = 'test/exercise'
      const routine = {
        name: 'Test',
        cycle: {
          trainingDays: [{ n: 1, name: 'Día 1' }],
          weekMap: [null, 1, null, null, null, null, null],
        },
        dayExercises: { 1: [{ id: 'row-1', exId, name: 'Ejercicio test', sets: 1, reps: 10, weight: 0, isStretch }] },
        explanation: {},
      } as any
      return validateGeneratedRoutine(
        routine,
        { goal: 'hipertrofia', daysPerWeek: 1, allowedEquipment: selected } as any,
        { days: 1, equipment: null, excludes: [], includes: [], priorities: [] } as any,
        new Map([[exId, { id: exId, name: 'Ejercicio test', eq, purpose }]]),
      )
    }

    expect(validate('lever', 'conventional', ['machine']).ok).toBe(true)
    expect(validate('peso corporal', 'stretch', ['dumbbell'], true).ok).toBe(true)
    const bodyweightStrength = validate('bodyweight', 'conventional', ['dumbbell'])
    expect(bodyweightStrength.ok).toBe(false)
    expect(bodyweightStrength.issues.join(' ')).toContain('equipamiento no disponible')
  })

  it('acepta estiramientos sin implementos aunque no se haya seleccionado peso corporal y los rota por día', async () => {
    vi.mocked(getProxyUrl).mockReturnValue('https://proxy.test')
    const trainingDays = Array.from({ length: 5 }, (_, i) => ({ n: i + 1, name: `Día ${i + 1}` }))
    const dayExercises = Object.fromEntries(trainingDays.map((day, i) => [
      day.n,
      [{ exId: ['pectorals','quads','lats','hamstrings','delts'][i] + '/ex1', sets: 3, reps: 10, weight: 0 }],
    ]))
    const payload = {
      name: 'Rutina con estiramientos',
      cycle: {
        startDate: '2026-11-27',
        trainingDays,
        weekMap: [null, 1, 2, 3, 4, 5, null],
        methodId: 'hypertrophy',
        methodJustification: 'Hipertrofia con equipamiento disponible',
      },
      dayExercises,
      explanation: {},
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const routine = await generateRoutineWithAI({
      goal: 'hipertrofia', daysPerWeek: 5, focus: 'general', injuryNote: '',
      description: 'Preferencias estructuradas del generador de rutinas.\nEquipamiento disponible: bodyweight.\nDías: lunes a viernes.', allowedEquipment: ['dumbbell'],
      availableDays: [1, 2, 3, 4, 5], methodId: 'hypertrophy',
      warmupEnabled: false, stretchingEnabled: true,
      excludedMovements: ['pantorrillas'], excludedExerciseIds: ['trad/stretch-calf-wall'],
    })

    const all = Object.values(routine.dayExercises).flat()
    const stretches = all.filter(ex => ex.isStretch)
    expect(stretches).toHaveLength(5)
    expect(new Set(stretches.map(ex => ex.exId)).size).toBe(5)
    expect(stretches.every(ex => ex.sequenceRole === 'cooldown')).toBe(true)
    expect(stretches.every(ex => !/pantorrillas/i.test(ex.name || ''))).toBe(true)
    for (const ex of all.filter(item => !item.isStretch)) {
      const index = Number(ex.exId.split('/ex')[1])
      expect(index % 3).toBe(1)
    }
    const requestBody = String(fetchMock.mock.calls[0][1].body)
    const availableCatalog = requestBody.split('EJERCICIOS DISPONIBLES (usá exclusivamente estos IDs exactos):')[1] || ''
    expect(availableCatalog).not.toContain('trad/stretch-calf-wall')
    expect(requestBody).not.toContain('Estiramiento de pantorrillas en pared')
    expect(requestBody).not.toContain('Equipamiento disponible: bodyweight')
    expect(requestBody).toContain('Equipo permitido: dumbbell')
  })

  it('fallback 4 días torso/piernas: respeta el split y no repite ejercicios', async () => {
    const r = await generateRoutineWithAI(wants('Quiero 4 días torso/piernas', 4))
    const names = r.cycle.trainingDays.map((d) => d.name)
    expect(names).toEqual(['Torso A', 'Piernas A', 'Torso B', 'Piernas B'])
    const exs = allEx(r)
    expect(exs.length).toBeGreaterThan(0)
    expect(new Set(exs.map((e) => e.exId)).size).toBe(exs.length)
    expect(r.cycle.weekMap.filter((n) => n !== null).length).toBe(4)
  })

  it('fallback 3 días principiante: 3 días de cuerpo completo y series acordes al nivel', async () => {
    const r = await generateRoutineWithAI(wants('Soy principiante, quiero 3 días de cuerpo completo', 3))
    expect(r.cycle.trainingDays.length).toBe(3)
    expect(r.cycle.trainingDays.every((d) => /cuerpo completo/i.test(d.name))).toBe(true)
    expect(allEx(r).every((e) => e.sets <= 3)).toBe(true)
  })

  it('fallback solo mancuernas: ningún ejercicio de otro equipamiento', async () => {
    const r = await generateRoutineWithAI(wants('3 días cuerpo completo, solo tengo mancuernas', 3))
    const exs = allEx(r)
    expect(exs.length).toBeGreaterThan(0)
    // En el mock el índice %3===1 es dumbbell.
    for (const e of exs) {
      const idx = Number(e.exId.split('/ex')[1])
      expect(idx % 3).toBe(1)
    }
  })

  it('fallback respeta exclusiones por nombre', async () => {
    const r = await generateRoutineWithAI(wants('3 días cuerpo completo, no quiero press banca', 3))
    const names = allEx(r).map((e) => (e.name || '').toLowerCase())
    expect(names.length).toBeGreaterThan(0)
    expect(names.some((n) => n.includes('press banca'))).toBe(false)
  })

  it('fallback limita los ejercicios por día según la duración pedida', async () => {
    const r = await generateRoutineWithAI(wants('4 días torso/piernas, sesiones de 30 minutos', 4))
    for (const list of Object.values(r.dayExercises)) {
      expect(list.length).toBeGreaterThan(0)
      expect(list.length).toBeLessThanOrEqual(3)
    }
  })

  it('prioridades pedidas aparecen en la explicación', async () => {
    const r = await generateRoutineWithAI(wants('Quiero priorizar espalda y hombros', 4))
    const prio = (r.explanation.priorities || []).join(' ').toLowerCase()
    expect(prio).toMatch(/espalda|dorsal/)
    expect(prio).toMatch(/hombro/)
  })

  it('dos pedidos distintos no devuelven la misma rutina', async () => {
    const a = await generateRoutineWithAI(wants('3 días cuerpo completo, prioridad espalda y hombros', 3))
    const b = await generateRoutineWithAI(wants('3 días cuerpo completo, prioridad piernas', 3))
    const setA = allEx(a).map((e) => e.exId).sort().join(',')
    const setB = allEx(b).map((e) => e.exId).sort().join(',')
    expect(setA).not.toBe(setB)
  })

  it('el fallback declara qué no interpreta en vez de simularlo', async () => {
    const r = await generateRoutineWithAI(wants('Quiero priorizar espalda y hombros', 4))
    expect(r.explanation.keyFeatures.some((f) => /No interpreta/i.test(f))).toBe(true)
  })

  it('el prompt envía las restricciones como obligatorias y el resultado las cumple', async () => {
    vi.mocked(getProxyUrl).mockReturnValue('https://proxy.test')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              name: 'R',
              cycle: {
                trainingDays: [
                  { n: 1, name: 'Torso A' },
                  { n: 2, name: 'Piernas A' },
                  { n: 3, name: 'Torso B' },
                  { n: 4, name: 'Piernas B' },
                ],
                weekMap: [null, 1, null, 2, null, 3, 4],
                methodId: 'hypertrophy',
              },
              dayExercises: {
                1: [1, 2, 3, 4, 5].map((n) => ({ exId: `pectorals/ex${n}`, name: `p${n}`, sets: 4, reps: 10, weight: 0 })),
                2: [],
                3: [],
                4: [],
              },
              explanation: {},
            }),
          },
        }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const r = await generateRoutineWithAI(wants(
      '4 días torso/piernas, sesiones de 30 minutos, solo tengo mancuernas, priorizar espalda y hombros, no quiero press banca',
      4,
    ))

    const body = String(fetchMock.mock.calls[0][1].body)
    expect(body).toContain('Split obligatorio: torso / piernas')
    expect(body).toContain('Duración máxima: 30 min')
    expect(body).toContain('Equipo permitido: dumbbell')
    expect(body).toContain('No incluir: press banca')
    expect(body).toContain('Prioridades')
    expect(body).toContain('Nunca inventes IDs')

    // Recorte real: 30 min → máx. 3 ejercicios aunque la IA devolvió 5.
    expect(r.cycle.trainingDays.length).toBe(4)
    expect(r.dayExercises[1].length).toBeGreaterThan(0)
    expect(r.dayExercises[1].length).toBeLessThanOrEqual(3)
    // Todos los IDs son del catálogo y del equipo permitido.
    for (const e of allEx(r)) {
      const idx = Number(e.exId.split('/ex')[1])
      expect(Number.isInteger(idx)).toBe(true)
      expect(idx % 3).toBe(1)
    }
  })
})
