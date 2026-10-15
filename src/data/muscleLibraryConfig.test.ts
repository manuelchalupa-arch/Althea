import { MUSCLE_LIBRARY_GROUPS, sortMuscleLibraryExercises } from '@/data/muscleLibraryConfig'

describe('Muscle Library Config', () => {
  test('existen exactamente 5 grupos', () => {
    expect(MUSCLE_LIBRARY_GROUPS).toHaveLength(5)
  })

  test('cada grupo tiene id, label, descripción y priorityNames', () => {
    MUSCLE_LIBRARY_GROUPS.forEach(group => {
      expect(group).toHaveProperty('id')
      expect(group).toHaveProperty('label')
      expect(group).toHaveProperty('description')
      expect(group).toHaveProperty('priorityNames')
      expect(Array.isArray(group.priorityNames)).toBe(true)
      expect(group.priorityNames.length).toBeGreaterThan(0)
    })
  })

  test('los grupos tienen IDs únicos', () => {
    const ids = MUSCLE_LIBRARY_GROUPS.map(g => g.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  test('sortMuscleLibraryExercises ordena prioritarios delante de no prioritarios mismsa dificultad', () => {
    const exercises = [
      { name: 'sentadilla', exerciseDifficulty: 'principiante' },
      { name: 'press de pecho', exerciseDifficulty: 'principiante' },
      { name: 'fondos', exerciseDifficulty: 'intermedio' },
      { name: 'remo con mancuerna', exerciseDifficulty: 'intermedio' },
      { name: 'press overhead', exerciseDifficulty: 'avanzado' },
      { name: 'curl de triceps', exerciseDifficulty: 'avanzado' },
    ]

    // Priorizar piernas (sentadilla) sobre otros principiante
    const sortedLegs = sortMuscleLibraryExercises(exercises, 'piernas')
    expect(sortedLegs[0]?.name).toBe('sentadilla')

    // Priorizar pecho (press) sobre otros principiante
    const sortedChest = sortMuscleLibraryExercises(exercises, 'pecho')
    expect(sortedChest[0]?.name).toBe('press de pecho')
  })

  test('niveles principiante, intermedio y avanzado', () => {
    const exercises = [
      { name: 'ejercicioFácil', exerciseDifficulty: 'principiante' },
      { name: 'ejercicioMedio', exerciseDifficulty: 'intermedio' },
      { name: 'ejercicioDifícil', exerciseDifficulty: 'avanzado' },
    ]

    const principio = sortMuscleLibraryExercises(exercises, 'core')
    expect(principio[0]?.name).toBe('ejercicioFácil')

    const intermedio = sortMuscleLibraryExercises(exercises, 'pecho')
    expect(intermedio[0]?.name).toBe('ejercicioMedio')

    const advanced = sortMuscleLibraryExercises(exercises, 'hombros-y-brazos')
    expect(advanced[0]?.name).toBe('ejercicioDifícil')
  })

  test('agrupa ejercicios por categoría y mantiene orden alfabético de desempate', () => {
    const exercises = [
      { name: 'Z press', exerciseDifficulty: 'intermedio' },
      { name: 'A press', exerciseDifficulty: 'intermedio' },
      { name: 'M press', exerciseDifficulty: 'intermedio' },
    ]

    const sorted = sortMuscleLibraryExercises(exercises, 'hombros-y-brazos')
    expect(sorted).toHaveLength(3)
    // El orden alfabético debe ser consistente
    expect(sorted[0]?.name).toBe('A press')
  })
})