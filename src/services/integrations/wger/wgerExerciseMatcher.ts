import type { Exercise } from '@/services/exerciseGym'
import type { WgerExerciseInfo, WgerTranslation } from './wgerTypes'
import type { WgerProvenance } from './wgerMapper'

export interface MatchResult {
  matched: boolean
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'none'
  matchedExercise?: Exercise
  reason: string
}

export interface ExerciseIndex {
  bySourceId: Map<number, Exercise>
  byUuid: Map<string, Exercise>
  byAlias: Map<string, Exercise>
  byNormalizedName: Map<string, Exercise>
  all: Exercise[]
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim()
}

export function buildExerciseIndex(exercises: Exercise[], provenanceList: WgerProvenance[]): ExerciseIndex {
  const bySourceId = new Map<number, Exercise>()
  const byUuid = new Map<string, Exercise>()
  const byAlias = new Map<string, Exercise>()
  const byNormalizedName = new Map<string, Exercise>()

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]
    const prov = provenanceList[i]

    if (prov) {
      bySourceId.set(prov.sourceId, ex)
      if (prov.sourceUuid) {
        byUuid.set(prov.sourceUuid, ex)
      }
    }

    const normName = normalizeName(ex.name)
    if (normName) {
      byNormalizedName.set(normName, ex)
    }
  }

  return { bySourceId, byUuid, byAlias, byNormalizedName, all: exercises }
}

export function findMatch(
  wgerInfo: WgerExerciseInfo,
  index: ExerciseIndex,
  existingProvenance: WgerProvenance[],
): MatchResult {
  const bySourceId = index.bySourceId.get(wgerInfo.id)
  if (bySourceId) {
    return {
      matched: true,
      confidence: 'exact',
      matchedExercise: bySourceId,
      reason: `sourceId WGER exacto: ${wgerInfo.id}`,
    }
  }

  if (wgerInfo.uuid) {
    const byUuid = index.byUuid.get(wgerInfo.uuid)
    if (byUuid) {
      return {
        matched: true,
        confidence: 'exact',
        matchedExercise: byUuid,
        reason: `UUID exacto: ${wgerInfo.uuid}`,
      }
    }
  }

  const translations = wgerInfo.translations || []
  for (const t of translations) {
    for (const alias of t.aliases || []) {
      const normAlias = normalizeAlias(alias)
      const match = index.byAlias.get(normAlias)
      if (match) {
        return {
          matched: true,
          confidence: 'high',
          matchedExercise: match,
          reason: `Alias exacto: ${alias}`,
        }
      }
    }
  }

  const bestTranslation = pickBestTranslation(translations)
  if (bestTranslation) {
    const normName = normalizeName(bestTranslation.name)
    const match = index.byNormalizedName.get(normName)
    if (match) {
      return {
        matched: true,
        confidence: 'high',
        matchedExercise: match,
        reason: `Nombre normalizado: ${bestTranslation.name}`,
      }
    }
  }

  const partialMatch = findPartialMatch(wgerInfo, index)
  if (partialMatch) {
    return partialMatch
  }

  const fuzzyMatch = findFuzzyMatch(wgerInfo, index)
  if (fuzzyMatch) {
    return fuzzyMatch
  }

  return {
    matched: false,
    confidence: 'none',
    reason: 'Sin coincidencia suficiente',
  }
}

function pickBestTranslation(translations: WgerTranslation[]): WgerTranslation | null {
  if (!translations.length) {return null}
  const es = translations.find((t) => t.language === 2)
  if (es) {return es}
  const en = translations.find((t) => t.language === 1)
  if (en) {return en}
  return translations[0]
}

function findPartialMatch(wgerInfo: WgerExerciseInfo, index: ExerciseIndex): MatchResult | null {
  const translation = pickBestTranslation(wgerInfo.translations)
  if (!translation) {return null}

  const normName = normalizeName(translation.name)
  const wgerMuscles = new Set(wgerInfo.muscles.map((m) => m.name.toLowerCase()))
  const wgerEquipment = new Set(wgerInfo.equipment.map((e) => e.name.toLowerCase()))

  let bestMatch: Exercise | null = null
  let bestScore = 0

  for (const ex of index.all) {
    const exNormName = normalizeName(ex.name)
    if (!exNormName) {continue}

    const nameSimilarity = calculateSimilarity(normName, exNormName)
    if (nameSimilarity < 0.7) {continue}

    const exMuscles = new Set([ex.muscle, ...ex.secondaryMuscles].map((m) => m.toLowerCase()))
    const muscleOverlap = [...wgerMuscles].filter((m) => exMuscles.has(m)).length

    const exEquipment = ex.equipment?.toLowerCase() || ''
    const equipmentMatch = wgerEquipment.has(exEquipment)

    const score = nameSimilarity * 0.6 + (muscleOverlap > 0 ? 0.3 : 0) + (equipmentMatch ? 0.1 : 0)

    if (score > bestScore && score >= 0.75) {
      bestScore = score
      bestMatch = ex
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      confidence: bestScore >= 0.9 ? 'medium' : 'low',
      matchedExercise: bestMatch,
      reason: `Coincidencia parcial (score: ${bestScore.toFixed(2)})`,
    }
  }

  return null
}

function findFuzzyMatch(wgerInfo: WgerExerciseInfo, index: ExerciseIndex): MatchResult | null {
  const translation = pickBestTranslation(wgerInfo.translations)
  if (!translation) {return null}

  const normName = normalizeName(translation.name)
  let bestMatch: Exercise | null = null
  let bestScore = 0

  for (const ex of index.all) {
    const exNormName = normalizeName(ex.name)
    if (!exNormName) {continue}

    const similarity = calculateSimilarity(normName, exNormName)
    if (similarity > bestScore && similarity >= 0.85) {
      bestScore = similarity
      bestMatch = ex
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      confidence: 'low',
      matchedExercise: bestMatch,
      reason: `Fuzzy matching (similarity: ${bestScore.toFixed(2)})`,
    }
  }

  return null
}

function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) {return 0}
  if (a === b) {return 1}

  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a

  if (longer.length === 0) {return 1}

  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

export function shouldMerge(match: MatchResult): boolean {
  return match.confidence === 'exact' || match.confidence === 'high'
}
