// TRAINING METHODS DATABASE — Conocimiento completo de cada método
import type { TrainingMethod, TrainingMethodId, MethodCategory } from './trainingMethods'

export const TRAINING_METHODS: TrainingMethod[] = [
  // ═══════════════════════════════════════════════════
  // 1. FUERZA MÁXIMA
  // ═══════════════════════════════════════════════════
  {
    id: 'strength',
    name: 'Maximal Strength',
    nameEs: 'Fuerza Máxima',
    category: 'anaerobic',
    description: 'Training focused on maximal force production through heavy loads and low repetitions.',
    descriptionEs: 'Entrenamiento orientado a producir la mayor fuerza posible mediante cargas altas y pocas repeticiones.',
    defaults: {
      setsPerExercise: 4,
      repsRange: [1, 6],
      restSeconds: 180,
      intensityPercent: [85, 100],
      rpeRange: [8, 10],
      tempo: 'controlled',
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 4,
      minSessionMinutes: 45,
      requiredEquipment: ['barbell', 'dumbbell'],
      technicalDemand: 'high',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'high',
    },
    suitability: {
      goals: ['strength', 'general_health'],
      bestFor: ['Usuarios intermedios-avanzados con objetivo principal de fuerza', 'Deportistas que necesitan potencia'],
      avoidWhen: ['Principiantes sin técnica sólida', 'Dolor articular activo', 'Recuperación insuficiente'],
    },
    structure: {
      splitType: 'upper_lower',
      typicalFrequency: [3, 4],
      exercisesPerSession: [4, 6],
      primaryMovementPatterns: ['squat', 'hinge', 'press_horizontal', 'press_vertical', 'row'],
    },
    progression: {
      method: 'Lineal: +2.5kg tren superior, +5kg tren inferior cuando se completan todas las series',
      deloadFrequency: 4,
      descriptionEs: 'Progresión lineal con incrementos pequeños. Deload cada 4 semanas.',
    },
    exerciseSelection: {
      primaryTypes: ['compound'],
      muscleGroupPriority: ['legs', 'back', 'chest', 'shoulders'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 2. HIPERTROFIA
  // ═══════════════════════════════════════════════════
  {
    id: 'hypertrophy',
    name: 'Hypertrophy',
    nameEs: 'Hipertrofia',
    category: 'anaerobic',
    description: 'Training focused on muscle growth through moderate-to-high volume and controlled intensity.',
    descriptionEs: 'Entrenamiento orientado al crecimiento muscular mediante volumen moderado-alto e intensidad controlada.',
    defaults: {
      setsPerExercise: 3,
      repsRange: [6, 12],
      restSeconds: 90,
      intensityPercent: [65, 80],
      rpeRange: [7, 9],
      tempo: 'controlled_eccentric',
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 5,
      minSessionMinutes: 40,
      requiredEquipment: ['barbell', 'dumbbell', 'machine'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['hypertrophy', 'general_health', 'fat_loss'],
      bestFor: ['El objetivo principal es ganar masa muscular', 'Recomposición corporal', 'Mejorar la estética'],
      avoidWhen: ['Solo fuerza máxima sin volumen', 'Objetivo puramente cardiovascular'],
    },
    structure: {
      splitType: 'push_pull_legs',
      typicalFrequency: [3, 4, 5],
      exercisesPerSession: [5, 8],
      primaryMovementPatterns: ['compound', 'isolation'],
    },
    progression: {
      method: 'Undulante: variar volumen/carga semanalmente. Aumentar reps antes que peso.',
      deloadFrequency: 5,
      descriptionEs: 'Progresión ondulante. Subir reps dentro del rango antes de subir carga.',
    },
    exerciseSelection: {
      primaryTypes: ['compound', 'isolation'],
      muscleGroupPriority: ['chest', 'back', 'legs', 'shoulders', 'arms'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 3. FUERZA-RESISTENCIA
  // ═══════════════════════════════════════════════════
  {
    id: 'strength_endurance',
    name: 'Strength Endurance',
    nameEs: 'Fuerza-Resistencia',
    category: 'anaerobic',
    description: 'Training that combines moderate loads with higher repetitions to develop muscular endurance.',
    descriptionEs: 'Entrenamiento que combina cargas moderadas con repeticiones altas para desarrollar resistencia muscular.',
    defaults: {
      setsPerExercise: 3,
      repsRange: [12, 20],
      restSeconds: 60,
      intensityPercent: [50, 65],
      rpeRange: [6, 8],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 5,
      minSessionMinutes: 30,
      requiredEquipment: ['dumbbell', 'machine', 'bodyweight'],
      technicalDemand: 'low',
      cardiovascularDemand: 'medium',
      neuromuscularDemand: 'low',
    },
    suitability: {
      goals: ['general_health', 'fat_loss', 'hypertrophy'],
      bestFor: ['Principiantes que necesitan base', 'Deportes de resistencia', 'Composición corporal'],
      avoidWhen: ['Objetivo principal de fuerza máxima', 'Experiencia avanzada sin componente de resistencia'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [3, 4],
      exercisesPerSession: [6, 10],
      primaryMovementPatterns: ['compound', 'circuit'],
    },
    progression: {
      method: 'Aumentar reps antes que series. Mantener carga constante hasta completar rango alto.',
      deloadFrequency: 4,
      descriptionEs: 'Progresión por volumen de reps. Cuando se alcanza el tope del rango, subir carga ligeramente.',
    },
    exerciseSelection: {
      primaryTypes: ['compound', 'bodyweight', 'machine'],
      muscleGroupPriority: ['full_body'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 4. POTENCIA
  // ═══════════════════════════════════════════════════
  {
    id: 'power',
    name: 'Power Training',
    nameEs: 'Potencia',
    category: 'anaerobic',
    description: 'Training focused on developing explosive force and rate of force development.',
    descriptionEs: 'Entrenamiento orientado a desarrollar fuerza explosiva y velocidad de producción de fuerza.',
    defaults: {
      setsPerExercise: 4,
      repsRange: [1, 5],
      restSeconds: 180,
      intensityPercent: [70, 90],
      rpeRange: [7, 9],
    },
    requirements: {
      minExperienceLevel: 'advanced',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 3,
      minSessionMinutes: 45,
      requiredEquipment: ['barbell', 'dumbbell'],
      technicalDemand: 'high',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'high',
    },
    suitability: {
      goals: ['strength', 'general_health'],
      bestFor: ['Deportistas que necesitan explosividad', 'Atletas de competición', 'Desarrollo de potencia'],
      avoidWhen: ['Principiantes', 'Dolor articular', 'Fatiga elevada', 'Sin experiencia en movimientos olímpicos'],
    },
    structure: {
      splitType: 'upper_lower',
      typicalFrequency: [2, 3],
      exercisesPerSession: [4, 6],
      primaryMovementPatterns: ['olympic', 'explosive', 'jump', 'throw'],
    },
    progression: {
      method: 'Técnica > carga. Mantener velocidad máxima. No sacrificar calidad por peso.',
      deloadFrequency: 3,
      descriptionEs: 'Progresión basada en calidad técnica. La velocidad de ejecución es prioritaria.',
    },
    exerciseSelection: {
      primaryTypes: ['olympic', 'compound'],
      muscleGroupPriority: ['full_body'],
      avoidExercises: ['slow_isolation'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 5. RESISTENCIA CARDIOVASCULAR
  // ═══════════════════════════════════════════════════
  {
    id: 'cardio_endurance',
    name: 'Cardiovascular Endurance',
    nameEs: 'Resistencia Cardiovascular',
    category: 'aerobic',
    description: 'Training focused on improving cardiovascular capacity and aerobic endurance.',
    descriptionEs: 'Entrenamiento orientado a mejorar la capacidad cardiorrespiratoria y la resistencia aeróbica.',
    defaults: {
      setsPerExercise: 1,
      repsRange: [1, 1],
      restSeconds: 0,
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 5,
      minSessionMinutes: 20,
      requiredEquipment: ['none'],
      technicalDemand: 'low',
      cardiovascularDemand: 'high',
      neuromuscularDemand: 'low',
    },
    suitability: {
      goals: ['general_health', 'fat_loss', 'mobility'],
      bestFor: ['Mejorar salud cardiovascular', 'Base aeróbica', 'Recuperación activa'],
      avoidWhen: ['Lesión activa que impide movimiento', 'Recuperación muy baja'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [2, 3, 4, 5],
      exercisesPerSession: [1, 3],
      primaryMovementPatterns: ['locomotion', 'cycling', 'rowing', 'swimming'],
    },
    progression: {
      method: 'Aumentar duración 10% por semana. No aumentar duración e intensidad simultáneamente.',
      deloadFrequency: 4,
      descriptionEs: 'Progresión gradual de volumen. Mantener intensidad constante mientras se aumenta duración.',
    },
    exerciseSelection: {
      primaryTypes: ['cardio'],
      muscleGroupPriority: ['cardiovascular'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 6. HIIT
  // ═══════════════════════════════════════════════════
  {
    id: 'hiit',
    name: 'High-Intensity Interval Training',
    nameEs: 'Entrenamiento Interválico de Alta Intensidad',
    category: 'mixed',
    description: 'Alternating high-intensity efforts with recovery periods. NOT recommended automatically for fat loss.',
    descriptionEs: 'Alternancia de esfuerzos de alta intensidad con períodos de recuperación. NO se recomienda automáticamente para pérdida de grasa.',
    defaults: {
      setsPerExercise: 1,
      repsRange: [1, 1],
      restSeconds: 60,
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minDaysPerWeek: 1,
      maxDaysPerWeek: 3,
      minSessionMinutes: 15,
      requiredEquipment: ['none'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'high',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['fat_loss', 'general_health'],
      bestFor: ['Usuarios con buena base aeróbica', 'Cuando hay poco tiempo', 'Mejora de VO2max'],
      avoidWhen: ['Principiantes sin base aeróbica', 'Fatiga elevada', 'Lesión articular', 'Conjunto con volumen alto de fuerza sin ajuste'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [1, 2, 3],
      exercisesPerSession: [3, 6],
      primaryMovementPatterns: ['circuit', 'interval', 'bodyweight'],
    },
    progression: {
      method: 'Aumentar intensidad o número de intervalos, no ambos. Mantener relación trabajo:descanso.',
      deloadFrequency: 3,
      descriptionEs: 'Progresión por intensidad o volumen de intervalos. Nunca ambos simultáneamente.',
    },
    exerciseSelection: {
      primaryTypes: ['bodyweight', 'cardio', 'compound'],
      muscleGroupPriority: ['full_body'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 7. FUNCIONAL
  // ═══════════════════════════════════════════════════
  {
    id: 'functional',
    name: 'Functional Training',
    nameEs: 'Entrenamiento Funcional',
    category: 'mixed',
    description: 'Training based on movement patterns, coordination, stability, and real-world movement.',
    descriptionEs: 'Entrenamiento basado en patrones de movimiento, coordinación, estabilidad y movimiento del mundo real.',
    defaults: {
      setsPerExercise: 3,
      repsRange: [8, 15],
      restSeconds: 60,
      rpeRange: [6, 8],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 4,
      minSessionMinutes: 30,
      requiredEquipment: ['bodyweight', 'dumbbell'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'medium',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['general_health', 'mobility', 'fat_loss'],
      bestFor: ['Condición física general', 'Mejorar coordinación y estabilidad', 'Preparación deportiva'],
      avoidWhen: ['Objetivo puramente de hipertrofia maximal', 'Deportes de fuerza específica'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [3, 4],
      exercisesPerSession: [6, 10],
      primaryMovementPatterns: ['squat', 'hinge', 'push', 'pull', 'carry', 'locomotion', 'rotation'],
    },
    progression: {
      method: 'Complejidad progresiva: de patrones simples a combinaciones complejas.',
      deloadFrequency: 4,
      descriptionEs: 'Progresión de complejidad motora. Agregar variabilidad y demandas cognitivas.',
    },
    exerciseSelection: {
      primaryTypes: ['bodyweight', 'compound', 'unilateral'],
      muscleGroupPriority: ['full_body'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 8. MOVILIDAD
  // ═══════════════════════════════════════════════════
  {
    id: 'mobility',
    name: 'Mobility & Flexibility',
    nameEs: 'Movilidad y Flexibilidad',
    category: 'preparation',
    description: 'Training focused on range of motion, tissue quality, and movement preparation.',
    descriptionEs: 'Entrenamiento orientado a rango de movimiento, calidad tisular y preparación del movimiento.',
    defaults: {
      setsPerExercise: 2,
      repsRange: [8, 15],
      restSeconds: 30,
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 1,
      maxDaysPerWeek: 7,
      minSessionMinutes: 15,
      requiredEquipment: ['none'],
      technicalDemand: 'low',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'low',
    },
    suitability: {
      goals: ['mobility', 'general_health'],
      bestFor: ['Restricciones de movilidad', 'Recuperación', 'Preparación para entrenamiento', 'Dolor muscular leve'],
      avoidWhen: ['Lesión aguda', 'Dolor articular severo'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [2, 3, 4, 5, 6, 7],
      exercisesPerSession: [5, 15],
      primaryMovementPatterns: ['stretch', 'mobilization', 'foam_rolling', 'dynamic'],
    },
    progression: {
      method: 'Aumentar rango gradualmente. No forzar rangos dolorosos.',
      deloadFrequency: 0,
      descriptionEs: 'Sin deload específico. Progresión por rango de movimiento logrado.',
    },
    exerciseSelection: {
      primaryTypes: ['mobility', 'stretch', 'bodyweight'],
      muscleGroupPriority: ['full_body'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 9. EQUILIBRIO Y ESTABILIDAD
  // ═══════════════════════════════════════════════════
  {
    id: 'balance_stability',
    name: 'Balance & Stability',
    nameEs: 'Equilibrio y Estabilidad',
    category: 'preparation',
    description: 'Training focused on proprioception, core stability, and unilateral control.',
    descriptionEs: 'Entrenamiento orientado a propiocepción, estabilidad del core y control unilateral.',
    defaults: {
      setsPerExercise: 2,
      repsRange: [8, 12],
      restSeconds: 45,
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 1,
      maxDaysPerWeek: 3,
      minSessionMinutes: 15,
      requiredEquipment: ['none'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['mobility', 'general_health'],
      bestFor: ['Prevención de lesiones', 'Estabilidad de core', 'Control unilateral', 'Rehabilitación'],
      avoidWhen: ['Lesión activa sin supervisión', 'Fatiga extrema'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [2, 3],
      exercisesPerSession: [4, 8],
      primaryMovementPatterns: ['balance', 'core', 'unilateral'],
    },
    progression: {
      method: 'Reducir base de apoyo, agregar inestabilidad, aumentar complejidad.',
      deloadFrequency: 0,
      descriptionEs: 'Progresión por reducción de estabilidad, no por carga.',
    },
    exerciseSelection: {
      primaryTypes: ['bodyweight', 'unilateral', 'core'],
      muscleGroupPriority: ['core', 'hips', 'ankles'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 10. VELOCIDAD
  // ═══════════════════════════════════════════════════
  {
    id: 'speed',
    name: 'Speed Training',
    nameEs: 'Velocidad',
    category: 'anaerobic',
    description: 'Training focused on developing maximal movement speed and acceleration.',
    descriptionEs: 'Entrenamiento orientado a desarrollar velocidad máxima de movimiento y aceleración.',
    defaults: {
      setsPerExercise: 5,
      repsRange: [1, 5],
      restSeconds: 120,
      intensityPercent: [30, 60],
    },
    requirements: {
      minExperienceLevel: 'advanced',
      minDaysPerWeek: 1,
      maxDaysPerWeek: 3,
      minSessionMinutes: 30,
      requiredEquipment: ['none'],
      technicalDemand: 'high',
      cardiovascularDemand: 'medium',
      neuromuscularDemand: 'high',
    },
    suitability: {
      goals: ['strength', 'general_health'],
      bestFor: ['Deportistas que necesitan velocidad', 'Sprints', 'Deportes de equipo'],
      avoidWhen: ['Principiantes', 'Dolor articular', 'Sin experiencia en plyometrics'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [2, 3],
      exercisesPerSession: [4, 6],
      primaryMovementPatterns: ['sprint', 'jump', 'throw', 'acceleration'],
    },
    progression: {
      method: 'Calidad > cantidad. Mantener velocidad máxima. Parar cuando la velocidad baje >10%.',
      deloadFrequency: 2,
      descriptionEs: 'Progresión por calidad de ejecución. La velocidad debe ser máxima en cada rep.',
    },
    exerciseSelection: {
      primaryTypes: ['plyometric', 'sprint', 'bodyweight'],
      muscleGroupPriority: ['legs', 'core'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 11. FULL BODY (estructura)
  // ═══════════════════════════════════════════════════
  {
    id: 'full_body',
    name: 'Full Body Training',
    nameEs: 'Cuerpo Completo',
    category: 'structure',
    description: 'Training structure that trains all major muscle groups each session.',
    descriptionEs: 'Estructura de entrenamiento que trabaja todos los grupos musculares principales en cada sesión.',
    defaults: {
      setsPerExercise: 3,
      repsRange: [6, 12],
      restSeconds: 90,
      rpeRange: [7, 9],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 5,
      minSessionMinutes: 30,
      requiredEquipment: ['barbell', 'dumbbell'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['strength', 'hypertrophy', 'general_health', 'fat_loss'],
      bestFor: ['Pocos días disponibles (2-3)', 'Principiantes', 'Objetivos generales', 'Frecuencia elevada por músculo'],
      avoidWhen: ['Avanzado con objetivos muy específicos', 'Necesidad de volumen muy alto por grupo muscular'],
    },
    structure: {
      splitType: 'full_body',
      typicalFrequency: [2, 3, 4],
      exercisesPerSession: [5, 8],
      primaryMovementPatterns: ['squat', 'hinge', 'press', 'row', 'carry'],
    },
    progression: {
      method: 'Similar a hipertrofia/fuerza según objetivo. Deload cada 4-5 semanas.',
      deloadFrequency: 4,
      descriptionEs: 'Progresión según el objetivo principal del usuario.',
    },
    exerciseSelection: {
      primaryTypes: ['compound'],
      muscleGroupPriority: ['legs', 'back', 'chest', 'shoulders', 'core'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 12. TORSO-PIERNAS (estructura)
  // ═══════════════════════════════════════════════════
  {
    id: 'torso_legs',
    name: 'Torso-Legs Split',
    nameEs: 'Torso-Piernas',
    category: 'structure',
    description: 'Training structure splitting the body into torso and legs sessions.',
    descriptionEs: 'Estructura que separa el entrenamiento en sesiones de torso y piernas.',
    defaults: {
      setsPerExercise: 3,
      repsRange: [6, 12],
      restSeconds: 90,
      rpeRange: [7, 9],
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minDaysPerWeek: 2,
      maxDaysPerWeek: 4,
      minSessionMinutes: 40,
      requiredEquipment: ['barbell', 'dumbbell'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['hypertrophy', 'strength'],
      bestFor: ['4 días/semana', 'Objetivo principal de hipertrofia', 'Experiencia intermedia-avanzada'],
      avoidWhen: ['Pocos días disponibles (<3)', 'Principiantes sin base'],
    },
    structure: {
      splitType: 'upper_lower',
      typicalFrequency: [4],
      exercisesPerSession: [5, 8],
      primaryMovementPatterns: ['compound', 'isolation'],
    },
    progression: {
      method: 'Alternar días torso/pierna. Progresión ondulante entre sesiones.',
      deloadFrequency: 5,
      descriptionEs: 'Progresión alternando el foco entre torso y piernas.',
    },
    exerciseSelection: {
      primaryTypes: ['compound', 'isolation'],
      muscleGroupPriority: ['alternating'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 13. WEIDER / DIVISIÓN POR GRUPOS (estructura)
  // ═══════════════════════════════════════════════════
  {
    id: 'weider_split',
    name: 'Weider / Body Part Split',
    nameEs: 'Weider / División por Grupos Musculares',
    category: 'structure',
    description: 'Training structure targeting specific muscle groups each session (classic bodybuilding split).',
    descriptionEs: 'Estructura que enfoca grupos musculares específicos en cada sesión (división clásica de culturismo).',
    defaults: {
      setsPerExercise: 4,
      repsRange: [8, 12],
      restSeconds: 90,
      intensityPercent: [65, 80],
      rpeRange: [7, 9],
    },
    requirements: {
      minExperienceLevel: 'advanced',
      minDaysPerWeek: 4,
      maxDaysPerWeek: 6,
      minSessionMinutes: 50,
      requiredEquipment: ['barbell', 'dumbbell', 'machine'],
      technicalDemand: 'medium',
      cardiovascularDemand: 'low',
      neuromuscularDemand: 'medium',
    },
    suitability: {
      goals: ['hypertrophy'],
      bestFor: ['Avanzados con alta disponibilidad', 'Objetivo principal de hipertrofia', 'Volumen alto por músculo'],
      avoidWhen: ['Principiantes', 'Pocos días (<4)', 'Objetivo de fuerza máxima'],
    },
    structure: {
      splitType: 'body_part',
      typicalFrequency: [5, 6],
      exercisesPerSession: [4, 6],
      primaryMovementPatterns: ['compound', 'isolation'],
    },
    progression: {
      method: 'Volumen progresivo por grupo muscular. Deload cada 5-6 semanas.',
      deloadFrequency: 5,
      descriptionEs: 'Progresión de volumen específico por grupo muscular.',
    },
    exerciseSelection: {
      primaryTypes: ['compound', 'isolation', 'machine'],
      muscleGroupPriority: ['focused'],
    },
  },
]

/** Buscar método por ID */
export function getMethod(id: TrainingMethodId): TrainingMethod | undefined {
  return TRAINING_METHODS.find(m => m.id === id)
}

/** Obtener todos los métodos de una categoría */
export function getMethodsByCategory(category: MethodCategory): TrainingMethod[] {
  return TRAINING_METHODS.filter(m => m.category === category)
}

/** Obtener métodos de estructura (split types) */
export function getStructureMethods(): TrainingMethod[] {
  return TRAINING_METHODS.filter(m => m.category === 'structure')
}

/** Obtener métodos de entrenamiento (no estructura) */
export function getTrainingMethods(): TrainingMethod[] {
  return TRAINING_METHODS.filter(m => m.category !== 'structure' && m.category !== 'preparation')
}
