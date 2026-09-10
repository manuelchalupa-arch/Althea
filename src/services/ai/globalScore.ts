// PUNTUACIÓN GLOBAL (§21) — 0–100 explicable y reproducible, con historial.
// Fórmula documentada: base 50 + factores con topes. Cada factor indica su estado.
// Nunca un número arbitrario: cada delta tiene su evidencia.
import { db } from '@/services/storage/db'

export interface ScoreFactor { label: string; delta: number; estado: string }
export interface GlobalScore { score: number; factors: ScoreFactor[]; date: string }

export interface ScoreInput {
  adherencePct: number | null // % sesiones 14d (null = sin plan medible)
  recoveryLast: number | null // último índice 0-100
  hydrationMl: number | null // ml hoy
  improvedRecently: boolean | null // mejora vs anterior (null = sin datos)
  regressedRecently: boolean | null
  painMax7d: number | null // peor dolor 0-10 últimos 7d
  proteinPctGoal: number | null // % del objetivo (estimado)
  gapDays: number | null // días desde última sesión
}

export function computeGlobalScore(i: ScoreInput): GlobalScore {
  const factors: ScoreFactor[] = []
  let score = 50
  const add = (label: string, delta: number, estado: string) => {
    score += delta
    factors.push({ label, delta, estado })
  }
  if (i.adherencePct == null) factors.push({ label: 'Adherencia', delta: 0, estado: 'sin plan medible' })
  else if (i.adherencePct >= 85) add('Adherencia', 15, `${i.adherencePct}%: positivo`)
  else if (i.adherencePct >= 60) add('Adherencia', 5, `${i.adherencePct}%: aceptable`)
  else add('Adherencia', -10, `${i.adherencePct}%: baja`)

  if (i.recoveryLast == null) factors.push({ label: 'Recuperación', delta: 0, estado: 'sin registro reciente' })
  else if (i.recoveryLast >= 70) add('Recuperación', 10, `${i.recoveryLast}: buena`)
  else if (i.recoveryLast >= 45) add('Recuperación', 0, `${i.recoveryLast}: moderada`)
  else add('Recuperación', -10, `${i.recoveryLast}: baja`)

  if (i.hydrationMl == null) factors.push({ label: 'Hidratación', delta: 0, estado: 'sin registro hoy' })
  else if (i.hydrationMl >= 2000) add('Hidratación', 5, `${i.hydrationMl}ml: adecuada`)
  else if (i.hydrationMl >= 1000) add('Hidratación', 0, `${i.hydrationMl}ml: moderada`)
  else add('Hidratación', -5, `${i.hydrationMl}ml: baja`)

  if (i.improvedRecently === true) add('Progreso', 10, 'mejora reciente')
  else if (i.regressedRecently === true) add('Progreso', -5, 'caída reciente')
  else factors.push({ label: 'Progreso', delta: 0, estado: 'sin datos suficientes' })

  if (i.painMax7d == null) factors.push({ label: 'Dolor', delta: 0, estado: 'sin registros' })
  else if (i.painMax7d >= 4) add('Dolor', -5, `máx ${i.painMax7d}/10 en 7d`)
  else add('Dolor', 0, `máx ${i.painMax7d}/10: leve`)

  if (i.proteinPctGoal == null) factors.push({ label: 'Proteína', delta: 0, estado: 'sin datos' })
  else if (i.proteinPctGoal >= 80) add('Proteína', 5, `${Math.round(i.proteinPctGoal)}% del objetivo`)
  else if (i.proteinPctGoal >= 50) add('Proteína', 0, `${Math.round(i.proteinPctGoal)}% (estimado)`)
  else add('Proteína', -5, `${Math.round(i.proteinPctGoal)}% (estimado)`)

  if (i.gapDays == null) factors.push({ label: 'Continuidad', delta: 0, estado: 'sin sesiones' })
  else if (i.gapDays >= 7) add('Continuidad', -10, `${i.gapDays} días sin entrenar`)
  else if (i.gapDays >= 4) add('Continuidad', -3, `${i.gapDays} días sin entrenar`)
  else add('Continuidad', 3, 'ritmo activo')

  return { score: Math.max(0, Math.min(100, Math.round(score))), factors, date: new Date().toISOString().slice(0, 10) }
}

