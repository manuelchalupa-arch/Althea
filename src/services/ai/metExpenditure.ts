// Gasto energético estimado basado en MET (Compendium 2024).
// Fórmula: kcal/min = MET × 3.5 × peso(kg) / 200
// Total: kcal = kcal/min × duración(minutos)
// El resultado es una ESTIMACIÓN, no un valor exacto.
// Las actividades usan el MET más específico disponible del Compendium.

export interface MetEntry {
  activity: string
  category: string
  met: number
  source: string
}

/** MET del Compendium de Actividades Físicas 2024 (adultos). */
export const MET_DATA: MetEntry[] = [
  // Entrenamiento de fuerza (usar la categoría que más se aproxime a la sesión)
  { activity: 'Entrenamiento de fuerza general', category: 'resistance', met: 6.0, source: '2024 Adult Compendium of Physical Activities' },
  { activity: 'Circuito de entrenamiento', category: 'circuit_training', met: 8.0, source: '2024 Adult Compendium of Physical Activities' },
  { activity: 'Entrenamiento de alta intensidad (HIIT con pesas)', category: 'vigorous_resistance', met: 10.0, source: '2024 Adult Compendium of Physical Activities' },
  // Caminata
  { activity: 'Caminata, ritmo lento (≈2 mph)', category: 'walking_slow', met: 2.5, source: '2024 Adult Compendium of Physical Activities — Walking' },
  { activity: 'Caminata, ritmo moderado (≈2.5 mph)', category: 'walking_moderate', met: 3.3, source: '2024 Adult Compendium of Physical Activities — Walking' },
  { activity: 'Caminata, ritmo rápido (≈3 mph)', category: 'walking_fast', met: 3.8, source: '2024 Adult Compendium of Physical Activities — Walking' },
  { activity: 'Caminata, ritmo muy rápido (≈3.5 mph)', category: 'walking_very_fast', met: 4.5, source: '2024 Adult Compendium of Physical Activities — Walking' },
  // Carrera
  { activity: 'Carrera, 5 mph (12 min/km)', category: 'running_5mph', met: 8.3, source: '2024 Adult Compendium of Physical Activities — Running' },
  { activity: 'Carrera, 6 mph (10 min/km)', category: 'running_6mph', met: 9.8, source: '2024 Adult Compendium of Physical Activities — Running' },
  { activity: 'Carrera, 7 mph (8.5 min/km)', category: 'running_7mph', met: 11.5, source: '2024 Adult Compendium of Physical Activities — Running' },
  { activity: 'Carrera, 8 mph (7.5 min/km)', category: 'running_8mph', met: 13.8, source: '2024 Adult Compendium of Physical Activities — Running' },
  // Bicicleta
  { activity: 'Ciclismo moderado (<16 km/h)', category: 'cycling_leisure', met: 4.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Ciclismo vigoroso (16-19 km/h)', category: 'cycling_moderate', met: 6.8, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Ciclismo muy vigoroso (>19 km/h)', category: 'cycling_vigorous', met: 10.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Ciclismo en ruta, ritmo competitivo', category: 'cycling_racing', met: 14.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  // Cinta y bicicleta fija
  { activity: 'Cinta de correr, ritmo moderado (5-6 mph)', category: 'treadmill_moderate', met: 8.3, source: '2024 Adult Compendium of Physical Activities — Running' },
  { activity: 'Cinta de correr, ritmo vigoroso (>6 mph)', category: 'treadmill_vigorous', met: 10.0, source: '2024 Adult Compendium of Physical Activities — Running' },
  { activity: 'Bicicleta fija, moderada', category: 'stationary_cycling_moderate', met: 5.5, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Bicicleta fija, vigorosa', category: 'stationary_cycling_vigorous', met: 8.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  // Deportes
  { activity: 'Fútbol/soccer, partido competitivo', category: 'soccer_game', met: 10.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Fútbol/soccer, práctica ligera', category: 'soccer_practice', met: 7.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Básquet, partido', category: 'basketball_game', met: 8.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Básquet, práctica', category: 'basketball_practice', met: 6.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Vóley, partido', category: 'volleyball_game', met: 6.0, source: '2024 Adult Compendium of Physical Activities — Sports' },
  { activity: 'Vóley, práctica', category: 'volleyball_practice', met: 4.5, source: '2024 Adult Compendium of Physical Activities — Sports' },
]

/** Busca el MET más específico disponible para una actividad/categoría. */
export function findMet(activityOrCategory: string): MetEntry | undefined {
  return MET_DATA.find(e => e.activity.toLowerCase() === activityOrCategory.toLowerCase() || e.category === activityOrCategory.toLowerCase())
}

/** Calcula el gasto energético estimado con el método MET estándar. */
export function calculateCalorieExpenditure(opts: {
  activity: string
  met: number
  weightKg: number
  durationMinutes: number
}): { grossKcal: number; netKcal: number; formula: string; met: number } {
  const { met, weightKg, durationMinutes } = opts
  // kcal/min = MET × 3.5 × peso(kg) / 200
  const kcalsPerMin = met * 3.5 * weightKg / 200
  const grossKcal = kcalsPerMin * durationMinutes
  // Gasto neto = bruto − reposo basal estimado (1 MET durante la duración)
  const netKcal = grossKcal - (1 * 3.5 * weightKg / 200) * durationMinutes
  return {
    grossKcal: Math.round(grossKcal * 10) / 10,
    netKcal: Math.round(netKcal * 10) / 10,
    formula: `${met} MET × 3,5 × ${weightKg} kg ÷ 200 × ${durationMinutes} min`,
    met,
  }
}

/** Fuentes científicas visibles en el Coach. */
export const SCIENTIFIC_SOURCES = [
  {
    id: 'acsm-resistance-2026',
    name: 'Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews',
    organization: 'American College of Sports Medicine (ACSM)',
    topic: 'Entrenamiento de fuerza e hipertrofia',
    year: 2026,
    url: 'https://acsm.org/science-spotlight-acsm-releases-new-position-stand-on-resistance-training/',
    evidenceLevel: 'Position stand',
  },
  {
    id: 'acsm-guidelines-12th',
    name: 'Guidelines for Exercise Testing and Prescription, 12th edition',
    organization: 'American College of Sports Medicine (ACSM)',
    topic: 'Prescripción de ejercicio y MET',
    year: undefined,
    url: 'https://acsm.org/education-resources/books/guidelines-exercise-testing-prescription/',
    evidenceLevel: 'Guideline',
  },
  {
    id: 'compendium-2024-adult',
    name: '2024 Adult Compendium of Physical Activities',
    organization: 'Ainsworth et al.',
    topic: 'Valores MET para caminata, carrera, ciclismo y deportes',
    year: 2024,
    url: 'https://pacompendium.com/adult-compendium/',
    evidenceLevel: 'Compendium',
  },
  {
    id: 'compendium-2024-sports',
    name: 'Compendium of Physical Activities — Sports',
    organization: 'Ainsworth et al.',
    topic: 'MET para deportes',
    year: 2024,
    url: 'https://pacompendium.com/sports/',
    evidenceLevel: 'Compendium',
  },
  {
    id: 'compendium-2024-walking',
    name: 'Compendium of Physical Activities — Walking',
    organization: 'Ainsworth et al.',
    topic: 'MET para caminata',
    year: 2024,
    url: 'https://pacompendium.com/walking/',
    evidenceLevel: 'Compendium',
  },
  {
    id: 'compendium-2024-running',
    name: 'Compendium of Physical Activities — Running',
    organization: 'Ainsworth et al.',
    topic: 'MET para carrera',
    year: 2024,
    url: 'https://pacompendium.com/running/',
    evidenceLevel: 'Compendium',
  },
  {
    id: 'who-physical-activity',
    name: 'WHO Guidelines on Physical Activity and Sedentary Behaviour',
    organization: 'Organización Mundial de la Salud (OMS)',
    topic: 'Actividad física y salud',
    year: 2020,
    url: 'https://www.who.int/publications-detail-redirect/9789240015128',
    evidenceLevel: 'Guideline',
  },
  {
    id: 'usda-fooddata',
    name: 'USDA FoodData Central',
    organization: 'USDA National Nutrient Database',
    topic: 'Composición nutricional de alimentos',
    year: undefined,
    url: 'https://fdc.nal.usda.gov/api-guide/',
    evidenceLevel: 'Database',
  },
  {
    id: 'issn-protein-exercise',
    name: 'International Society of Sports Nutrition: Protein and Exercise',
    organization: 'International Society of Sports Nutrition (ISSN)',
    topic: 'Proteína y ejercicio',
    year: 2017,
    url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
    evidenceLevel: 'Position stand',
  },
  {
    id: 'nsca-position-statements',
    name: 'NSCA Position Statements',
    organization: 'National Strength and Conditioning Association (NSCA)',
    topic: 'Entrenamiento de fuerza y acondicionamiento',
    year: undefined,
    url: 'https://www.nsca.com/about-us/position-statements/',
    evidenceLevel: 'Position statement',
  },
]

/** Valida que una actividad con mayor MET genere mayor estimación con iguales peso y duración. */
export function verifyMetOrdering(): boolean {
  const a = calculateCalorieExpenditure({ activity: 'Correr', met: 8.3, weightKg: 70, durationMinutes: 30 })
  const b = calculateCalorieExpenditure({ activity: 'Caminar', met: 3.3, weightKg: 70, durationMinutes: 30 })
  return a.grossKcal > b.grossKcal
}

/** Verifica que mayor peso incremente proporcionalmente la estimación. */
export function verifyWeightScaling(): boolean {
  const a = calculateCalorieExpenditure({ activity: 'Fuerza', met: 6.0, weightKg: 60, durationMinutes: 30 })
  const b = calculateCalorieExpenditure({ activity: 'Fuerza', met: 6.0, weightKg: 80, durationMinutes: 30 })
  return Math.abs((b.grossKcal / a.grossKcal) - (80 / 60)) < 0.01
}

/** Verifica que mayor duración incremente proporcionalmente la estimación. */
export function verifyDurationScaling(): boolean {
  const a = calculateCalorieExpenditure({ activity: 'Fuerza', met: 6.0, weightKg: 70, durationMinutes: 20 })
  const b = calculateCalorieExpenditure({ activity: 'Fuerza', met: 6.0, weightKg: 70, durationMinutes: 40 })
  return Math.abs((b.grossKcal / a.grossKcal) - 2) < 0.01
}
