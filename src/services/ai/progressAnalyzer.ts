// PROGRESS ANALYZER — Tendencia, plateau, correlación, predicción
import { db } from '@/services/storage/db'
import { unifiedCompletedSets } from '@/services/history'

export interface ProgressResult {
  trend: 'improving' | 'plateau' | 'declining'
  rate: number // % cambio por semana
  confidence: number // 0-1
  plateauWeeks: number // semanas en plateau
  volumeTrend: number[] // volúmenes semanales recientes
  sufficientData: boolean // evidencia mínima para afirmar tendencia/estancamiento
}

export const MIN_EXERCISE_LOGS = 8
export const MIN_GLOBAL_SESSIONS = 6

/** Analizar tendencia de un ejercicio específico */
export async function analyzeExercise(
  exerciseId: string,
  weeks = 8,
): Promise<ProgressResult> {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)
  const sinceStr = since.toISOString()

  // Historial unificado y deduplicado (capa lógica única de lectura).
  const unified = await unifiedCompletedSets(exerciseId)

  const allLogs = unified
    .filter(l => l.createdAt >= sinceStr)
    .map(l => ({
      date: String(l.createdAt).slice(0, 10),
      weight: l.weight,
      reps: l.reps,
      volume: l.weight * l.reps,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (allLogs.length < 4) {
    return { trend: 'plateau', rate: 0, confidence: 0.3, plateauWeeks: 0, volumeTrend: [], sufficientData: false }
  }

  // Agrupar por semana
  const weeklyVolumes: Record<string, number> = {}
  for (const log of allLogs) {
    const week = getWeekKey(log.date)
    weeklyVolumes[week] = (weeklyVolumes[week] || 0) + log.volume
  }
  const volumes = Object.values(weeklyVolumes)
  const recentHalf = volumes.slice(-Math.ceil(volumes.length / 2))
  const prevHalf = volumes.slice(0, Math.floor(volumes.length / 2))

  const avgRecent = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length
  const avgPrev = prevHalf.length ? prevHalf.reduce((a, b) => a + b, 0) / prevHalf.length : avgRecent
  const changePct = avgPrev > 0 ? ((avgRecent - avgPrev) / avgPrev) * 100 : 0

  // Detectar plateau (sin cambio significativo en últimas 3+ semanas)
  let plateauWeeks = 0
  const last3 = volumes.slice(-3)
  if (last3.length >= 3) {
    const avg = last3.reduce((a, b) => a + b, 0) / 3
    const allSimilar = last3.every(v => Math.abs(v - avg) / avg < 0.05)
    if (allSimilar) {plateauWeeks = 3}
  }

  let trend: ProgressResult['trend'] = 'plateau'
  if (changePct > 5) {trend = 'improving'}
  else if (changePct < -5) {trend = 'declining'}

  return {
    trend,
    rate: changePct,
    confidence: Math.min(1, allLogs.length / 20),
    plateauWeeks,
    volumeTrend: volumes.slice(-6),
    sufficientData: allLogs.length >= MIN_EXERCISE_LOGS,
  }
}

/** Analizar tendencia global (todos los ejercicios) */
export async function analyzeGlobal(weeks = 4): Promise<ProgressResult> {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)
  const sinceStr = since.toISOString()

  const sessions: any[] = await db.trainingSessions.toArray().catch(() => [])
  const finals = sessions.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus) && s.calendarDate >= sinceStr.slice(0, 10))

  if (finals.length < 3) {
    return { trend: 'plateau', rate: 0, confidence: 0.2, plateauWeeks: 0, volumeTrend: [], sufficientData: false }
  }

  const weeklyVols: Record<string, number> = {}
  for (const s of finals) {
    const wk = getWeekKey(s.calendarDate)
    weeklyVols[wk] = (weeklyVols[wk] || 0) + Number(s.totalVolume || 0)
  }
  const volumes = Object.values(weeklyVols)
  if (volumes.length < 2) {
    return { trend: 'plateau', rate: 0, confidence: 0.3, plateauWeeks: 0, volumeTrend: volumes, sufficientData: false }
  }

  const first = volumes[0]
  const last = volumes[volumes.length - 1]
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0

  let trend: ProgressResult['trend'] = 'plateau'
  if (changePct > 5) {trend = 'improving'}
  else if (changePct < -5) {trend = 'declining'}

  return {
    trend,
    rate: changePct,
    confidence: Math.min(1, finals.length / 12),
    plateauWeeks: 0,
    volumeTrend: volumes.slice(-6),
    sufficientData: finals.length >= MIN_GLOBAL_SESSIONS,
  }
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}
