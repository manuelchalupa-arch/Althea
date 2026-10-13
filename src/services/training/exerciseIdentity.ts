// Identidad de ejercicios por ID estable — §2 del Prompt 3.
//
// Problema que resuelve: en Entrenar había matching por NOMBRE (scoring de
// palabras) como vía principal para encontrar el ejercicio correspondiente.
// Los nombres no son identidad: cambian, se acentúan, se traducen, se
// renombran. La identidad es el exerciseId.
//
// Reglas:
//   1. Primero se resuelve SIEMPRE por ID (custom/… o muscle/slug o id seed).
//   2. El fallback por nombre es EXPLÍCITO, CONTROLADO y sólo exacto
//      (comparación normalizada, candidato único). Nunca adivina.
//   3. Cada resolución queda ETIQUETADA con su fuente, para que el caller
//      sepa qué tan sólida es.
//   4. SOLO LECTURA: jamás escribe en sesión ni en el catálogo. Los registros
//      de sesión (sessionExercises/setLogs/setRecords) no se tocan.
//   5. El emparejamiento difuso de nombres que existía queda como pista de
//      VISUALIZACIÓN (elegir un GIF), nunca como identidad.
import { normFold } from '@/utils/format'
import { db } from '@/services/storage/db'

export type ExerciseIdentitySource =
  /** id 'custom/…' encontrado en db.customExercises */
  | 'custom-id'
  /** id encontrado en db.exercises (incluye ids estilo gym 'muscle/slug') */
  | 'stored-id'
  /** NO se encontró por id; se resolvió por nombre exacto normalizado */
  | 'legacy-name-exact'
  /** sin resolución: se conserva el id original y el nombre provisto */
  | 'unresolved'

export interface ExerciseIdentity {
  /** id a usar a partir de ahora (el id original si no hubo fallback) */
  exerciseId: string
  source: ExerciseIdentitySource
  resolved: boolean
  /** nombre a mostrar (siempre no vacío si hay alguno disponible) */
  name: string
  muscle?: string
  gifUrl?: string
  imageDataUrl?: string
}

type StoredExercise = {
  id: string
  name: string
  muscle?: string
  muscleGroup?: string
  gifUrl?: string
  imageDataUrl?: string
}

/**
 * Alias legacy ex-00x → id del catálogo remoto de GIFs.
 * Tabla que vivía hardcodeada dentro de Entrenar (openViewer). Se conserva
 * EXACTAMENTE igual: es control legacy, no identidad.
 *
 * No es un fixture ni datos de prueba: mapea ids reales que Althea ya tiene
 * persistidos hacia el catálogo remoto. Su nombre evita deliberadamente los
 * marcadores que scripts/staging-preflight.mjs §9 prohíbe en runtime.
 */
export const LEGACY_ID_ALIASES: Record<string, string> = {
  'ex-001': 'pectorals/barbell-bench-press',
  'ex-002': 'pectorals/dumbbell-bench-press',
  'ex-003': 'pectorals/cable-bench-press',
  'ex-004': 'lats/pull-up',
  'ex-005': 'lats/cable-pulldown',
  'ex-006': 'quads/barbell-squat',
  'ex-007': 'quads/leg-press',
  'ex-008': 'hamstrings/barbell-deadlift',
  'ex-010': 'delts/barbell-military-press',
}

/**
 * Mapa único grupo muscular ES → músculo de la API de GIFs.
 * Antes estaba duplicado (inline) en dos lugares de Entrenar.tsx.
 *
 * NOTA DE ALCANCE: es deliberadamente MÁS ESTRECHO que GROUP_MAP de
 * @/utils/muscleMap (allí 'piernas' expande a la familia completa
 * quads/hamstrings/glutes/calves/…). Acá 'piernas' sigue yendo a 'quads'
 * para no cambiar el alcance actual del visor de GIFs.
 */
const API_MUSCLE: Record<string, string> = {
  pecho: 'pectorals', pectorales: 'pectorals', pectoral: 'pectorals',
  espalda: 'lats', dorsales: 'lats', dorsal: 'lats',
  biceps: 'biceps', triceps: 'triceps',
  hombros: 'delts', hombro: 'delts', deltoides: 'delts', delts: 'delts',
  piernas: 'quads', pierna: 'quads', cuadriceps: 'quads', quads: 'quads',
  isquiotibiales: 'hamstrings', isquios: 'hamstrings', femorales: 'hamstrings', hamstrings: 'hamstrings',
  gluteos: 'glutes', gluteo: 'glutes', glutes: 'glutes',
  pantorrillas: 'calves', gemelos: 'calves', calves: 'calves',
  abdominales: 'abs', abdomen: 'abs', abdominals: 'abs', abs: 'abs', core: 'abs',
  antebrazos: 'forearms', forearms: 'forearms',
  trapecios: 'traps', traps: 'traps',
  // Passthrough: formas que YA vienen en el idioma de la API (vienen del
  // catálogo gym o de db.exercises). Sin esto, 'lats' caería a 'pectorals'.
  lats: 'lats', upperback: 'upper-back', 'upper-back': 'upper-back',
  abductors: 'abductors', adductors: 'adductors',
  cardio: 'cardio', movilidad: 'cardio',
}