// Recolecta inputs reales y persiste snapshot diario (upsert por fecha).
export async function buildGlobalScore(): Promise<GlobalScore> {
  const today = new Date().toISOString().slice(0, 10)
  const since = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
  }
  let adherencePct: number | null = null
  let gapDays: number | null = null
  let improved: boolean | null = null
  let regressed: boolean | null = null
  try {
    const official: any[] = await db.table('trainingSessions').toArray().catch(() => [])
    const finals = official.filter((s) => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus))
    const p: any = await db.userProfile.get('me')
    const cycle = p?.cycle
    if (cycle?.weekMap) {
      let planned = 0
      let done = 0
      for (let i = 0; i < 14; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const iso = d.toISOString().slice(0, 10)
        if (cycle.weekMap[d.getDay()] != null) {
          planned++
          if (finals.some((s) => s.calendarDate === iso)) done++
        }
      }
      if (planned >= 2) adherencePct = Math.round((done / planned) * 100)
    }
    const dates = finals.map((s) => s.calendarDate).sort()
    if (dates.length > 0) gapDays = Math.round((Date.now() - new Date(dates[dates.length - 1]).getTime()) / 86400000)
    // progreso: mejor volumen de sesión última vs anterior (14d)
    const vols = finals.filter((s) => s.calendarDate >= since(28)).map((s) => ({ d: s.calendarDate, v: Number(s.totalVolume ?? 0) })).sort((a, b) => (a.d < b.d ? -1 : 1))
    if (vols.length >= 2) {
      const last = vols[vols.length - 1].v
      const prev = vols.slice(0, -1).reduce((a, x) => a + x.v, 0) / (vols.length - 1)
      if (prev > 0) {
        improved = last > prev * 1.05
        regressed = last < prev * 0.9
      }
    }
  } catch { /* noop */ }
  let recoveryLast: number | null = null
  try {
    const recs: any[] = await db.recoveryChecks.toArray().catch(() => [])
    const sorted = recs.sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || '')))
    const last = sorted[sorted.length - 1]
    if (last && typeof last.score === 'number') recoveryLast = last.score
  } catch { /* noop */ }
  let hydrationMl: number | null = null
  try {
    const arr: any[] = await db.hydrationLogs.where('localDate').equals(today).toArray().catch(() => [])
    if (arr.length > 0) hydrationMl = arr.reduce((a, b) => a + Number(b.amountMl || 0), 0)
  } catch { /* noop */ }
  let painMax7d: number | null = null
  try {
    const surveys: any[] = await db.table('postWorkoutSurveys').toArray().catch(() => [])
    const vals = surveys.filter((s) => String(s.calendarDate || '') >= since(7)).map((s) => Number(s.pain ?? 0))
    if (vals.length > 0) painMax7d = Math.max(...vals)
  } catch { /* noop */ }
  let proteinPctGoal: number | null = null
  try {
    const p: any = await db.userProfile.get('me')
    const w = Number(p?.weightKg)
    if (w > 0) {
      const { proteinRange } = await import('@/utils/nutrition')
      const range = proteinRange(w, p?.goalPrimary)
      const diario = JSON.parse(localStorage.getItem(`nutri:diario:${today}`) || '[]')
      if (range && diario.length > 0) {
        const est = (diario as any[]).reduce((a, it) => a + Number(it?.macros?.proteins ?? 0), 0)
        proteinPctGoal = (est / range.low) * 100
      }
    }
  } catch { /* noop */ }
  const result = computeGlobalScore({ adherencePct, recoveryLast, hydrationMl, improvedRecently: improved, regressedRecently: regressed, painMax7d, proteinPctGoal, gapDays })
  try {
    await db.table('coachMemory').put({ id: `score-${today}`, type: 'score', date: today, score: result.score, factors: result.factors, createdAt: new Date().toISOString() } as never)
  } catch { /* noop */ }
  return result
}

export async function getScoreHistory(limit = 30): Promise<Array<{ date: string; score: number }>> {
  try {
    const rows: any[] = await db.table('coachMemory').where('type').equals('score').toArray().catch(() => [])
    return rows
      .map((r) => ({ date: String(r.date || ''), score: Number(r.score ?? 0) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-limit)
  } catch {
    return []
  }
}
