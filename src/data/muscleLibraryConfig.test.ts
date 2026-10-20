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

  test('dentro de un mismo nivel no hay priorización: orden alfabético estable', () => {
    const exercises = [
      { name: 'sentadilla', exerciseDifficulty: 'principiante' },
      { name: 'press de pecho', exerciseDifficulty: 'principiante' },
      { name: 'fondos', exerciseDifficulty: 'intermedio' },
      { name: 'remo con mancuerna', exerciseDifficulty: 'intermedio' },
      { name: 'press overhead', exerciseDifficulty: 'avanzado' },
      { name: 'curl de triceps', exerciseDifficulty: 'avanzado' },
    ]

    // Dentro del mismo nivel se ordena alfabéticamente, no por prioridad del grupo.
    const sorted = sortMuscleLibraryExercises(exercises, 'piernas')
    expect(sorted.map(e => e.name)).toEqual([
      'press de pecho',   // principiante (alfabético antes que sentadilla)
      'sentadilla',       // principiante
      'fondos',           // intermedio
      'remo con mancuerna', // intermedio
      'curl de triceps',  // avanzado
      'press overhead',   // avanzado
    ])
  })

  test('sin prioritarios, ordena por nivel: principiante, intermedio y avanzado', () => {
    const exercises = [
      { name: 'ejercicioDifícil', exerciseDifficulty: 'avanzado' },
      { name: 'ejercicioFácil', exerciseDifficulty: 'principiante' },
      { name: 'ejercicioMedio', exerciseDifficulty: 'intermedio' },
    ]

    // El nivel ordena igual en todos los grupos: no depende del grupo elegido.
    for (const group of MUSCLE_LIBRARY_GROUPS) {
      const names = sortMuscleLibraryExercises(exercises, group.id).map(e => e.name)
      expect(names).toEqual(['ejercicioFácil', 'ejercicioMedio', 'ejercicioDifícil'])
    }
  })

  test('acepta niveles en inglés y trata un nivel ausente como intermedio', () => {
    // Nombres elegidos para que el orden alfabético NO coincida con el de nivel.
    const exercises = [
      { name: 'Ejercicio Alfa', level: 'advanced' },
      { name: 'Ejercicio Mu' },
      { name: 'Ejercicio Zeta', difficulty: 'beginner' },
    ]

    expect(sortMuscleLibraryExercises(exercises, 'core').map(e => e.name))
      .toEqual(['Ejercicio Zeta', 'Ejercicio Mu', 'Ejercicio Alfa'])
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