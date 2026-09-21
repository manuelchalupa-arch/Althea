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
    if (s.status !== 'COMPLETED') {continue;}
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
    if (s.status !== 'COMPLETED') {continue;}
    const v = s.actualReps * s.actualWeight;
    const m = muscleOf(s.exerciseId);
    acc.set(m.primary, (acc.get(m.primary) ?? 0) + v * weights.primary);
    if (m.secondary[0]) {acc.set(m.secondary[0], (acc.get(m.secondary[0]) ?? 0) + v * weights.secondary1);}
    if (m.secondary[1]) {acc.set(m.secondary[1], (acc.get(m.secondary[1]) ?? 0) + v * weights.secondary2);}
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
  if (!currentFirstSet || !lastFirstSet) {return null;}
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
  if (sorted.length < 2) {return null}
  const base = sorted[0]
  const keys = (['w', 'r', 's', 'v'] as const).filter((k) => base[k] > 0)
  if (keys.length === 0) {return null}
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

// ---- Proyección y balance carga/fatiga (ET15) ----
// Proyección lineal ingenua sobre valores ordenados por fecha. Solo con
// evidencia suficiente (≥4 puntos); siempre etiquetada como estimación,
// nunca como hecho.
export interface ProgressProjection {
  estimate: number
  basis: string
  kind: 'estimacion'
}

export function projectProgress(points: Array<{ date?: string; value: number }>): ProgressProjection | null {
  const sorted = points.slice().sort((a, b) => {
    if (a.date !== undefined && b.date !== undefined) { return a.date < b.date ? -1 : 1 }
    return 0
  })
  if (sorted.length < 4) { return null }
  const n = sorted.length
  const xs = sorted.map((_, i) => i)
  const ys = sorted.map(p => p.value)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  const denom = xs.reduce((a, x) => a + (x - meanX) * (x - meanX), 0)
  if (denom === 0) { return null }
  const slope = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0) / denom
  const estimate = Math.round((meanY + slope * (n - meanX)) * 10) / 10
  return {
    estimate,
    basis: `Estimación por tendencia lineal de ${n} observaciones (no es un hecho).`,
    kind: 'estimacion',
  }
}

export interface LoadFatigueInput {
  volume7d: number
  sessions7d: number
  plannedSessions7d?: number
  fatigueAvg?: number | null // 0-10 declarado por el usuario
  sleepAvg?: number | null // horas declaradas
}

export interface LoadFatigueBalance {
  load: 'bajo' | 'moderado' | 'alto'
  reportedFatigue: number | null
  balance: 'ok' | 'atencion' | 'sobrecarga-posible' | 'datos-insuficientes'
  basis: string
}

// Carga CALCULADA vs fatiga DECLARADA: nunca se afirma fatiga fisiológica
// estimada como medición. Sin volumen ni fatiga declarada → insuficiente.
export function loadFatigueBalance(input: LoadFatigueInput): LoadFatigueBalance {
  const { volume7d, sessions7d, plannedSessions7d, fatigueAvg, sleepAvg } = input
  if (!(volume7d > 0) && !(sessions7d > 0)) {
    return {
      load: 'bajo', reportedFatigue: null,
      balance: 'datos-insuficientes',
      basis: 'Sin volumen registrado en 7 días: no se evalúa balance.',
    }
  }
  const load: LoadFatigueBalance['load'] =
    volume7d >= 10000 || sessions7d >= 5 ? 'alto' : volume7d >= 4000 || sessions7d >= 3 ? 'moderado' : 'bajo'
  const reportedFatigue = typeof fatigueAvg === 'number' ? fatigueAvg : null
  let balance: LoadFatigueBalance['balance'] = 'ok'
  let basis = `Carga calculada ${load} (${volume7d} kg en ${sessions7d} sesiones/7d).`
  if (reportedFatigue === null) {
    basis += ' Sin fatiga declarada: no se puede contrastar.'
  } else {
    basis += ` Fatiga declarada ${reportedFatigue}/10.`
    if ((load === 'alto' && reportedFatigue >= 7) || (sleepAvg !== null && sleepAvg !== undefined && sleepAvg < 6 && load !== 'bajo')) {
      balance = 'sobrecarga-posible'
      basis += ' Coinciden carga alta y malestar declarado: considerar descarga (decisión del usuario).'
    } else if (load === 'alto' || reportedFatigue >= 7) {
      balance = 'atencion'
      basis += ' Observar evolución antes de ajustar.'
    }
  }
  void plannedSessions7d
  return { load, reportedFatigue, balance, basis }
}

