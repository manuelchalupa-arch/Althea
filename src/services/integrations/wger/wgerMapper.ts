// wgerMapper — Convierte WgerExerciseInfo → Exercise (modelo Althea).
// Mantiene altheaId separado de wgerId. No destruye datos propios de Althea.

import type { Exercise, MuscleShare } from '@/services/exerciseGym'
import type { WgerExerciseInfo, WgerTranslation } from './wgerTypes'

const LANGUAGE_ES = 2
const LANGUAGE_EN = 1

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

function extractInstructions(description: string): string[] {
  const text = stripHtml(description)
  if (!text) {return []}
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean)
}

// Mapea músculo Wger → bodyPart Althea (derivado de muscle name_en o name)
const MUSCLE_TO_BODY_PART: Record<string, string> = {
  'biceps brachii': 'arms',
  'triceps brachii': 'arms',
  'brachialis': 'arms',
  'brachioradialis': 'arms',
  'anterior deltoid': 'shoulders',
  'lateral deltoid': 'shoulders',
  'posterior deltoid': 'shoulders',
  'trapezius': 'back',
  'latissimus dorsi': 'back',
  'rhomboids': 'back',
  'erector spinae': 'back',
  'teres major': 'back',
  'pectoralis major': 'chest',
  'pectoralis minor': 'chest',
  'rectus abdominis': 'core',
  'obliquus externus abdominis': 'core',
  'biceps femoris': 'legs',
  'quadriceps femoris': 'legs',
  'gluteus maximus': 'legs',
  'gastrocnemius': 'legs',
  'soleus': 'legs',
  'tibialis anterior': 'legs',
  'sartorius': 'legs',
  'gracilis': 'legs',
  'adductor magnus': 'legs',
}

function resolveBodyPart(muscleName: string, muscleNameEn: string): string {
  const key = muscleName.toLowerCase()
  const keyEn = muscleNameEn.toLowerCase()
  return MUSCLE_TO_BODY_PART[key] || MUSCLE_TO_BODY_PART[keyEn] || 'other'
}

// Elige la traducción preferida: español > inglés > primera
function pickTranslation(translations: WgerTranslation[]): WgerTranslation | null {
  if (!translations.length) {return null}
  const es = translations.find((t) => t.language === LANGUAGE_ES)
  if (es) {return es}
  const en = translations.find((t) => t.language === LANGUAGE_EN)
  if (en) {return en}
  return translations[0]
}

// Construye muscleBreakdown desde muscles + muscles_secondary (sin porcentajes inventados)
function buildMuscleBreakdown(info: WgerExerciseInfo): MuscleShare[] {
  const shares: MuscleShare[] = []
  const primary = info.muscles[0]
  if (primary) {
    shares.push({ name: primary.name.toLowerCase(), pct: 50, role: 'Principal' })
  }
  const secondaries = info.muscles_secondary
  if (secondaries.length > 0) {
    const pct = Math.floor(50 / secondaries.length)
    for (const m of secondaries) {
      shares.push({ name: m.name.toLowerCase(), pct, role: 'Secundario' })
    }
  }
  return shares
}

export function wgerToAltheaExercise(info: WgerExerciseInfo): Exercise {
  const translation = pickTranslation(info.translations)
  const name = translation?.name || `Wger exercise ${info.id}`
  const description = translation?.description || ''
  const instructions = extractInstructions(description)

  const primaryMuscle = info.muscles[0]
  const bodyPart = primaryMuscle
    ? resolveBodyPart(primaryMuscle.name, primaryMuscle.name_en)
    : 'other'

  const equipment = info.equipment[0]?.name.toLowerCase() || 'bodyweight'

  const slug = `wger-${info.id}`

  const exercise: Exercise = {
    id: slug,
    slug,
    name,
    muscle: primaryMuscle?.name.toLowerCase() || '',
    bodyPart,
    equipment,
    category: info.category.name.toLowerCase(),
    secondaryMuscles: info.muscles_secondary.map((m) => m.name.toLowerCase()),
    instructions,
    file: '',
    gifUrl: info.images[0]?.image || '',
    origin: 'PRELOADED',
    muscleBreakdown: buildMuscleBreakdown(info),
    archived: false,
  }

  return exercise
}

// Metadatos de procedencia para persistencia (tabla existente o campo adicional)
export interface WgerProvenance {
  altheaId: string
  source: 'wger'
  sourceId: number
  sourceUuid: string
  license: string
  licenseUrl: string
  licenseAuthor: string
  importedAt: string
}

export function buildProvenance(info: WgerExerciseInfo): WgerProvenance {
  return {
    altheaId: `wger-${info.id}`,
    source: 'wger',
    sourceId: info.id,
    sourceUuid: info.uuid,
    license: info.license.full_name,
    licenseUrl: info.license.url,
    licenseAuthor: info.license_author,
    importedAt: new Date().toISOString(),
  }
}
