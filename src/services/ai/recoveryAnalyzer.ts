// RECOVERY ANALYZER — Sueño, estrés, fatiga acumulada, correlación
import { db } from '@/services/storage/db'
import type { RecoveryCheck } from '@/types'

export interface RecoveryContext {
  lastScore: number | null
  lastCheck: { energy: number; fatigue: number; pain: number; mood: number; stress: number } | null
  trend: 'improving' | 'stable' | 'declining'
  consecutiveLow: number // días consecutivos con score < 60
  energyAvg: number // promedio energía últimos 3 días
  fatigueAvg: number
}

/** Analizar estado de recuperación reciente */
export async function analyzeRecovery(): Promise<RecoveryContext> {
  const checks: RecoveryCheck[] = await db.recoveryChecks.toArray().catch((): RecoveryCheck[] => [])
  const sorted = checks
    .filter(c => typeof c.score === 'number')
    .sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || '')))

  const last = sorted[sorted.length - 1]
  const lastScore = last?.score ?? null
  const lastCheck = last ? {
    energy: Number(last.energy ?? 5),
    fatigue: Number(last.fatigue ?? 5),
    pain: Number(last.soreness ?? 0),
    mood: Number(last.motivation ?? 5),
    stress: Number(last.stress ?? 5),
  } : null

  // Tendencia
  const recent3 = sorted.slice(-3).map(s => s.score)
  const prev3 = sorted.slice(-6, -3).map(s => s.score)
  const avgRecent = recent3.length ? recent3.reduce((a, b) => a + b, 0) / recent3.length : 50
  const avgPrev = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : avgRecent
  let trend: RecoveryContext['trend'] = 'stable'
  if (avgRecent > avgPrev * 1.05) {trend = 'improving'}
  else if (avgRecent < avgPrev * 0.95) {trend = 'declining'}

  // Días consecutivos con score bajo
  let consecutiveLow = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].score < 60) {consecutiveLow++}
    else {break}
  }

  // Promedios
  const last3Energy = sorted.slice(-3).map(s => Number(s.energy ?? 5))
  const last3Fatigue = sorted.slice(-3).map(s => Number(s.fatigue ?? 5))
  const energyAvg = last3Energy.length ? last3Energy.reduce((a, b) => a + b, 0) / last3Energy.length : 5
  const fatigueAvg = last3Fatigue.length ? last3Fatigue.reduce((a, b) => a + b, 0) / last3Fatigue.length : 5

  return {
    lastScore,
    lastCheck,
    trend,
    consecutiveLow,
    energyAvg,
    fatigueAvg,
  }
}
