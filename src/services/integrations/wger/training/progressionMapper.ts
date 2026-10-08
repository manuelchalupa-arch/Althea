// wgerProgressionMapper — Convierte progresiones WGER → reglas Althea.
// FASE 9: Progresiones. La progresión importada se convierte en REGLAS.
// NUNCA modificar automáticamente la rutina del usuario.

import type { WgerProgressionConfig, WgerExerciseConfig, WgerSetConfig } from './types'

// ─── Tipos de progresión Althea ───
export type AltheaProgressionType = 'weight' | 'reps' | 'sets' | 'rir' | 'rest' | 'max' | 'min'
export type AltheaProgressionMode = 'absolute' | 'percentage' | 'fixed'

export interface AltheaProgressionRule {
  id: string
  source: 'wger'
  sourceId: number
  exerciseId: string
  progressionType: AltheaProgressionType
  progressionMode: AltheaProgressionMode
  value: number
  minValue?: number
  maxValue?: number
  step?: number
  condition?: string
  iteration?: number
  comment?: string
  createdAt: string
  // Metadatos de WGER
  wgerTrainingPlanId?: number
  wgerExerciseId?: number
}

// ─── Mapear tipo de progresión WGER → Althea ───
function mapProgressionType(type: string): AltheaProgressionType {
  const t = type.toLowerCase()
  if (t === 'weight') {return 'weight'}
  if (t === 'reps') {return 'reps'}
  if (t === 'sets') {return 'sets'}
  if (t === 'rir') {return 'rir'}
  if (t === 'rest') {return 'rest'}
  if (t === 'max') {return 'max'}
  if (t === 'min') {return 'min'}
  return 'weight'
}

// ─── Mapear modo de progresión WGER → Althea ───
function mapProgressionMode(mode: string): AltheaProgressionMode {
  const m = mode.toLowerCase()
  if (m === 'absolute') {return 'absolute'}
  if (m === 'percentage') {return 'percentage'}
  if (m === 'fixed') {return 'fixed'}
  return 'absolute'
}

// ─── Mapear WgerProgressionConfig → AltheaProgressionRule ───
export function mapWgerProgressionToAlthea(config: WgerProgressionConfig): AltheaProgressionRule {
  return {
    id: `wger-progression-${config.id}`,
    source: 'wger',
    sourceId: config.id,
    exerciseId: `wger-exercise-${config.exercise}`,
    progressionType: mapProgressionType(config.progression_type),
    progressionMode: mapProgressionMode(config.progression_mode),
    value: config.value,
    minValue: config.min_value ?? undefined,
    maxValue: config.max_value ?? undefined,
    step: config.step ?? undefined,
    condition: config.condition ?? undefined,
    iteration: config.iteration ?? undefined,
    comment: config.comment ?? undefined,
    createdAt: new Date().toISOString(),
    wgerTrainingPlanId: config.training_plan,
    wgerExerciseId: config.exercise,
  }
}

// ─── Mapear AltheaProgressionRule → WgerProgressionConfig ───
export function mapAltheaProgressionToWger(rule: AltheaProgressionRule): WgerProgressionConfig {
  return {
    id: rule.sourceId,
    training_plan: rule.wgerTrainingPlanId ?? 0,
    exercise: rule.wgerExerciseId ?? 0,
    progression_type: rule.progressionType,
    progression_mode: rule.progressionMode,
    value: rule.value,
    min_value: rule.minValue ?? null,
    max_value: rule.maxValue ?? null,
    step: rule.step ?? null,
    condition: rule.condition ?? null,
    iteration: rule.iteration ?? null,
    comment: rule.comment ?? null,
  }
}

// ─── Mapear WgerExerciseConfig → regla Althea con progresión ───
export function mapWgerExerciseConfigToAlthea(config: WgerExerciseConfig): AltheaProgressionRule | null {
  if (!config.progression_config) {return null}
  return mapWgerProgressionToAlthea(config.progression_config)
}

// ─── Mapear WgerSetConfig → regla Althea ───
export function mapWgerSetConfigToAlthea(_config: WgerSetConfig): AltheaProgressionRule | null {
  // Si no hay progresión explícita, no crear regla
  return null
}

// ─── Crear propuesta de progresión (NO modifica rutina) ───
export interface ProgressionProposal {
  exerciseId: string
  currentValue: number
  proposedValue: number
  progressionType: AltheaProgressionType
  progressionMode: AltheaProgressionMode
  reason: string
  rule: AltheaProgressionRule
}

export function createProgressionProposal(
  rule: AltheaProgressionRule,
  currentValue: number,
): ProgressionProposal {
  let proposedValue = currentValue

  switch (rule.progressionMode) {
    case 'absolute':
      proposedValue = currentValue + rule.value
      break
    case 'percentage':
      proposedValue = currentValue * (1 + rule.value / 100)
      break
    case 'fixed':
      proposedValue = rule.value
      break
  }

  // Aplicar límites min/max
  if (rule.minValue !== undefined) {
    proposedValue = Math.max(proposedValue, rule.minValue)
  }
  if (rule.maxValue !== undefined) {
    proposedValue = Math.min(proposedValue, rule.maxValue)
  }

  // Aplicar step si existe
  if (rule.step !== undefined && rule.step > 0) {
    proposedValue = Math.round(proposedValue / rule.step) * rule.step
  }

  return {
    exerciseId: rule.exerciseId,
    currentValue,
    proposedValue,
    progressionType: rule.progressionType,
    progressionMode: rule.progressionMode,
    reason: rule.comment || `Progresión ${rule.progressionType} (${rule.progressionMode})`,
    rule,
  }
}

// ─── Evaluar condición de progresión ───
export function evaluateProgressionCondition(
  condition: string | undefined,
  context: Record<string, unknown>,
): boolean {
  if (!condition) {return true}  // Sin condición = siempre aplica

  // Evaluación simple de condiciones comunes
  // Ej: "reps >= 12", "weight < 100", "rpe <= 8"
  try {
    const parts = condition.split(/\s+/)
    if (parts.length >= 3) {
      const [field, op, valueStr] = parts
      const value = parseFloat(valueStr)
      const contextValue = context[field]

      if (typeof contextValue === 'number') {
        switch (op) {
          case '>=': return contextValue >= value
          case '<=': return contextValue <= value
          case '>': return contextValue > value
          case '<': return contextValue < value
          case '==': return contextValue === value
          case '!=': return contextValue !== value
        }
      }
    }
  } catch {
    // Si no se puede evaluar, asumir true
  }

  return true
}

// ─── Obtener todas las reglas de progresión de un plan ───
export function getProgressionRulesForExercise(
  rules: AltheaProgressionRule[],
  exerciseId: string,
): AltheaProgressionRule[] {
  return rules.filter((r) => r.exerciseId === exerciseId)
}

// ─── Ordenar reglas por iteración ───
export function sortRulesByIteration(rules: AltheaProgressionRule[]): AltheaProgressionRule[] {
  return [...rules].sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0))
}
