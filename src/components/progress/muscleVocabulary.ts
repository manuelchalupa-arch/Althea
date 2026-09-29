/**
 * VOCABULARIO MUSCULAR — puente entre los nombres de músculo que usa Althea y
 * las regiones del atlas (muscleGeometry.ts).
 *
 * Fuentes cubiertas (verificadas contra el repo y la biblioteca de ejercicios):
 *  1. ExerciseGymGifsDB `muscle` y `secondaryMuscles` (abs, pectorals, delts, upper-back, ...).
 *  2. `id` de MUSCLE_CATALOG (services/training/muscleCatalog.ts).
 *  3. Nombres del seed local en español (pectoral mayor, dorsal, isquios, ...).
 *  4. Grupos de MuscleGroup / MUSCLE_GROUPS (PECHO, ESPALDA, ..., pecho, espalda, ...).
 *
 * Regla: el atlas dibuja músculos; `cardio` y `cuerpo completo` no son un
 * músculo y resuelven a [] a propósito (no se inventa una región).
 */
import { MUSCLE_REGIONS, ALL_REGION_IDS } from './muscleGeometry';

/** Normaliza: minúsculas, sin tildes, separadores a guion. */
export function normalizeMuscleName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_/]+/g, '-');
}

/** Ids a nivel catálogo (padre o músculo simple). */
const DELTS = ['anterior-deltoid', 'lateral-deltoid', 'posterior-deltoid'];
const FOREARMS = ['forearm-flexors', 'forearm-extensors', 'brachioradialis'];
const ABS = ['rectus-abdominis', 'obliquus-externus'];
const BACK_ALL = ['latissimus-dorsi', 'trapezius', 'rhomboids', 'infraspinatus', 'teres-major', 'spinal-erectors', 'levator-scapulae'];
const GLUTES = ['gluteus-maximus', 'gluteus-medius'];
const CALVES = ['gastrocnemius', 'soleus'];
const LEGS_ALL = ['quadriceps', 'hamstrings', ...GLUTES, 'adductors', 'tensor-fasciae-latae', ...CALVES, 'tibialis-anterior'];
const UPPER_BACK = ['rhomboids', 'trapezius-middle', 'infraspinatus', 'teres-major'];

