// Métricas recalculables desde SetRecord/SessionExercise (§35-37, §39). Sin doble fuente.
import type { SetRecord, SessionExercise } from './domain';

export interface Completion { exPct: number; setPct: number; completedEx: number; plannedEx: number; completedSets: number; plannedSets: number }

export function completionOf(exercises: SessionExercise[], sets: SetRecord[]): Completion {
  const plannedEx = exercises.length;
  const completedEx = exercises.filter((e) => e.status === 'COMPLETED').length;
  const plannedSets = exercises.reduce((a, e) => a + e.plannedSetCount, 0);
  const completedSets = sets.filter((s) => s.status === 'COMPLETED').length;
  return {
    exPct: plannedEx ? Math.round((completedEx / plannedEx) * 100) : 0,
    setPct: plannedSets ? Math.round((completedSets / plannedSets) * 100) : 0,
    completedEx, plannedEx, completedSets, plannedSets,
  };
}

export function volumeOf(sets: SetRecord[]): { reps: number; volume: number } {
  let reps = 0, volume = 0;
  for (const s of sets) {
    if (s.status !== 'COMPLETED') continue;
    reps += s.actualReps;
    volume += s.actualReps * s.actualWeight;
  }
  return { reps, volume: Math.round(volume * 10) / 10 };
}

// Trabajo muscular SOLO de lo ejecutado (§36). Ponderación configurable: primario 1, secundarios 0.5/0.25.
export function muscleWorkOf(
  sets: SetRecord[],
  muscleOf: (exerciseId: string) => { primary: string; secondary: string[] },
  weights = { primary: 1, secondary1: 0.5, secondary2: 0.25 },
): Array<{ muscle: string; volume: number; pct: number }> {
  const acc = new Map<string, number>();
  for (const s of sets) {
    if (s.status !== 'COMPLETED') continue;
    const v = s.actualReps * s.actualWeight;
    const m = muscleOf(s.exerciseId);
    acc.set(m.primary, (acc.get(m.primary) ?? 0) + v * weights.primary);
    if (m.secondary[0]) acc.set(m.secondary[0], (acc.get(m.secondary[0]) ?? 0) + v * weights.secondary1);
    if (m.secondary[1]) acc.set(m.secondary[1], (acc.get(m.secondary[1]) ?? 0) + v * weights.secondary2);
  }
  const total = [...acc.values()].reduce((a, b) => a + b, 0);
  return [...acc.entries()]
    .map(([muscle, volume]) => ({ muscle, volume: Math.round(volume * 10) / 10, pct: total ? Math.round((volume / total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);
}

export interface ProgressDelta { repsDelta: number; weightDelta: number; volumeDelta: number; label: string }

// Progreso serie 1 vs última ejecución del MISMO exerciseId (excluye sesión actual por fecha).
export function progressVsLast(
  currentFirstSet: { reps: number; weight: number } | null,
  lastFirstSet: { reps: number; weight: number; date: string } | null,
): ProgressDelta | null {
  if (!currentFirstSet || !lastFirstSet) return null;
  const repsDelta = currentFirstSet.reps - lastFirstSet.reps;
  const weightDelta = Math.round((currentFirstSet.weight - lastFirstSet.weight) * 10) / 10;
  const volumeDelta = Math.round((currentFirstSet.reps * currentFirstSet.weight - lastFirstSet.reps * lastFirstSet.weight) * 10) / 10;
  const fmt = (n: number, unit: string) => `${n >= 0 ? '+' : ''}${n}${unit}`;
  return {
    repsDelta, weightDelta, volumeDelta,
    label: `Última vez ${lastFirstSet.date}: ${lastFirstSet.reps}x${lastFirstSet.weight}kg → hoy ${currentFirstSet.reps}x${currentFirstSet.weight}kg (${fmt(repsDelta, ' reps')}, ${fmt(weightDelta, ' kg')})`,
  };
}

/**
 * ÍNDICE DE PROGRESO COMBINADO (§15) — combina peso, reps, series y volumen.
 * Por fecha: W = mejor peso, R = suma reps, S = cantidad series, V = suma volumen.
 * Cada componente se normaliza contra la PRIMERA fecha del rango (base); los
 * componentes con base 0 se excluyen (sin ficticios). Índice = 100 × media de
 * ratios disponibles. Recalculable desde el historial original. Ninguna variable
 * domina: todas pesan 1/n. Sin datos suficientes (<2 fechas) → null.
 */
export interface CombinedPoint { date: string; w: number; r: number; s: number; v: number }
export function combinedIndexOf(points: CombinedPoint[]): Array<{ date: string; indice: number }> | null {
  const sorted = points.slice().sort((a, b) => (a.date < b.date ? -1 : 1))
  if (sorted.length < 2) return null
  const base = sorted[0]
  const keys = (['w', 'r', 's', 'v'] as const).filter((k) => base[k] > 0)
  if (keys.length === 0) return null
  return sorted.map((p) => {
    const ratios = keys.map((k) => p[k] / (base[k] as number))
    const mean = ratios.reduce((a, b) => a + b, 0) / keys.length
    return { date: p.date, indice: Math.round(mean * 100) }
  })
}

// Frecuencia: días entre sesiones con sets COMPLETED por músculo/ejercicio.
export function daysBetweenSessions(datesAsc: string[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < datesAsc.length; i++) {
    out.push(Math.round((new Date(datesAsc[i]).getTime() - new Date(datesAsc[i - 1]).getTime()) / 86400000));
  }
  return out;
}
