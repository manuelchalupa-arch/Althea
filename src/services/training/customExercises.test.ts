import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  validateCustomInput, buildBreakdown, effectiveBreakdown, matchesCustomFilter,
  createCustomExercise, updateCustomExercise, deleteCustomExercise,
  listCustomExercises, getCustomExercise, newCustomId, type CustomInput,
} from './customExercises'

const input = (over: Partial<CustomInput> = {}): CustomInput => ({
  name: 'Press unilateral en polea',
  description: 'demo',
  bodyPart: 'chest',
  muscle: 'pectorals',
  secondaryMuscles: ['triceps'],
  primaryPct: 70,
  secondaryPcts: [30],
  category: 'strength',
  equipment: 'cable',
  ...over,
})

beforeEach(async () => {
  localStorage.clear()
  await db.table('customExercises').clear().catch(() => null)
  await db.table('setRecords').clear().catch(() => null)
  await db.setLogs.clear().catch(() => null)
})

describe('validación (§14, §36)', () => {
  it('exige nombre, parte y músculo principal', () => {
    expect(validateCustomInput(input({ name: '  ' }))).toContain('Nombre obligatorio')
    expect(validateCustomInput(input({ bodyPart: '' }))).toContain('Parte obligatoria')
    expect(validateCustomInput(input({ muscle: '' }))).toContain('Grupo muscular principal obligatorio')
  })
  it('porcentajes deben sumar 100 y estar en rango', () => {
    expect(validateCustomInput(input({ primaryPct: 60 }))).toContain('Los porcentajes deben sumar 100 (actual: 90)')
    expect(validateCustomInput(input({ primaryPct: 110, secondaryPcts: [-10] }))).toContain('Porcentajes entre 0 y 100')
    expect(validateCustomInput(input())).toEqual([])
  })
  it('cada secundario necesita su porcentaje', () => {
    expect(validateCustomInput(input({ secondaryPcts: [] }))).toContain('Cada secundario necesita su porcentaje')
  })
})

describe('identidad y breakdown (§9, §19)', () => {
  it('ids únicos con namespace custom/', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newCustomId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id.startsWith('custom/')).toBe(true)
  })
  it('buildBreakdown estructurado suma 100', () => {
    const b = buildBreakdown(input())
    expect(b).toEqual([
      { name: 'pectorals', pct: 70, role: 'Principal' },
      { name: 'triceps', pct: 30, role: 'Secundario' },
    ])
  })
  it('effectiveBreakdown usa guardado o heurística 70/30', () => {
    expect(effectiveBreakdown({ muscle: 'x', secondaryMuscles: [], muscleBreakdown: [{ name: 'x', pct: 80, role: 'Principal' }] })[0].pct).toBe(80)
    expect(effectiveBreakdown({ muscle: 'x', secondaryMuscles: [] })).toEqual([{ name: 'x', pct: 100, role: 'Principal' }])
  })
})

describe('filtros (§5, §28-29)', () => {
  const c = { muscle: 'pectorals', equipment: 'cable', bodyPart: 'chest', category: 'strength', name: 'X' }
  it('__all__ siempre coincide; claves exactas por tab', () => {
    expect(matchesCustomFilter(c, 'muscle', '__all__')).toBe(true)
    expect(matchesCustomFilter(c, 'bodypart', '__all__')).toBe(true)
    expect(matchesCustomFilter(c, 'bodypart', 'chest')).toBe(true)
    expect(matchesCustomFilter(c, 'bodypart', 'legs')).toBe(false)
    expect(matchesCustomFilter(c, 'muscle', 'pectorals')).toBe(true)
    expect(matchesCustomFilter(c, 'equipment', 'cable')).toBe(true)
    expect(matchesCustomFilter(c, 'category', 'strength')).toBe(true)
  })
})

describe('CRUD + persistencia + soft delete (§26, §30)', () => {
  it('flujo crear → editar → archivar con historial → vigente sin historial se borra', async () => {
    const created = await createCustomExercise(input())
    expect(created.id.startsWith('custom/')).toBe(true)
    expect(created.origin).toBe('USER_CREATED')
    // persiste (recarga simulada: relee por id)
    expect((await getCustomExercise(created.id))?.name).toBe('Press unilateral en polea')
    // aparece en filtros correspondientes
    expect((await listCustomExercises('bodypart', 'chest')).map((x) => x.id)).toContain(created.id)
    expect((await listCustomExercises('bodypart', 'legs')).map((x) => x.id)).not.toContain(created.id)
    expect((await listCustomExercises('muscle', '__all__')).map((x) => x.id)).toContain(created.id)
    // editar
    const upd = await updateCustomExercise(created.id, { name: 'Press polea v2', primaryPct: 80, secondaryPcts: [20] })
    expect(upd.name).toBe('Press polea v2')
    expect(upd.muscleBreakdown?.[0].pct).toBe(80)
    // sin historial: borrado físico
    expect(await deleteCustomExercise(created.id)).toBe('deleted')
    expect(await getCustomExercise(created.id)).toBeNull()
    // con historial: soft delete, historial intacto
    const c2 = await createCustomExercise(input({ name: 'Sentadilla búlgara', bodyPart: 'legs', muscle: 'quads' }))
    await db.setLogs.put({ id: 'l1', sessionId: 's1', exerciseId: c2.id, setNumber: 1, weight: 20, reps: 10, completed: true, createdAt: new Date().toISOString() } as never)
    expect(await deleteCustomExercise(c2.id)).toBe('archived')
    expect((await getCustomExercise(c2.id))?.archived).toBe(true)
    // archivado: fuera de listas, historial intacto
    expect((await listCustomExercises('bodypart', '__all__')).map((x) => x.id)).not.toContain(c2.id)
    expect(await db.setLogs.where('exerciseId').equals(c2.id).count()).toBe(1)
  })

  it('rechaza crear inválido sin tocar la tabla', async () => {
    await expect(createCustomExercise(input({ name: '' }))).rejects.toThrow()
    expect(await db.table('customExercises').count()).toBe(0)
  })
})
