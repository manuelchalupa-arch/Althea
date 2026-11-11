import { findCfMovement } from './cfMovementCatalog'
import type { CfModality, CfSessionKind } from './types'

/**
 * Clasificación automática G/M/W de movimientos y WODs.
 * Primero consulta el catálogo CrossFit (fuente canónica); si el movimiento
 * no está, aplica reglas por nombre. El usuario puede sobreescribir la
 * clasificación del WOD (modalitiesManual).
 */

// Ojo con el orden: 'ring row' es gimnasia, no remo; 'handstand push-up' es G,
// no weightlifting.
const RULES: { re: RegExp; modality: CfModality }[] = [
  {
    re: /(pull[- ]?up|chest[- ]?to[- ]?bar|muscle[- ]?up|toes[- ]?to[- ]?bar|knees[- ]?to[- ]?elbows|push[- ]?up|ring row|ring dip|dip|handstand|rope climb|sit[- ]?up|air squat|pistol|knee raise|jumping jack|abmat|double under|duble)/i,
    modality: 'G',
  },
  {
    re: /(running|correr|carrera|rowing|remo|skierg|ski erg|echo bike|assault bike|bike erg|bici|burpee|box jump|shuttle|wall ball|farmer|sled|caminata|carry|suicidio|jump rope|soga|double under)/i,
    modality: 'M',
  },
  {
    re: /(clean|snatch|jerk|squat|deadlift|thruster|high pull|sdlhp|press|lunge)/i,
    modality: 'W',
  },
]

const ORDER: CfModality[] = ['G', 'M', 'W']

/** Modalidad de un movimiento por nombre (catálogo → reglas → M por defecto). */
export function modalityOfMovement(name: string): CfModality {
  const def = findCfMovement(name)
  if (def) { return def.modality }
  for (const rule of RULES) {
    if (rule.re.test(name)) { return rule.modality }
  }
  return 'M'
}

/**
 * Modalidades de un WOD a partir de sus movimientos, ordenadas G, M, W.
 * Ejemplos: Carrera + remo → M; Pull-Ups + Push-Ups → G; Back Squat +
 * Deadlift → W; Thruster + Pull-Ups → W + G (→ G+W); Remo + Thrusters +
 * Toes-to-Bar → M+W+G (→ G+M+W).
 */
export function classifyModalities(names: string[]): CfModality[] {
  const found = new Set<CfModality>()
  for (const n of names) {
    if (n.trim()) { found.add(modalityOfMovement(n)) }
  }
  return ORDER.filter((m) => found.has(m))
}

/** Clase de sesión para la programación (G, M, W, G+M, ..., rest). */
export function sessionKindOf(modalities: CfModality[]): CfSessionKind {
  const sorted = ORDER.filter((m) => modalities.includes(m))
  if (sorted.length === 0) { return 'rest' }
  return sorted.join('+') as CfSessionKind
}
