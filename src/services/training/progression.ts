import type { PlannedSetSnapshot, SetType } from './domain'

export type ProgressionRule =
  | { kind: 'linear'; incrementKg: number }
  | { kind: 'greyskull'; amrapSetIndex: number; incrementKg: number; minRepsIncrease: number }
  | { kind: 'double'; repRange: [number, number]; incrementKg: number }

export interface ProgressionDecision {
  nextSets: PlannedSetSnapshot[]
  increasedLoad: boolean
  reason: string
}

function allCompletedAtTarget(sets: PlannedSetSnapshot[]): boolean {
  return sets.length > 0 && sets.every((s) => s.reps > 0)
}

function avgWeight(sets: PlannedSetSnapshot[]): number {
  const withWeight = sets.filter((s) => s.weight !== null)
  if (withWeight.length === 0) { return 0 }
  return withWeight.reduce((sum, s) => sum + (s.weight || 0), 0) / withWeight.length
}

function maxReps(sets: PlannedSetSnapshot[]): number {
  return sets.reduce((max, s) => Math.max(max, s.reps), 0)
}

function nextSetSnapshot(s: PlannedSetSnapshot, weight: number | null, reps: number): PlannedSetSnapshot {
  return { ...s, weight, reps }
}

export function computeNextTargets(
  previousSets: PlannedSetSnapshot[],
  rule: ProgressionRule,
): ProgressionDecision {
  if (previousSets.length === 0) {
    return { nextSets: [], increasedLoad: false, reason: 'Sin series previas; mantener objetivos actuales.' }
  }

  const done = previousSets.filter((s) => s.reps > 0)
  if (done.length === 0) {
    return { nextSets: previousSets, increasedLoad: false, reason: 'Sin series realizadas; no se aplica progresión.' }
  }

  switch (rule.kind) {
    case 'linear': {
      const allDone = allCompletedAtTarget(previousSets)
      const w = avgWeight(done)
      const nextWeight = allDone ? w + rule.incrementKg : w
      return {
        nextSets: done.map((s) => nextSetSnapshot(s, nextWeight, s.reps)),
        increasedLoad: allDone && rule.incrementKg > 0,
        reason: allDone
          ? `Todas completadas: +${rule.incrementKg} kg`
          : 'No todas completadas: mismo peso',
      }
    }
    case 'greyskull': {
      const amrapSet = done[rule.amrapSetIndex] ?? done[done.length - 1]
      const amrapReps = amrapSet.reps
      const otherSets = done.filter((_, i) => i !== rule.amrapSetIndex)
      const maxOtherReps = otherSets.length > 0 ? maxReps(otherSets) : amrapReps
      const w = avgWeight(done)
      const increase = amrapReps >= maxOtherReps + rule.minRepsIncrease
      const nextWeight = increase ? w + rule.incrementKg : w
      return {
        nextSets: done.map((s) =>
          s === amrapSet ? nextSetSnapshot(s, nextWeight, amrapReps) : nextSetSnapshot(s, nextWeight, s.reps)),
        increasedLoad: increase,
        reason: increase
          ? `AMRAP ${amrapReps} reps (>= ${maxOtherReps + rule.minRepsIncrease}): +${rule.incrementKg} kg`
          : `AMRAP ${amrapReps} reps (< ${maxOtherReps + rule.minRepsIncrease}): mismo peso`,
      }
    }
    case 'double': {
      const [minReps, maxReps_] = rule.repRange
      const allAtMax = done.every((s) => s.reps >= maxReps_)
      const w = avgWeight(done)
      if (allAtMax) {
        return {
          nextSets: done.map((s) => nextSetSnapshot(s, w + rule.incrementKg, minReps)),
          increasedLoad: true,
          reason: `Todas en ${maxReps_} reps: +${rule.incrementKg} kg, reiniciar a ${minReps} reps`,
        }
      }
      return {
        nextSets: done.map((s) => nextSetSnapshot(s, w, Math.min(s.reps + 1, maxReps_))),
        increasedLoad: false,
        reason: `Doble progresión: subir reps hacia ${maxReps_}, mismo peso`,
      }
    }
  }
}

export function explainDecision(d: ProgressionDecision): string {
  return d.reason
}

export type { SetType }