// ---- Períodos de análisis (FASE 5) ----
export type AnalysisPeriod = '7' | '30' | '90' | '365' | 'all' | 'custom'

// Ventana inclusiva [hoy-(n-1), hoy] en YYYY-MM-DD. Puro y testeable.
export function isDateInPeriod(
  dateStr: string,
  period: AnalysisPeriod,
  opts: { customStart?: string; customEnd?: string; today?: string } = {},
): boolean {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  if (period === 'all') { return true }
  if (period === 'custom') {
    if (opts.customStart && dateStr < opts.customStart) { return false }
    if (opts.customEnd && dateStr > opts.customEnd) { return false }
    return true
  }
  const cut = new Date(today + 'T12:00:00')
  cut.setDate(cut.getDate() - Number(period) + 1)
  const cutStr = cut.toISOString().slice(0, 10)
  return dateStr >= cutStr && dateStr <= today
}

// ---- Carga muscular real (FASE 5) ----
// Distribuye VOLUMEN (kg×reps ejecutado), no conteo de registros:
// primario 1.0, secundarios 0.5/0.25. Sin info muscular → cubo "sin
// atribución" (nunca se inventa un porcentaje).
export interface MuscleLoadInput { exerciseId: string; volume: number }
export interface MuscleLoad { muscle: string; volume: number; sets: number; pct: number }
export interface MuscleLoadResult {
  loads: MuscleLoad[]
  totalVolume: number
  unmappedVolume: number
  unmappedSets: number
}

export function muscleLoadOf(
  items: MuscleLoadInput[],
  muscleOf: (exerciseId: string) => { primary: string; secondary: string[] } | null,
  weights = { primary: 1, secondary1: 0.5, secondary2: 0.25 },
): MuscleLoadResult {
  const acc = new Map<string, { volume: number; sets: number }>()
  let unmappedVolume = 0, unmappedSets = 0
  const add = (muscle: string, v: number) => {
    const cur = acc.get(muscle) || { volume: 0, sets: 0 }
    cur.volume += v
    cur.sets += 1
    acc.set(muscle, cur)
  }
  for (const it of items) {
    if (!(it.volume > 0)) { continue }
    const m = muscleOf(it.exerciseId)
    if (!m) { unmappedVolume += it.volume; unmappedSets += 1; continue }
    add(m.primary, it.volume * weights.primary)
    if (m.secondary[0]) { add(m.secondary[0], it.volume * weights.secondary1) }
    if (m.secondary[1]) { add(m.secondary[1], it.volume * weights.secondary2) }
  }
  const totalVolume = [...acc.values()].reduce((a, b) => a + b.volume, 0)
  const loads = [...acc.entries()]
    .map(([muscle, v]) => ({
      muscle,
      volume: Math.round(v.volume * 10) / 10,
      sets: v.sets,
      pct: totalVolume ? Math.round((v.volume / totalVolume) * 100) : 0,
    }))
    .sort((a, b) => b.volume - a.volume)
  return { loads, totalVolume: Math.round(totalVolume * 10) / 10, unmappedVolume: Math.round(unmappedVolume * 10) / 10, unmappedSets }
}

// Volumen por parte corporal (para geometría del heatmap): suma directa
// del volumen de cada set a su parte, sin doble conteo.
export function partVolumeOf(
  items: Array<{ exerciseId: string; volume: number }>,
  partOf: (exerciseId: string) => string | null,
): { volumes: Record<string, number>; unmappedVolume: number } {
  const volumes: Record<string, number> = {}
  let unmappedVolume = 0
  for (const it of items) {
    if (!(it.volume > 0)) { continue }
    const p = partOf(it.exerciseId)
    if (!p) { unmappedVolume += it.volume; continue }
    volumes[p] = (volumes[p] ?? 0) + it.volume
  }
  const rounded: Record<string, number> = {}
  for (const [k, v] of Object.entries(volumes)) { rounded[k] = Math.round(v * 10) / 10 }
  return { volumes: rounded, unmappedVolume: Math.round(unmappedVolume * 10) / 10 }
}

// Zonas sin exposición en el período (solo si el período TIENE datos;
// sin datos → lista vacía y la UI muestra "Sin datos").
export function forgottenParts(partVolumes: Record<string, number>, universe: string[]): string[] {
  const total = Object.values(partVolumes).reduce((a, b) => a + b, 0)
  if (total <= 0) { return [] }
  return universe.filter(p => !(partVolumes[p] > 0))
}
