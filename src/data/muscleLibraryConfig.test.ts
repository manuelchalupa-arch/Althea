import { MUSCLE_LIBRARY_GROUPS } from '@/data/muscleLibraryConfig'

describe('Muscle Library Config', () => {
  test('existen exactamente 5 grupos', () => {
    expect(MUSCLE_LIBRARY_GROUPS).toHaveLength(5)
  })

  test('cada grupo tiene id, label y descripción', () => {
    MUSCLE_LIBRARY_GROUPS.forEach(group => {
      expect(group).toHaveProperty('id')
      expect(group).toHaveProperty('label')
      expect(group).toHaveProperty('description')
    })
  })

  test('los grupos tienen IDs únicos', () => {
    const ids = MUSCLE_LIBRARY_GROUPS.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('los ids coinciden con los del catálogo tradicional', async () => {
    const { TRADITIONAL_GROUPS } = await import('@/data/traditionalCatalog')
    expect(TRADITIONAL_GROUPS.map(g => g.id)).toEqual(MUSCLE_LIBRARY_GROUPS.map(g => g.id))
  })
})
