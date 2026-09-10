// ALGORITMO DE SIMILITUD DE EJERCICIOS (§3-9) — reemplazo inteligente.
// Usa SOLO metadatos reales de ExerciseGymGifsDB. Si un atributo falta:
// "dato no disponible" y se excluye del denominador (nunca cuenta como coincidencia).
//
// Variables y pesos (denominador = suma de pesos DISPONIBLES):
//   grupo muscular (muscle) ............ 30
//   músculo principal (muscle) ......... 20
//   músculos secundarios ................ 15  (parcial proporcional al solapamiento)
//   tipo de movimiento (category) ....... 12
//   patrón biomecánico .................. 10  (NO disponible en la API -> siempre excluido)
//   parte corporal (bodyPart) ........... 13
// 100% solo si TODO lo disponible coincide.
// Desempate (§8): 1) más músculos en común 2) mismo equipo 3) misma dificultad
// (no disponible -> se salta) 4) mayor historial del usuario.
import type { Exercise } from '@/services/exerciseGym'

export interface FactorResult {
  key: string
  label: string
  state: 'match' | 'miss' | 'partial' | 'unavailable'
  detail: string
}

export interface SimilarityResult {
  exercise: Exercise
  score: number // 0-100
  factors: FactorResult[]
  sharedMuscles: number
  sameEquipment: boolean
  historyCount: number
}

const norm = (s: string) => (s || '').toLowerCase().trim()

function overlap(a: string[], b: string[]): number {
  const sb = new Set(b.map(norm))
  return a.filter((x) => sb.has(norm(x))).length
}

export function similarityFactors(original: Exercise, candidate: Exercise): { factors: FactorResult[]; earned: number; denominator: number; sharedMuscles: number; sameEquipment: boolean } {
  const factors: FactorResult[] = []
  let earned = 0
  let denominator = 0
  const oSec = original.secondaryMuscles || []
  const cSec = candidate.secondaryMuscles || []
  const sharedSec = overlap(oSec, cSec)
  const sharedMuscles = (norm(original.muscle) === norm(candidate.muscle) ? 1 : 0) + sharedSec

  // 1. grupo muscular (30)
  if (original.muscle && candidate.muscle) {
    denominator += 30
    if (norm(original.muscle) === norm(candidate.muscle)) {
      earned += 30
      factors.push({ key: 'grupo', label: 'Mismo grupo muscular', state: 'match', detail: original.muscle })
    } else {
      factors.push({ key: 'grupo', label: 'Mismo grupo muscular', state: 'miss', detail: `${original.muscle} ≠ ${candidate.muscle}` })
    }
  } else {
    factors.push({ key: 'grupo', label: 'Mismo grupo muscular', state: 'unavailable', detail: 'dato no disponible' })
  }

  // 2. músculo principal (20) — la API expone un único músculo primario
  if (original.muscle && candidate.muscle) {
    denominator += 20
    if (norm(original.muscle) === norm(candidate.muscle)) {
      earned += 20
      factors.push({ key: 'principal', label: 'Músculo principal coincidente', state: 'match', detail: original.muscle })
    } else {
      factors.push({ key: 'principal', label: 'Músculo principal coincidente', state: 'miss', detail: `${original.muscle} ≠ ${candidate.muscle}` })
    }
  } else {
    factors.push({ key: 'principal', label: 'Músculo principal coincidente', state: 'unavailable', detail: 'dato no disponible' })
  }

  // 3. secundarios (15, parcial proporcional)
  if (oSec.length > 0 && cSec.length > 0) {
    denominator += 15
    const ratio = sharedSec / Math.max(oSec.length, cSec.length)
    if (ratio >= 1) {
      earned += 15
      factors.push({ key: 'secundarios', label: 'Músculos secundarios', state: 'match', detail: oSec.join(', ') })
    } else if (ratio > 0) {
      earned += Math.round(15 * ratio)
      factors.push({ key: 'secundarios', label: 'Músculos secundarios', state: 'partial', detail: `Coinciden ${sharedSec} de ${Math.max(oSec.length, cSec.length)}` })
    } else {
      factors.push({ key: 'secundarios', label: 'Músculos secundarios', state: 'miss', detail: 'Sin solapamiento' })
    }
  } else {
    factors.push({ key: 'secundarios', label: 'Músculos secundarios', state: 'unavailable', detail: 'dato no disponible' })
  }

  // 4. tipo de movimiento ≈ category (12)
  if (original.category && candidate.category) {
    denominator += 12
    if (norm(original.category) === norm(candidate.category)) {
      earned += 12
      factors.push({ key: 'tipo', label: 'Tipo de movimiento coincidente', state: 'match', detail: original.category })
    } else {
      factors.push({ key: 'tipo', label: 'Tipo de movimiento coincidente', state: 'miss', detail: `${original.category} ≠ ${candidate.category}` })
    }
  } else {
    factors.push({ key: 'tipo', label: 'Tipo de movimiento coincidente', state: 'unavailable', detail: 'dato no disponible' })
  }

  // 5. patrón biomecánico (10) — la API no lo expone: nunca disponible, nunca suma
  factors.push({ key: 'patron', label: 'Patrón biomecánico', state: 'unavailable', detail: 'dato no disponible en la API' })

  // 6. parte corporal (13)
  if (original.bodyPart && candidate.bodyPart) {
    denominator += 13
    if (norm(original.bodyPart) === norm(candidate.bodyPart)) {
      earned += 13
      factors.push({ key: 'parte', label: 'Parte corporal coincidente', state: 'match', detail: original.bodyPart })
    } else {
      factors.push({ key: 'parte', label: 'Parte corporal coincidente', state: 'miss', detail: `${original.bodyPart} ≠ ${candidate.bodyPart}` })
    }
  } else {
    factors.push({ key: 'parte', label: 'Parte corporal coincidente', state: 'unavailable', detail: 'dato no disponible' })
  }

  const sameEquipment = !!original.equipment && !!candidate.equipment && norm(original.equipment) === norm(candidate.equipment)
  return { factors, earned, denominator, sharedMuscles, sameEquipment }
}

export function similarityScore(original: Exercise, candidate: Exercise): { score: number; factors: FactorResult[]; sharedMuscles: number; sameEquipment: boolean } {
  const r = similarityFactors(original, candidate)
  const score = r.denominator > 0 ? Math.round((r.earned / r.denominator) * 100) : 0
  return { score, factors: r.factors, sharedMuscles: r.sharedMuscles, sameEquipment: r.sameEquipment }
}

// Ranking restringido al MISMO grupo muscular (§3.1, §9): nunca expande a otros grupos.
export function rankReplacements(
  original: Exercise,
  candidates: Exercise[],
  historyCountOf: (exerciseId: string) => number = () => 0,
): SimilarityResult[] {
  const same = candidates.filter(
    (c) => c.id !== original.id && norm(c.muscle) === norm(original.muscle),
  )
  const ranked = same.map((c) => {
    const s = similarityScore(original, c)
    return { exercise: c, score: s.score, factors: s.factors, sharedMuscles: s.sharedMuscles, sameEquipment: s.sameEquipment, historyCount: historyCountOf(c.id) }
  })
  ranked.sort((a, b) =>
    b.score - a.score ||
    b.sharedMuscles - a.sharedMuscles ||
    Number(b.sameEquipment) - Number(a.sameEquipment) ||
    b.historyCount - a.historyCount,
  )
  return ranked
}
