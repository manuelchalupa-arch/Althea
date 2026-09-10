export const volume = (sets: number, reps: number, weight: number) => sets * reps * weight
export const setVolume = (reps: number, weight: number) => reps * weight
export const tonnage = (logs: { reps: number; weight: number }[]) => logs.reduce((a, l) => a + l.reps * l.weight, 0)

export function recoveryScore(c: { energy:number; fatigue:number; stress:number; sleepQuality:number; soreness:number; motivation:number; digestion:number; hydration:number }): number {
  const raw = (c.energy*1.2 + (10-c.fatigue)*1.1 + (10-c.stress) + c.sleepQuality*1.1 + (10-c.soreness)*0.9 + c.motivation + c.digestion*0.7 + c.hydration*0.7) / 8.0 * 10
  return Math.max(0, Math.min(100, Math.round(raw)))
}
/**
 * ÍNDICE DE RECUPERACIÓN (§20) — cuestionario nuevo, escala 1–10.
 * Positivas (más = mejor): energy, mood, motivation.
 * Negativas (más = peor, se invierten con 11-v): fatigue, pain, perceivedExertion, stress.
 * painArea/painObservation son descriptivas y no ponderan.
 * Normalizado 0–100. Documentado también en la UI de Recuperación.
 */
export function recoveryIndex(c: { energy:number; fatigue:number; pain:number; mood:number; motivation:number; perceivedExertion:number; stress:number }): number {
  const clamp = (v:number)=> Math.max(1, Math.min(10, Number(v) || 1))
  const pos = clamp(c.energy) + clamp(c.mood) + clamp(c.motivation)
  const neg = (11 - clamp(c.fatigue)) + (11 - clamp(c.pain)) + (11 - clamp(c.perceivedExertion)) + (11 - clamp(c.stress))
  const raw = (pos + neg) / 70 * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}
export function recoveryColor(score:number): 'green'|'yellow'|'red' {
  if (score >= 70) return 'green'
  if (score >= 45) return 'yellow'
  return 'red'
}
export function suggestNextWeight(history: { weight:number; reps:number }[]): { weight:number; reason:string } {
  if (!history.length) return { weight: 20, reason: 'Sin historial – carga inicial conservadora' }
  const last = history[history.length-1]
  const avg = history.slice(-3).reduce((a,x)=>a+x.weight,0)/Math.min(3,history.length)
  if (history.length >=3 && history.every(h=>h.reps>=8)) return { weight: last.weight+2.5, reason: 'Últimas 3 sesiones con reps completas – progresión +2.5kg' }
  if (last.reps < 6) return { weight: Math.max(0, last.weight-2.5), reason: 'Reps por debajo del objetivo – reducir carga' }
  return { weight: avg, reason: `Promedio últimas 3: ${avg.toFixed(1)}kg` }
}