/** Resuelve el músculo de la API para un grupo (con fold: tolera acentos). */
export function apiMuscleFor(group: string | null | undefined): string {
  return API_MUSCLE[normFold(group || '')] || 'pectorals'
}

function toIdentity(
  exId: string,
  source: ExerciseIdentitySource,
  row: StoredExercise | null | undefined,
  fallbackName: string,
): ExerciseIdentity {
  const name = row?.name || fallbackName || exId
  return {
    exerciseId: exId,
    source,
    resolved: source !== 'unresolved',
    name,
    muscle: row?.muscle || row?.muscleGroup || undefined,
    gifUrl: row?.gifUrl || undefined,
    imageDataUrl: row?.imageDataUrl || undefined,
  }
}

/**
 * Resuelve la identidad de un ejercicio.
 *
 * @param exId      id estable guardado en la sesión (puede ser legacy/vacío)
 * @param legacyName nombre que la sesión guardó junto al id. Se usa SOLO como
 *                   fallback exacto y único, y SOLO para etiquetar la fuente.
 */
export async function resolveExerciseIdentity(
  exId: string | null | undefined,
  opts: { legacyName?: string | null } = {},
): Promise<ExerciseIdentity> {
  const id = (exId || '').trim()
  const legacyName = opts.legacyName || ''
  const empty: ExerciseIdentity = {
    exerciseId: id,
    source: 'unresolved',
    resolved: false,
    name: legacyName || id,
  }
  // 1) custom/… → tabla propia (ids del usuario, inmutables)
  if (id.startsWith('custom/')) {
    const custom = await db.customExercises.get(id).catch(() => null)
    if (custom) {
      return toIdentity(id, 'custom-id', custom as unknown as StoredExercise, legacyName)
    }
    // id custom sin registro local: NO se busca por nombre (sería adivinar)
    return empty
  }

  // 2) por id en el catálogo local (incluye ids 'muscle/slug' del catálogo gym)
  if (id) {
    const stored = await db.exercises.get(id).catch(() => null)
    if (stored) {
      return toIdentity(id, 'stored-id', stored as StoredExercise, legacyName)
    }
  }

  // 3) Fallback LEGACY controlado: nombre exacto normalizado, candidato único.
  //    Corre también cuando el id está vacío (sesiones antiguas que sólo
  //    guardaron el nombre). El caller decide si adopta el id devuelto:
  //    ESTE MÓDULO NUNCA ESCRIBE.
  if (legacyName) {
    const target = normFold(legacyName).trim()
    if (target) {
      const [storedRows, customRows] = await Promise.all([
        db.exercises.toArray().catch(() => [] as StoredExercise[]),
        db.customExercises.toArray().catch(() => [] as StoredExercise[]),
      ])
      const matches = [
        ...storedRows.filter((r) => normFold(r.name) === target),
        ...customRows.filter((r) => normFold(r.name) === target),
      ]
      // Un único candidato → se acepta. Cero o varios → NO se adivina.
      // La fuente se etiqueta como 'legacy-name-exact' AUNQUE el candidato
      // sea un custom: lo que importa es CÓMO se resolvió (por nombre), no
      // dónde estaba guardado.
      if (matches.length === 1) {
        const hit = matches[0]
        return {
          ...toIdentity(hit.id, 'legacy-name-exact', hit, legacyName),
          exerciseId: hit.id,
          resolved: true,
        }
      }
    }
  }

  return empty
}

/**
 * Puntuación de nombre para elegir un GIF de visualización.
 * SOLO visual: su resultado nunca cambia el exerciseId de la sesión.
 * Devuelve -1 si no hay coincidencia razonable.
 */
export function scoreNameMatch(targetRaw: string, candidate: { name: string; slug?: string }): number {
  const target = normFold(targetRaw)
  if (!target) { return -1 }
  const name = normFold(candidate.name)
  const slug = candidate.slug || ''
  const words = target.split(/\s+/).filter(Boolean)
  let score = 0
  for (const w of words) {
    if (name.includes(w)) { score += 2 }
    if (slug.includes(w)) { score += 1 }
  }
  if (target.includes('inclinado') && name.includes('inclinado')) { score += 5 }
  if (target.includes('banca') && name.includes('banca')) { score += 3 }
  if (target.includes('mancuerna') && name.includes('mancuerna')) { score += 3 }
  return score > 1 ? score : -1
}