export const MUSCLE_ALIASES: Record<string, string[]> = {
  // ── ExerciseGymGifsDB (primary + secondary) ─────────────────────────────
  abs: ABS,
  abductors: ['gluteus-medius', 'tensor-fasciae-latae'],
  adductors: ['adductors'],
  biceps: ['biceps-brachii'],
  calves: CALVES,
  delts: DELTS,
  forearms: FOREARMS,
  glutes: GLUTES,
  hamstrings: ['hamstrings'],
  lats: ['latissimus-dorsi'],
  'levator-scapulae': ['levator-scapulae'],
  pectorals: ['pectoralis-major'],
  quads: ['quadriceps'],
  'serratus-anterior': ['serratus-anterior'],
  spine: ['spinal-erectors'],
  traps: ['trapezius'],
  triceps: ['triceps-brachii'],
  'upper-back': UPPER_BACK,
  cardio: [], // no es un músculo: sin región

  // ── Seed local / español ────────────────────────────────────────────────
  'pectoral-mayor': ['pectoralis-major'], pectoral: ['pectoralis-major'], pectorales: ['pectoralis-major'], pecho: ['pectoralis-major'],
  'pectoral-superior': ['pectoralis-major-clavicular'], 'pecho-superior': ['pectoralis-major-clavicular'],
  'pectoral-inferior': ['pectoralis-major-sternal'], 'pecho-inferior': ['pectoralis-major-sternal'],
  dorsal: ['latissimus-dorsi'], dorsales: ['latissimus-dorsi'], 'dorsal-ancho': ['latissimus-dorsi'],
  espalda: BACK_ALL, 'espalda-alta': UPPER_BACK, 'espalda-baja': ['spinal-erectors'],
  lumbar: ['spinal-erectors'], lumbares: ['spinal-erectors'], erectores: ['spinal-erectors'], columna: ['spinal-erectors'],
  trapecio: ['trapezius'], trapecios: ['trapezius'], romboides: ['rhomboids'],
  'redondo-mayor': ['teres-major'], 'redondo-menor': ['infraspinatus'], infraespinoso: ['infraspinatus'],
  'manguito-rotador': ['infraspinatus', 'teres-major'],
  'elevador-de-la-escapula': ['levator-scapulae'],
  hombro: DELTS, hombros: DELTS, deltoide: DELTS, deltoides: DELTS,
  'deltoides-anterior': ['anterior-deltoid'], 'deltoides-lateral': ['lateral-deltoid'], 'deltoides-posterior': ['posterior-deltoid'],
  'biceps-brazo': ['biceps-brachii'], 'triceps-brazo': ['triceps-brachii'],
  antebrazo: FOREARMS, antebrazos: FOREARMS, braquiorradial: ['brachioradialis'],
  brazo: ['biceps-brachii', 'triceps-brachii'], brazos: ['biceps-brachii', 'triceps-brachii', ...FOREARMS],
  abdomen: ABS, abdominales: ABS, core: [...ABS, 'spinal-erectors'], 'recto-abdominal': ['rectus-abdominis'],
  'abdominales-superiores': ['rectus-abdominis-upper'], 'abdominales-inferiores': ['rectus-abdominis-lower'],
  oblicuos: ['obliquus-externus'], oblicuo: ['obliquus-externus'], serrato: ['serratus-anterior'],
  cuadriceps: ['quadriceps'], 'cuadriceps-femoral': ['quadriceps'],
  isquios: ['hamstrings'], isquiotibiales: ['hamstrings'], femorales: ['hamstrings'],
  gluteo: GLUTES, gluteos: GLUTES, 'gluteo-mayor': ['gluteus-maximus'], 'gluteo-medio': ['gluteus-medius'],
  aductores: ['adductors'], abductores: ['gluteus-medius', 'tensor-fasciae-latae'],
  gemelos: ['gastrocnemius'], gemelo: ['gastrocnemius'], pantorrillas: CALVES, pantorrilla: CALVES, soleo: ['soleus'],
  'tibial-anterior': ['tibialis-anterior'], tibial: ['tibialis-anterior'],
  piernas: LEGS_ALL, pierna: LEGS_ALL,

  // ── Grupos (MUSCLE_GROUPS y MuscleGroup) ────────────────────────────────
  'cuerpo-completo': [], 'full-body': [],
};

/** Ids del catálogo del repo y de las subdivisiones: identidad. */
for (const id of ALL_REGION_IDS) {
  MUSCLE_ALIASES[id] = [id];
}
for (const id of [
  'anterior-deltoid', 'posterior-deltoid', 'pectoralis-major', 'biceps-brachii', 'triceps-brachii', 'forearm-flexors', 'forearm-extensors',
  'rectus-abdominis', 'obliquus-externus', 'quadriceps', 'tibialis-anterior', 'trapezius', 'latissimus-dorsi', 'spinal-erectors',
  'gluteus-maximus', 'hamstrings', 'gastrocnemius',
]) {
  MUSCLE_ALIASES[id] = [id];
}

/** Términos que NO son un músculo (no tienen ni deben tener región). */
export const NON_MUSCULAR_TERMS = ['cardio', 'cuerpo-completo', 'full-body'];

/** Región(es) del atlas para un nombre de músculo cualquiera. [] si no es un músculo. */
export function resolveMuscleIds(name: string): string[] {
  return MUSCLE_ALIASES[normalizeMuscleName(name)] ?? [];
}

/** Expande un id de catálogo (padre) a los ids de regiones que dibuja. */
export function regionIdsOf(catalogId: string): string[] {
  const all = [...MUSCLE_REGIONS.front, ...MUSCLE_REGIONS.back];
  const direct = all.filter((r) => r.id === catalogId || r.parent === catalogId).map((r) => r.id);
  return Array.from(new Set(direct));
}

/**
 * Chequeo de cobertura para correr contra el catálogo real:
 * devuelve los nombres que NO se pueden asociar a ninguna región
 * (excluye los términos no musculares como cardio).
 */
export function unmappedMuscles(names: string[]): string[] {
  const missing = new Set<string>();
  for (const raw of names) {
    const key = normalizeMuscleName(raw);
    if (NON_MUSCULAR_TERMS.includes(key)) {continue;}
    const ids = MUSCLE_ALIASES[key];
    if (!ids || ids.length === 0 || ids.some((id) => regionIdsOf(id).length === 0)) {missing.add(raw);}
  }
  return Array.from(missing);
}
