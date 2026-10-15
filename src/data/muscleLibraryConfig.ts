import { normFold } from '@/utils/format'

export const MUSCLE_LIBRARY_GROUPS = [
  {
    id: 'piernas',
    label: 'Piernas',
    description: 'Cuádriceps, femorales, glúteos y pantorrillas',
    priorityNames: [
      'prensa', 'leg press', 'sentadilla', 'extension de piernas',
      'leg extension', 'curl femoral sentado',
      'seated leg curl', 'hip thrust',
      'elevacion de talones', 'calf raise',
      'sentadilla goblet', 'goblet squat',
    ],
  },
  {
    id: 'pecho',
    label: 'Pecho',
    description: 'Pectorales y sus variantes de trabajo',
    priorityNames: [
      'press de pecho en maquina', 'chest press',
      'press mancuernas', 'dumbbell chest press',
      'press banca', 'bench press', 'peck deck',
      'chest fly',
    ],
  },
  {
    id: 'espalda',
    label: 'Espalda',
    description: 'Dorsales, trapecio y espalda media',
    priorityNames: [
      'jalon al pecho', 'lat pulldown',
      'remo sentado', 'seated cable row',
      'remo con pecho apoyado', 'chest supported row',
      'remo con mancuerna', 'dumbbell row',
    ],
  },
  {
    id: 'core',
    label: 'Core',
    description: 'Abdominales y musculatura estabilizadora',
    priorityNames: [
      'plancha', 'plank', 'crunch',
      'dead bug', 'pallof press',
      'elevacion de rodillas', 'knee raise',
    ],
  },
  {
    id: 'hombros-y-brazos',
    label: 'Hombros y brazos',
    description: 'Deltoides, bíceps, tríceps y antebrazos',
    priorityNames: [
      'elevaciones laterales', 'lateral raise',
      'press de hombros en maquina', 'shoulder press',
      'curl de biceps', 'biceps curl',
      'extension de triceps en polea', 'triceps pushdown',
      'curl de antebrazos', 'wrist curl',
    ],
  },
] as const

const ALL_PRIORITY_NAMES = MUSCLE_LIBRARY_GROUPS.flatMap(
  group => [...group.priorityNames],
)

function difficultyRank(item: {
  exerciseDifficulty?: string
  difficulty?: string
  level?: string
}): number {
  const level = normFold(
    String(item.exerciseDifficulty ?? item.difficulty ?? item.level ?? '')
  )

  if (['principiante', 'beginner', 'easy'].includes(level)) {return 0}
  if (['intermedio', 'intermediate', 'medium'].includes(level)) {return 1}
  if (['avanzado', 'advanced', 'hard'].includes(level)) {return 2}
  return 1
}

export function sortMuscleLibraryExercises<
  T extends {
    name?: string
    exerciseDifficulty?: string
    difficulty?: string
    level?: string
  },
>(
  items: T[],
  groupId: string,
): T[] {
  const group = MUSCLE_LIBRARY_GROUPS.find(g => g.id === groupId)
  const terms = group
    ? [...group.priorityNames]
    : groupId === '__all__'
      ? ALL_PRIORITY_NAMES
      : []

  const rank = (item: T) => {
    const name = normFold(String(item.name ?? ''))
    return terms.findIndex(
      term => name.includes(normFold(term)) || normFold(term).includes(name)
    )
  }

  return [...items].sort((a, b) => {
    const priorityDifference = rank(a) - rank(b)
    if (priorityDifference !== 0) {return priorityDifference}

    const difficultyDifference = difficultyRank(a) - difficultyRank(b)
    if (difficultyDifference !== 0) {return difficultyDifference}

    // When priority and difficulty are equal, prioritized exercises come first
    // by checking if either item has a valid priority rank ( < terms.length)
    const rankA = rank(a)
    const rankB = rank(b)
    const aHasPriority = rankA < terms.length
    const bHasPriority = rankB < terms.length
    if (aHasPriority && !bHasPriority) {return -1}
    if (!aHasPriority && bHasPriority) {return 1}
    // Both have priority or both don't; fallback to alphabetical
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'es')
  })
}
