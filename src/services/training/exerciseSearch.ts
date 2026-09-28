// Búsqueda tolerante para Biblioteca — FASE 5.
// Sin filtros obligatorios. Tolera: mayúsculas, acentos, singular/plural,
// español/inglés, nombres alternativos y sinónimos razonables.

/**
 * Normaliza un string: minúsculas + sin acentos/diacríticos.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Reduce a singular simple (quita s final si tiene, para comparación básica).
 * No es un stemmer completo — solo tolerancia ligera.
 */
function singularize(s: string): string {
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) {
    return s.slice(0, -1)
  }
  return s
}

/**
 * Sinónimos y equivalencias razonables de ejercicios fitness.
 * Cada grupo son términos que deben encontrarse mutuamente.
 * No es exhaustivo — solo cubre casos comunes ES↔EN.
 */
const SYNONYM_GROUPS: string[][] = [
  ['sillon de cuadriceps', 'leg extension', 'extension de piernas', 'quadriceps extension', 'extencion de piernas'],
  ['cuadriceps', 'quadriceps', 'cuadriceps femoris', 'quads'],
  ['isquios', 'hamstrings', 'biceps femoris', 'femorales'],
  ['gluteos', 'glutes', 'gluteus maximus'],
  ['gemelos', 'calves', 'gastrocnemius'],
  ['pecho', 'chest', 'pectoral', 'pectorals', 'pectoralis'],
  ['espalda', 'back', 'latissimus', 'dorsal'],
  ['hombros', 'shoulders', 'delts', 'deltoids', 'deltoides'],
  ['biceps', 'biceps brachii'],
  ['triceps', 'triceps brachii'],
  ['abdomen', 'abs', 'abdominals', 'core'],
  ['prensa', 'leg press', 'prensa de piernas'],
  ['sentadilla', 'squat', 'air squat'],
  ['peso muerto', 'deadlift'],
  ['peso muerto rumano', 'rdl', 'romanian deadlift'],
  ['press banca', 'bench press', 'press de banca'],
  ['press militar', 'overhead press', 'shoulder press', 'military press'],
  ['jalón al pecho', 'lat pulldown', 'jalon al pecho'],
  ['dominadas', 'pull up', 'pullup', 'chin up'],
  ['flexiones', 'push up', 'pushup', 'press de piso'],
  ['curl de bíceps', 'bicep curl', 'curl de biceps'],
  ['curl martillo', 'hammer curl'],
  ['elevaciones laterales', 'lateral raise', 'elevacion lateral'],
  ['elevaciones frontales', 'front raise'],
  ['fondos', 'dip', 'dips'],
  ['plancha', 'plank'],
  ['abdominales', 'crunch', 'sit up'],
  ['elevación de talones', 'calf raise', 'gemelos'],
  ['hip thrust', 'puente de glúteos', 'puente de gluteos', 'glute bridge'],
  ['remo con barra', 'barbell row', 'bent over row'],
  ['remo mancuerna', 'dumbbell row', 'one arm row'],
  ['aperturas', 'fly', 'pec deck', 'pecho mariposa'],
  ['pájaros', 'reverse fly', 'pajaros'],
  ['zancada', 'lunge', 'estocada'],
  ['encogimientos', 'shrug'],
  ['extensiones de tríceps', 'tricep extension', 'pushdown'],
  ['french press', 'skull crusher'],
  ['polea', 'cable', 'cable machine'],
  ['mancuerna', 'dumbbell'],
  ['barra', 'barbell'],
  ['kettlebell', 'peso ruso'],
]

// Mapa término → grupo de sinónimos (precalculado para búsqueda rápida)
const synonymMap = new Map<string, Set<string>>()
for (const group of SYNONYM_GROUPS) {
  const normalizedGroup = group.map(normalize)
  for (const term of normalizedGroup) {
    if (!synonymMap.has(term)) {synonymMap.set(term, new Set())}
    const set = synonymMap.get(term)!
    for (const other of normalizedGroup) {
      if (other !== term) {set.add(other)}
    }
  }
}

/**
 * Obtiene sinónimos de un término normalizado.
 */
export function getSynonyms(term: string): string[] {
  const n = normalize(term)
  const set = synonymMap.get(n)
  if (set) {return Array.from(set)}
  const sing = singularize(n)
  const singSet = synonymMap.get(sing)
  if (singSet) {return Array.from(singSet)}
  return []
}

/**
 * Indica si `text` contiene `query` de forma tolerante.
 * Tolera: mayúsculas, acentos, singular/plural ligero.
 */
export function matchesQuery(text: string, query: string): boolean {
  if (!query) {return true}
  const nText = normalize(text)
  const nQuery = normalize(query)
  if (nText.includes(nQuery)) {return true}
  const sQuery = singularize(nQuery)
  if (sQuery !== nQuery && nText.includes(sQuery)) {return true}
  const sText = singularize(nText)
  if (sText.includes(nQuery)) {return true}
  return false
}

/**
 * Verifica si un ejercicio coincide con la query, incluyendo sinónimos.
 * Compara contra: name, alias, muscle, bodyPart, equipment, category,
 * secondaryMuscles, instructions y muscleBreakdown.
 */
export function exerciseMatches(
  ex: {
    name?: string
    alias?: string
    muscle?: string
    bodyPart?: string
    equipment?: string
    category?: string
    secondaryMuscles?: string[]
    instructions?: string[]
    muscleBreakdown?: { name: string }[]
  },
  query: string,
): boolean {
  if (!query) {return true}

  const fields = [
    ex.name || '',
    ex.alias || '',
    ex.muscle || '',
    ex.bodyPart || '',
    ex.equipment || '',
    ex.category || '',
    ...(ex.secondaryMuscles || []),
    ...(ex.instructions || []),
    ...(ex.muscleBreakdown || []).map(m => m.name),
  ]

  for (const field of fields) {
    if (matchesQuery(field, query)) {return true}
  }

  const synonyms = getSynonyms(query)
  if (synonyms.length > 0) {
    for (const syn of synonyms) {
      for (const field of fields) {
        if (matchesQuery(field, syn)) {return true}
      }
    }
  }

  return false
}
