export const volume = (sets: number, reps: number, weight: number) => sets * reps * weight

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
  if (score >= 70) {return 'green'}
  if (score >= 45) {return 'yellow'}
  return 'red'
}
