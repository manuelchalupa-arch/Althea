// NUTRITION METHODS DATABASE — Conocimiento completo de cada estrategia nutricional
import type { NutritionMethod, NutritionMethodId, NutritionCategory } from './nutritionMethods'

export const NUTRITION_METHODS: NutritionMethod[] = [
  // ═══════════════════════════════════════════════════
  // 1. PATRÓN MEDITERRÁNEO
  // ═══════════════════════════════════════════════════
  {
    id: 'mediterranean',
    name: 'Mediterranean Pattern',
    nameEs: 'Patrón Mediterráneo',
    category: 'pattern',
    description: 'Plant-based predominant pattern with olive oil, fish, legumes, whole grains, and moderate dairy.',
    descriptionEs: 'Patrón predominantemente vegetal con aceite de oliva, pescado, legumbres, cereales integrales y lácteos moderados.',
    characteristics: {
      energyApproach: 'Balance energético flexible, sin restricciones extremas',
      proteinStrategy: 'Proteínas de calidad: pescado, legumbres, huevos, lácteos, carnes blancas con moderación',
      carbStrategy: 'Carbohidratos complejos predominantes: cereales integrales, frutas, verduras',
      fatStrategy: 'Grasas monoinsaturadas predominantes: aceite de oliva, frutos secos, pescado',
      mealFrequency: '3-5 comidas al día, incluyendo snacksi necesario',
      timingRelevance: 'Moderada — alimentación regular sin restricciones horarias estrictas',
      restrictions: [],
      key_foods: ['aceite de oliva', 'pescado', 'legumbres', 'cereales integrales', 'frutas', 'verduras', 'frutos secos'],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minAdherenceHistory: 0,
      requiredContext: [],
      contraindications: ['alergia a frutos secos (sin adaptación)', 'restricción severa de grasas'],
    },
    suitability: {
      goals: ['health', 'maintenance', 'fat_loss', 'recomposition'],
      trainingTypes: ['strength', 'hypertrophy', 'endurance', 'functional', 'mixed', 'general'],
      bestFor: ['Usuarios que buscan alimentación equilibrada y sostenible', 'Salud cardiovascular', 'Prevención'],
      avoidWhen: ['Restricciones severas de grasas', 'Cetogé stricta'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.2, 1.6],
      carbPercentage: [40, 55],
      fatPercentage: [30, 40],
      mealFrequency: [3, 5],
    },
    evidence: {
      level: 'strong',
      sources: ['Estruch R et al. NEJM 2018 (PREDIMED)', 'Casas R et al. Adv Nutr 2016'],
      notesEs: 'Amplia evidencia en salud cardiovascular, antiinflamatoria y longevidad.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Aumentar proteína a 1.6-2.0 g/kg, timing post-entreno', proteinModifier: 1.2 },
      hypertrophy: { adjustments: 'Superávit moderado + proteína 1.6-2.2 g/kg', calorieModifier: 1.1, proteinModifier: 1.3 },
      endurance: { adjustments: 'Mantener carbohidratos altos, hidratación', calorieModifier: 1.15 },
      hiit: { adjustments: 'Carbohidratos alrededor del entrenamiento', calorieModifier: 1.1 },
      functional: { adjustments: 'Sin cambios significativos', calorieModifier: 1.05 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: [],
      warnings: ['Alergia a frutos secos requiere sustitución', 'Alergia a mariscos requiere sustitución de pescado'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 2. DIETA DASH
  // ═══════════════════════════════════════════════════
  {
    id: 'dash',
    name: 'DASH Diet',
    nameEs: 'Dieta DASH',
    category: 'pattern',
    description: 'Dietary approach focused on fruits, vegetables, whole grains, lean proteins, and sodium reduction.',
    descriptionEs: 'Enfoque dietético enfocado en frutas, verduras, cereales integrales, proteínas magras y reducción de sodio.',
    characteristics: {
      energyApproach: 'Balance energético con énfasis en calidad',
      proteinStrategy: 'Proteínas magras: pollo, pescado, legumbres, lácteos bajos en grasa',
      carbStrategy: 'Carbohidratos complejos: cereales integrales, frutas, verduras',
      fatStrategy: 'Grasas limitadas, preferencia monoinsaturadas',
      mealFrequency: '4-5 comidas al día',
      timingRelevance: 'Baja — enfoque en calidad general',
      restrictions: ['sodio reducido'],
      key_foods: ['frutas', 'verduras', 'cereales integrales', 'proteínas magras', 'lácteos bajos en grasa'],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minAdherenceHistory: 0,
      requiredContext: [],
      contraindications: ['Restricción severa de lácteos (sin adaptación)'],
    },
    suitability: {
      goals: ['health', 'maintenance'],
      trainingTypes: ['strength', 'hypertrophy', 'endurance', 'functional', 'mixed', 'general'],
      bestFor: ['Salud cardiovascular', 'Presión arterial alta', 'Bienestar general'],
      avoidWhen: ['Objetivo principal es rendimiento deportivo extremo'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.0, 1.4],
      carbPercentage: [45, 55],
      fatPercentage: [25, 35],
      mealFrequency: [4, 5],
    },
    evidence: {
      level: 'strong',
      sources: ['Sacks FM et al. NEJM 2001', 'Appel LJ et al. NEJM 1997'],
      notesEs: 'Evidencia sólida para reducción de presión arterial y salud cardiovascular.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Incrementar proteína magra', proteinModifier: 1.3 },
      hypertrophy: { adjustments: 'Aumentar calorías y proteína para hipertrofia', calorieModifier: 1.15, proteinModifier: 1.4 },
      endurance: { adjustments: 'Mantener carbohidratos suficientes', calorieModifier: 1.1 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: [],
      warnings: ['No sustituye tratamiento médico para hipertensión'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 3. AYUNO INTERMITENTE
  // ═══════════════════════════════════════════════════
  {
    id: 'intermittent_fasting',
    name: 'Intermittent Fasting',
    nameEs: 'Ayuno Intermitente',
    category: 'distribution',
    description: 'Time-restricted eating pattern, not a nutritional category per se.',
    descriptionEs: 'Patrón de restricción temporal de ingesta, no una categoría nutricional completa por sí misma.',
    characteristics: {
      energyApproach: 'Restricción temporal de ventana alimentaria (16:8, 18:6, etc.)',
      proteinStrategy: 'Distribuir proteína dentro de la ventana alimentaria, priorizar cantidad total',
      carbStrategy: 'Depende del patrón alimentario subyacente',
      fatStrategy: 'Depende del patrón alimentario subyacente',
      mealFrequency: '2-3 comidas dentro de la ventana',
      timingRelevance: 'Alta — la ventana temporal es la herramienta central',
      restrictions: ['ventana alimentaria limitada'],
      key_foods: [],
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minAdherenceHistory: 30,
      requiredContext: ['horarios de entrenamiento', 'hábitos de sueño', ' tolerancia al hambre'],
      contraindications: ['trastornos de conducta alimentaria', 'diabetes sin supervisión', 'embarazo', 'lactancia'],
    },
    suitability: {
      goals: ['fat_loss', 'maintenance', 'health'],
      trainingTypes: ['strength', 'hypertrophy', 'functional', 'mixed'],
      bestFor: ['Usuarios con experiencia que prefieren menos comidas', 'Simplificación de la rutina alimentaria'],
      avoidWhen: ['Principiantes en nutrición', 'Entrenamiento de alta frecuencia sin adaptación', 'Alto volumen de entrenamiento'],
    },
    defaults: {
      calorieModifier: 0.95,
      proteinPerKg: [1.4, 2.0],
      carbPercentage: [30, 50],
      fatPercentage: [25, 40],
      mealFrequency: [2, 3],
    },
    evidence: {
      level: 'moderate',
      sources: ['Cienfuegos S et al. Cell Metab 2022', 'Wilkinson MJ et al. Cell Metab 2020'],
      notesEs: 'Evidencia moderada. Puede ser efectivo pero no superior a otras estrategias calóricas equilibradas.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Asegurar proteína suficiente en ventana, timing post-entreno', proteinModifier: 1.2 },
      hypertrophy: { adjustments: 'Ventana más amplia para distribuir proteína, superávit en ventana', calorieModifier: 1.1 },
      endurance: { adjustments: 'Pre-entreno dentro de ventana, hidratación', calorieModifier: 1.1 },
      hiit: { adjustments: 'No ayunar antes de HIIT intenso', calorieModifier: 1.05 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: ['diabéticos', 'embarazadas', 'personas con TCA'],
      warnings: ['No es superior a otras estrategias calóricas', 'Puede dificultar alcance de proteína suficiente', 'Evaluar adherencia real'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 4. DIETA CETOGÉNICA
  // ═══════════════════════════════════════════════════
  {
    id: 'keto',
    name: 'Ketogenic Diet',
    nameEs: 'Dieta Cetogénica',
    category: 'restrictive',
    description: 'Very low carbohydrate, high fat diet that induces ketosis.',
    descriptionEs: 'Dieta muy baja en carbohidratos y alta en grasas que induce cetosis.',
    characteristics: {
      energyApproach: 'Restricción severa de carbohidratos (<50g/día)',
      proteinStrategy: 'Proteína moderada (no excesiva para evitar gluconeogénesis)',
      carbStrategy: 'Extremadamente baja: verduras bajo en carbo, frutos secos, semillas',
      fatStrategy: 'Alta: aceites, aguacate, mantequilla, grasas animales',
      mealFrequency: '2-4 comidas, dependiendo de saciedad',
      timingRelevance: 'Moderada — la consistencia de la restricción es clave',
      restrictions: ['carbohidratos muy bajos', 'frutas (limitadas)', 'cereales (eliminados)', 'legumbres (eliminadas)'],
      key_foods: ['aguacate', 'aceite de oliva', 'huevos', 'pescado', 'carnes', 'frutos secos'],
    },
    requirements: {
      minExperienceLevel: 'advanced',
      minAdherenceHistory: 90,
      requiredContext: ['análisis de sangre previo', 'conocimiento nutricional', 'entorno controlado'],
      contraindications: ['diabetes tipo 1 sin supervisión', 'enfermedad renal', 'embarazo', 'trastornos pancreáticos', 'porfiria'],
    },
    suitability: {
      goals: ['fat_loss'],
      trainingTypes: ['strength', 'functional'],
      bestFor: ['Pérdida de grasa en contexto controlado', 'Epilepsia (uso clínico)', 'Algunos casos de resistencia a insulina'],
      avoidWhen: ['Entrenamiento de alta intensidad frecuente', 'Deportes de alto rendimiento con alto componente glucolítico', 'Principiantes'],
    },
    defaults: {
      calorieModifier: 0.9,
      proteinPerKg: [1.2, 1.6],
      carbPercentage: [2, 5],
      fatPercentage: [65, 80],
      mealFrequency: [2, 4],
    },
    evidence: {
      level: 'limited',
      sources: ['Bueno NB et al. Br J Nutr 2013', 'Volek JS et al. Metabolism 2016'],
      notesEs: 'Evidencia limitada para uso deportivo. Puede afectar rendimiento en alta intensidad. Uso clínico bien establecido.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Mantener proteína, evaluar rendimiento', calorieModifier: 1.0 },
      hypertrophy: { adjustments: 'Difícil en cetosis estricta — considerar cyclical keto', calorieModifier: 1.1 },
      endurance: { adjustments: 'Adaptación prolongada requerida, riesgo de bajo rendimiento', calorieModifier: 1.0 },
      hiit: { adjustments: 'Rendimiento glucolítico comprometido — no recomendable en keto estricto' },
    },
    safety: {
      requiresSupervision: true,
      riskGroups: ['diabéticos', 'renales', 'pancreáticos', 'embarazadas'],
      warnings: ['Requiere supervisión profesional', 'Puede causar deficiencias', 'No recomendable para alto rendimiento deportivo', 'Keto flu inicial'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 5. DIETA VEGANA
  // ═══════════════════════════════════════════════════
  {
    id: 'vegan',
    name: 'Vegan Diet',
    nameEs: 'Dieta Vegana',
    category: 'pattern',
    description: 'Fully plant-based diet requiring careful planning for key nutrients.',
    descriptionEs: 'Dieta completamente basada en plantas que requiere planificación cuidadosa de nutrientes clave.',
    characteristics: {
      energyApproach: 'Basada en plantas, sin productos animales',
      proteinStrategy: 'Combinación de legumbres, tofu, tempeh, seitan, quinoa, proteínas vegetales',
      carbStrategy: 'Amplia variedad: cereales, legumbres, frutas, verduras, tubérculos',
      fatStrategy: 'Aceites vegetales, frutos secos, semillas, aguacate',
      mealFrequency: '4-5 comidas para asegurar suficiente energía y proteína',
      timingRelevance: 'Moderada — importante distribuir proteína',
      restrictions: ['todos los productos animales'],
      key_foods: ['legumbres', 'tofu', 'tempeh', 'seitan', 'quinoa', 'frutos secos', 'semillas'],
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minAdherenceHistory: 60,
      requiredContext: ['conocimiento de fuentes proteicas vegetales', 'planificación de suplementación'],
      contraindications: ['alergias a múltiples fuentes vegetales proteicas'],
    },
    suitability: {
      goals: ['health', 'maintenance', 'fat_loss', 'recomposition'],
      trainingTypes: ['strength', 'hypertrophy', 'endurance', 'functional', 'mixed'],
      bestFor: ['Usuarios con preferencia ética/ambiental', 'Quienes buscan alimentación basada en plantas'],
      avoidWhen: ['Sin planificación adecuada', 'Sin suplementación de B12'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.4, 2.0],
      carbPercentage: [45, 60],
      fatPercentage: [20, 35],
      mealFrequency: [4, 5],
    },
    evidence: {
      level: 'moderate',
      sources: ['Position of ADA 2016', 'Craig WJ et al. J Am Diet Assoc 2009'],
      notesEs: 'Adecuada para todas las etapas de vida con planificación. Requiere B12, evaluar hierro, omega-3, calcio, vitamina D.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Proteína 1.6-2.2 g/kg, combinación de fuentes, creatina opcional', proteinModifier: 1.3 },
      hypertrophy: { adjustments: 'Superávit con densidad calórica vegetal, timing proteico', calorieModifier: 1.1, proteinModifier: 1.4 },
      endurance: { adjustments: 'Carbohidratos abundantes, hierro, B12', calorieModifier: 1.15 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: ['embarazadas', 'niños', 'adultos mayores'],
      warnings: ['Suplementar B12 obligatoriamente', 'Evaluar hierro, omega-3, calcio, vitamina D', 'Proteína completa requiere combinación'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 6. DIETA PALEO
  // ═══════════════════════════════════════════════════
  {
    id: 'paleo',
    name: 'Paleolithic Diet',
    nameEs: 'Dieta Paleolítica',
    category: 'pattern',
    description: 'Based on presumed ancestral eating patterns, eliminating processed foods, grains, and legumes.',
    descriptionEs: 'Basada en patrones alimentarios ancestrales presuntos, eliminando alimentos procesados, cereales y legumbres.',
    characteristics: {
      energyApproach: 'Sin conteo calórico explícito, basado en saciedad',
      proteinStrategy: 'Carnes, pescados, huevos',
      carbStrategy: 'Frutas, verduras, tubérculos — sin cereales ni legumbres',
      fatStrategy: 'Grasas animales, aceite de coco, aguacate, frutos secos',
      mealFrequency: '3-4 comidas',
      timingRelevance: 'Baja',
      restrictions: ['cereales', 'legumbres', 'lácteos', 'alimentos procesados', 'azúcares refinados'],
      key_foods: ['carnes', 'pescados', 'huevos', 'frutas', 'verduras', 'frutos secos'],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minAdherenceHistory: 0,
      requiredContext: [],
      contraindications: ['Restricciones económicas severas (carnes)', 'Alergia a nueces sin alternativas'],
    },
    suitability: {
      goals: ['fat_loss', 'health'],
      trainingTypes: ['strength', 'functional', 'hypertrophy'],
      bestFor: ['Eliminación de ultraprocesados', 'Simplificación'],
      avoidWhen: ['Necesidad de carbohidratos altos (endurance)', 'Restricciones económicas'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.4, 2.0],
      carbPercentage: [20, 35],
      fatPercentage: [35, 50],
      mealFrequency: [3, 4],
    },
    evidence: {
      level: 'limited',
      sources: ['Cordain L et al. Am J Clin Nutr 2000', 'Manheimer EW et al. J Am Heart Assoc 2015'],
      notesEs: 'Evidencia limitada. Puede mejorar composición corporal pero restricción de cereales/legumbres no está respaldada.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Adecuado para fuerza', calorieModifier: 1.0 },
      hypertrophy: { adjustments: 'Superávit con densidad calórica de carnes/frutos secos', calorieModifier: 1.1 },
      endurance: { adjustments: 'Difícil por baja disponibilidad de carbohidratos', calorieModifier: 1.1 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: [],
      warnings: ['Nivel de evidencia bajo comparado con patrón mediterráneo', 'Restrictiva — evaluar adherencia'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 7. DIETA FLEXITARIANA
  // ═══════════════════════════════════════════════════
  {
    id: 'flexitarian',
    name: 'Flexitarian Diet',
    nameEs: 'Dieta Flexitariana',
    category: 'pattern',
    description: 'Predominantly plant-based with flexible inclusion of animal proteins.',
    descriptionEs: 'Predominantemente vegetal con inclusión flexible de proteínas animales.',
    characteristics: {
      energyApproach: 'Flexible, basada en calidad de alimentos',
      proteinStrategy: 'Principalmente vegetal + inclusión flexible de carne, pescado, huevos, lácteos',
      carbStrategy: 'Complejos: cereales integrales, legumbres, frutas, verduras',
      fatStrategy: 'Variada: aceites vegetales, frutos secos, grasas animales moderadas',
      mealFrequency: '3-5 comidas',
      timingRelevance: 'Baja',
      restrictions: [],
      key_foods: ['legumbres', 'cereales integrales', 'frutas', 'verduras', 'huevos', 'pescado'],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minAdherenceHistory: 0,
      requiredContext: [],
      contraindications: [],
    },
    suitability: {
      goals: ['health', 'fat_loss', 'recomposition', 'maintenance'],
      trainingTypes: ['strength', 'hypertrophy', 'endurance', 'functional', 'mixed', 'general'],
      bestFor: ['Usuarios que quieren más vegetales sin eliminar todo', 'Sostenibilidad alta', 'Familias'],
      avoidWhen: ['Necesidad de patrón 100% vegetal por razones éticas'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.2, 1.8],
      carbPercentage: [40, 55],
      fatPercentage: [25, 35],
      mealFrequency: [3, 5],
    },
    evidence: {
      level: 'moderate',
      sources: ['Tonstad S et al. Diabetes Care 2009', 'Position of Dietitians of Canada 2019'],
      notesEs: 'Buena evidencia para salud general y composición corporal. Flexible y sostenible.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Incrementar proteína animal cuando se necesita', proteinModifier: 1.2 },
      hypertrophy: { adjustments: 'Proteína 1.6-2.0 g/kg, incluir fuentes animales en cada comida', calorieModifier: 1.1, proteinModifier: 1.3 },
      endurance: { adjustments: 'Carbohidratos abundantes de fuentes vegetales', calorieModifier: 1.1 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: [],
      warnings: [],
    },
  },

  // ═══════════════════════════════════════════════════
  // 8. WHOLE30
  // ═══════════════════════════════════════════════════
  {
    id: 'whole30',
    name: 'Whole30',
    nameEs: 'Whole30',
    category: 'restrictive',
    description: '30-day restrictive elimination protocol.',
    descriptionEs: 'Protocolo de eliminación restrictivo de 30 días.',
    characteristics: {
      energyApproach: 'Sin conteo calórico, eliminación de grupos alimentarios',
      proteinStrategy: 'Carnes, pescados, huevos',
      carbStrategy: 'Frutas, verduras — sin cereales, azúcar, legumbres',
      fatStrategy: 'Grasas naturales, aceites',
      mealFrequency: '3 comidas al día, sin snacks',
      timingRelevance: 'Baja',
      restrictions: ['azúcar', 'cereales', 'legumbres', 'lácteos', 'alcohol', 'aditivos'],
      key_foods: ['carnes', 'pescados', 'huevos', 'frutas', 'verduras'],
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minAdherenceHistory: 60,
      requiredContext: ['compromiso de 30 días', 'entorno controlado'],
      contraindications: ['TCA', 'diabetes', 'embarazo', 'restricciones médicas'],
    },
    suitability: {
      goals: ['health'],
      trainingTypes: ['strength', 'functional'],
      bestFor: ['Identificación de sensibilidades alimentarias', 'Reset hábitos'],
      avoidWhen: ['Uso a largo plazo', 'Alto volumen de entrenamiento', 'Principiantes'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.4, 2.0],
      carbPercentage: [25, 40],
      fatPercentage: [35, 50],
      mealFrequency: [3, 3],
    },
    evidence: {
      level: 'insufficient',
      sources: [],
      notesEs: 'Sin evidencia científica publicada. Protocolo comercial temporal.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Mantener proteína, evaluar energía', calorieModifier: 1.0 },
      hypertrophy: { adjustments: 'Difícil — restricciones limitan densidad calórica', calorieModifier: 1.1 },
    },
    safety: {
      requiresSupervision: true,
      riskGroups: ['TCA', 'diabéticos', 'embarazadas'],
      warnings: ['Protocolo temporal, no permanent', 'Sin evidencia científica', 'Puede ser psicológicamente estresante'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 9. ALTA EN PROTEÍNAS
  // ═══════════════════════════════════════════════════
  {
    id: 'high_protein',
    name: 'High Protein Strategy',
    nameEs: 'Estrategia Alta en Proteínas',
    category: 'macronutrient',
    description: 'Emphasis on higher protein intake for body composition and recovery.',
    descriptionEs: 'Énfasis en mayor ingesta proteica para composición corporal y recuperación.',
    characteristics: {
      energyApproach: 'Flexible, con énfasis en proteína como prioridad',
      proteinStrategy: '2.0-3.0 g/kg según objetivo, distribuida en 4-6 comidas',
      carbStrategy: 'Según patrón alimentario base — no necesariamente restrictivo',
      fatStrategy: 'Según patrón alimentario base',
      mealFrequency: '4-6 comidas para distribuir proteína',
      timingRelevance: 'Alta — distribución y timing de proteína importan',
      restrictions: [],
      key_foods: ['carnes magras', 'pescado', 'huevos', 'lácteos', 'legumbres', 'proteínas en polvo'],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minAdherenceHistory: 0,
      requiredContext: [],
      contraindications: ['enfermedad renal preexistente'],
    },
    suitability: {
      goals: ['fat_loss', 'muscle_gain', 'recomposition', 'performance'],
      trainingTypes: ['strength', 'hypertrophy', 'hiit', 'functional', 'mixed'],
      bestFor: ['Pérdida de grasa con preservación muscular', 'Hipertrofia', 'Recuperación', 'Rendimiento'],
      avoidWhen: ['Restricciones renales', 'Vegetarianismo estricto sin planificación'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [2.0, 3.0],
      carbPercentage: [30, 50],
      fatPercentage: [20, 35],
      mealFrequency: [4, 6],
    },
    evidence: {
      level: 'strong',
      sources: ['Phillips SM et al. J Sports Sci 2016', 'Helms ER et al. JISSN 2014', 'Leidy HJ et al. Adv Nutr 2015'],
      notesEs: 'Amplia evidencia para composición corporal, saciedad y rendimiento.',
    },
    trainingAdaptation: {
      strength: { adjustments: '2.0-2.4 g/kg, timing post-entreno', proteinModifier: 1.0 },
      hypertrophy: { adjustments: '2.0-2.6 g/kg, distribución uniforme, timing post-entreno', proteinModifier: 1.1 },
      hiit: { adjustments: '2.0-2.4 g/kg, recuperación', proteinModifier: 1.0 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: ['enfermedad renal'],
      warnings: ['No asumir que más proteína siempre es mejor', 'Evaluar función renal si hay dudas'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 10. PERIODIZACIÓN DE CARBOHIDRATOS
  // ═══════════════════════════════════════════════════
  {
    id: 'carb_cycling',
    name: 'Carbohydrate Periodization',
    nameEs: 'Periodización de Carbohidratos',
    category: 'distribution',
    description: 'Varies carbohydrate intake based on training demand.',
    descriptionEs: 'Varía la ingesta de carbohidratos según la demanda de entrenamiento.',
    characteristics: {
      energyApproach: 'Carbos altos en días de entrenamiento intenso, bajos en descanso',
      proteinStrategy: 'Constante alta a lo largo de la semana',
      carbStrategy: 'Variable: alto (5-7 g/kg) en días de alta demanda, bajo (2-3 g/kg) en descanso',
      fatStrategy: 'Inversemente proporcional a los carbos',
      mealFrequency: '3-5 comidas',
      timingRelevance: 'Alta — los carbos se concentran alrededor del entrenamiento',
      restrictions: [],
      key_foods: ['arroz', 'avena', 'batata', 'frutas', 'legumbres'],
    },
    requirements: {
      minExperienceLevel: 'advanced',
      minAdherenceHistory: 90,
      requiredContext: ['rutina de entrenamiento estable', 'conocimiento de macros'],
      contraindications: ['Principiantes', 'Relación poco saludable con los alimentos'],
    },
    suitability: {
      goals: ['fat_loss', 'muscle_gain', 'recomposition'],
      trainingTypes: ['strength', 'hypertrophy', 'hiit'],
      bestFor: ['Atletas con entrenamiento periodizado', 'Recomposición corporal'],
      avoidWhen: ['Entrenamiento no periodizado', 'Principiantes', 'Relación poco saludable con comida'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.8, 2.4],
      carbPercentage: [30, 50],
      fatPercentage: [20, 35],
      mealFrequency: [3, 5],
    },
    evidence: {
      level: 'limited',
      sources: ['Helms ER et al. JISSN 2014'],
      notesEs: 'Evidencia limitada pero lógica fisiológica para atletas con entrenamiento periodizado.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Carbos altos en días de fuerza pesada', calorieModifier: 1.05 },
      hypertrophy: { adjustments: 'Carbos altos en días de volumen, moderados en descanso', calorieModifier: 1.1 },
      hiit: { adjustments: 'Carbos altos pre-HIIT', calorieModifier: 1.05 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: ['personas con historial de TCA'],
      warnings: ['Requiere conocimiento nutricional', 'Puede ser psicológicamente demandante'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 11. ALIMENTACIÓN ALREDEDOR DEL ENTRENAMIENTO
  // ═══════════════════════════════════════════════════
  {
    id: 'around_training',
    name: 'Peri-Workout Nutrition',
    nameEs: 'Alimentación Peri-Entrenamiento',
    category: 'distribution',
    description: 'Organizes nutrition timing around training sessions for optimal performance and recovery.',
    descriptionEs: 'Organiza la distribución nutricional alrededor de las sesiones de entrenamiento.',
    characteristics: {
      energyApproach: 'Distribución temporal estratégica',
      proteinStrategy: 'Proteína pre y post-entreno, distribución uniforme resto del día',
      carbStrategy: 'Carbos concentrados pre y post-entreno',
      fatStrategy: 'Reducida pre-entreno, normal en otras comidas',
      mealFrequency: '4-5 comidas, con timing específico',
      timingRelevance: 'Muy alta — el timing es la herramienta central',
      restrictions: [],
      key_foods: [],
    },
    requirements: {
      minExperienceLevel: 'intermediate',
      minAdherenceHistory: 30,
      requiredContext: ['horario de entrenamiento fijo'],
      contraindications: [],
    },
    suitability: {
      goals: ['performance', 'muscle_gain', 'fat_loss'],
      trainingTypes: ['strength', 'hypertrophy', 'endurance', 'hiit', 'mixed'],
      bestFor: ['Atletas', 'Usuarios con horario fijo de entrenamiento', 'Rendimiento'],
      avoidWhen: ['Horarios de entrenamiento variables', 'Principiantes'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [1.6, 2.2],
      carbPercentage: [40, 55],
      fatPercentage: [20, 35],
      mealFrequency: [4, 5],
    },
    evidence: {
      level: 'moderate',
      sources: ['Kerksick CM et al. JISSN 2017', 'Aragon AA et al. JISSN 2013'],
      notesEs: 'Evidencia moderada sobre timing nutricional. El beneficio real está en la distribución total, no solo el timing.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Proteína + carbos 1-2h pre, proteína + carbos post', calorieModifier: 1.05 },
      hypertrophy: { adjustments: 'Timing más estricto, superávit post-entreno', calorieModifier: 1.1 },
      endurance: { adjustments: 'Carbos pre, durante (si >60min), post', calorieModifier: 1.15 },
      hiit: { adjustments: 'Carbos pre para rendimiento, proteína post', calorieModifier: 1.05 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: [],
      warnings: ['No sobreestimar la importancia del timing vs. ingesta total'],
    },
  },

  // ═══════════════════════════════════════════════════
  // 12. ALIMENTACIÓN INTUITIVA
  // ═══════════════════════════════════════════════════
  {
    id: 'intuitive_eating',
    name: 'Intuitive Eating',
    nameEs: 'Alimentación Intuitiva',
    category: 'pattern',
    description: 'Based on internal hunger/satiety cues, rejecting diet mentality.',
    descriptionEs: 'Basada en señales internas de hambre/saciedad, rechazando la mentalidad de dieta.',
    characteristics: {
      energyApproach: 'Sin restricciones, basada en señales internas',
      proteinStrategy: 'Sin restricciones — comer lo que el cuerpo pide',
      carbStrategy: 'Sin restricciones',
      fatStrategy: 'Sin restricciones',
      mealFrequency: 'Según hambre y saciedad',
      timingRelevance: 'Baja — escuchar al cuerpo',
      restrictions: [],
      key_foods: [],
    },
    requirements: {
      minExperienceLevel: 'beginner',
      minAdherenceHistory: 0,
      requiredContext: ['relación sana con la comida', 'capacidad de escuchar señales corporales'],
      contraindications: ['TCA activo', 'Necesidad de restricción calórica médica'],
    },
    suitability: {
      goals: ['health', 'maintenance'],
      trainingTypes: ['general', 'functional', 'mobility'],
      bestFor: ['Salud mental relacionada con comida', 'Recuperación de dietas restrictivas', 'Mantenimiento'],
      avoidWhen: ['Necesidad de restricción calórica específica', 'Competición deportiva'],
    },
    defaults: {
      calorieModifier: 1.0,
      proteinPerKg: [0.8, 1.4],
      carbPercentage: [40, 60],
      fatPercentage: [20, 40],
      mealFrequency: [3, 6],
    },
    evidence: {
      level: 'moderate',
      sources: ['Tribole E & Resch E. Intuitive Eating (2020)', 'Bruce LJ et al. Eat Behav 2016'],
      notesEs: 'Evidencia moderada para salud mental y relación con la comida. No optimizado para composición corporal.',
    },
    trainingAdaptation: {
      strength: { adjustments: 'Puede necesitar guía para asegurar suficiente proteína', proteinModifier: 1.1 },
      hypertrophy: { adjustments: 'Difícil de optimizar sin-tracking — usar como base con orientación', calorieModifier: 1.05 },
    },
    safety: {
      requiresSupervision: false,
      riskGroups: ['TCA activo'],
      warnings: ['No es una estrategia de composición corporal', 'No recomendar en contexto de déficit requerido'],
    },
  },
]

/** Buscar método nutricional por ID */
export function getNutritionMethod(id: NutritionMethodId): NutritionMethod | undefined {
  return NUTRITION_METHODS.find(m => m.id === id)
}

/** Obtener métodos por categoría */
export function getNutritionMethodsByCategory(category: NutritionCategory): NutritionMethod[] {
  return NUTRITION_METHODS.filter(m => m.category === category)
}

/** Obtener patrones alimentarios */
export function getPatternMethods(): NutritionMethod[] {
  return NUTRITION_METHODS.filter(m => m.category === 'pattern')
}

/** Obtener estrategias de distribución */
export function getDistributionMethods(): NutritionMethod[] {
  return NUTRITION_METHODS.filter(m => m.category === 'distribution')
}
