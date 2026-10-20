import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { buildMuscleResolver } from './muscleAttribution'

/**
 * La atribución resuelve el músculo desde el IDENTIFICADOR del ejercicio y su
 * fuente (seed / personalizado / biblioteca), nunca desde el nombre visible.
 * El fallback por id "muscle/slug" no necesita red: funciona offline.
 */
describe('buildMuscleResolver — fuentes reales', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
    await db.exercises.put({
      id: 'ex-row', name: 'Remo con barra', muscles: ['dorsal', 'trapecio'], groupMain: 'espalda',
    } as never)
    await db.customExercises.put({
      id: 'custom/tiron-mio', name: 'Tirón mío', muscle: 'lats', secondaryMuscles: ['traps'],
    } as never)
  })

  it('seed local: usa muscles[] y groupMain del registro', async () => {
    const r = await buildMuscleResolver({})
    expect(r.muscleOf('ex-row')).toEqual({ primary: { name: 'dorsal' }, secondary: [{ name: 'trapecio' }] })
    expect(r.sourceOf('ex-row')).toBe('seed')
    expect(r.nameOf('ex-row')).toBe('Remo con barra')
  })

  it('ejercicio personalizado: usa su músculo declarado', async () => {
    const r = await buildMuscleResolver({})
    expect(r.muscleOf('custom/tiron-mio')).toEqual({ primary: { name: 'lats', pct: 70 }, secondary: [{ name: 'traps', pct: 30 }] })
    expect(r.sourceOf('custom/tiron-mio')).toBe('custom')
    expect(r.nameOf('custom/tiron-mio')).toBe('Tirón mío')
  })

  it('biblioteca: deduce el primario del id "muscle/slug" sin depender del nombre', async () => {
    const r = await buildMuscleResolver({})
    expect(r.muscleOf('lats/remo-con-barra')).toEqual({ primary: { name: 'lats' }, secondary: [] })
    expect(r.sourceOf('lats/remo-con-barra')).toBe('library')
    expect(r.nameOf('lats/remo-con-barra')).toBe('remo con barra')
  })

  it('desconocido: null en las tres consultas (no se inventa nada)', async () => {
    const r = await buildMuscleResolver({})
    expect(r.muscleOf('ejercicio-que-no-existe')).toBeNull()
    expect(r.sourceOf('ejercicio-que-no-existe')).toBeNull()
    expect(r.nameOf('ejercicio-que-no-existe')).toBeNull()
  })
})
