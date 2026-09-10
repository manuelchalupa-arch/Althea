// INSIGHTS DETERMINISTAS — capa analítica del Coach (§8-12, §16, §20).
// Regla de veracidad (§5, §39): cada analizador es PURO (recibe datos, no lee DB),
// exige mínimos de datos y devuelve null + motivo si no hay evidencia suficiente.
// buildInsights() recolecta de los módulos reales (sin duplicar stores).
import { db } from '@/services/storage/db'

export type InsightLevel = 'info' | 'warn'
export interface CoachInsight {
  id: string
  kind: string
  level: InsightLevel
  title: string
  detail: string
  /** Evidencia: registros, período, comparación. Nunca correlación débil como causa. */
  evidence: string
  question?: { key: string; text: string }
}

export interface PerfSample { date: string; weight: number; reps: number }
export interface SessionRow { date: string; status: string; plannedDay: number | null; actualDay: number | null; volume: number }
export interface PainRow { date: string; zone: string; detail: string; pain: number; exercise?: string }
export interface SkipRow { date: string; exerciseId: string; exerciseName: string; muscle: string; reason: string }

// 1. Rendimiento por ejercicio: última vs anterior (§7-8)
export function detectPerformanceDelta(history: PerfSample[]): CoachInsight | null {
  if (history.length < 2) return null
  const sorted = history.slice().sort((a, b) => (a.date < b.date ? -1 : 1))
  const prev = sorted[sorted.length - 2]
  const last = sorted[sorted.length - 1]
  const vPrev = prev.weight * prev.reps
  const vLast = last.weight * last.reps
  if (vLast > vPrev) {
    return {
      id: 'perf-up', kind: 'performance', level: 'info',
      title: `Mejora: ${last.weight}×${last.reps} (antes ${prev.weight}×${prev.reps})`,
      detail: 'Aumento de volumen en la serie de referencia.',
      evidence: `2 registros: ${prev.date} vs ${last.date}. Volumen ${vPrev} → ${vLast} kg.`,
    }
  }
  if (vLast < vPrev) {
    const dropPct = Math.round((1 - vLast / vPrev) * 100)
    return {
      id: 'perf-down', kind: 'performance', level: dropPct >= 20 ? 'warn' : 'info',
      title: `Caída de rendimiento: ${last.weight}×${last.reps} (antes ${prev.weight}×${prev.reps}, −${dropPct}%)`,
      detail: 'Disminución del volumen de referencia. Revisar contexto antes de concluir.',
      evidence: `2 registros: ${prev.date} vs ${last.date}.`,
      question: dropPct >= 20 ? { key: 'perf:drop', text: 'Registraste una caída marcada. ¿Dormiste poco, estás fatigado o te duele algo?' } : undefined,
    }
  }
  return null
}

// 2. Adherencia 14 días: realizadas vs planificadas (§11)
export function detectAdherence(sessions: SessionRow[], plannedDays: string[]): CoachInsight | null {
  const done = sessions.filter((s) => s.status === 'COMPLETED' || s.status === 'PARTIAL').length
  const planned = plannedDays.length
  if (planned < 2) return null // sin plan medible
  const pct = Math.round((done / planned) * 100)
  if (pct < 70) {
    return {
      id: 'adherence-low', kind: 'adherence', level: 'warn',
      title: `Adherencia baja: ${done}/${planned} sesiones (${pct}%) en 14 días`,
      detail: 'Entrenaste menos de lo previsto. No asumo la causa.',
      evidence: `${done} realizadas de ${planned} planificadas (14 días).`,
      question: { key: 'adherence:low', text: '¿Pasó algo estas semanas? Tu respuesta me ayuda a adaptar el plan.' },
    }
  }
  return null
}

// 3. Brecha sin entrenar (§10-11)
export function detectGap(sessions: SessionRow[], today: string): CoachInsight | null {
  const finals = sessions.filter((s) => ['COMPLETED', 'PARTIAL'].includes(s.status)).map((s) => s.date).sort()
  if (finals.length === 0) return null
  const last = finals[finals.length - 1]
  const gap = Math.round((new Date(today).getTime() - new Date(last).getTime()) / 86400000)
  if (gap >= 5) {
    return {
      id: 'gap', kind: 'gap', level: 'warn',
      title: `Pausa de ${gap} días (última sesión ${last})`,
      detail: 'Interrupción del ritmo habitual.',
      evidence: `Última sesión finalizada: ${last}.`,
      question: { key: 'gap:why', text: '¿Qué te frenó estos días? Lo registro para adaptar la vuelta.' },
    }
  }
  return null
}

// 4. Omisión repetida de ejercicios (§12-13)
export function detectSkipPatterns(skips: SkipRow[]): CoachInsight | null {
  if (skips.length < 2) return null
  const byEx: Record<string, SkipRow[]> = {}
  for (const s of skips) { (byEx[s.exerciseId] = byEx[s.exerciseId] || []).push(s) }
  const rep = Object.entries(byEx).find(([, v]) => v.length >= 2)
  if (!rep) return null
  const [exId, rows] = rep
  return {
    id: `missed:${exId}`, kind: 'missed', level: 'warn',
    title: `Omisión repetida: ${rows[0].exerciseName} (${rows.length} veces en 30 días)`,
    detail: `Motivos registrados: ${[...new Set(rows.map((r) => r.reason))].join(', ')}.`,
    evidence: `${rows.length} omisiones entre ${rows[0].date} y ${rows[rows.length - 1].date}.`,
    question: { key: `missed:${exId}`, text: `¿Por qué venís omitiendo ${rows[0].exerciseName}? Si es molestia, lo tengo en cuenta en ejercicios similares.` },
  }
}

// 5. Dolor recurrente por zona (§13)
export function detectPainZones(pains: PainRow[]): CoachInsight | null {
  const withZone = pains.filter((p) => p.zone && p.zone.trim())
  if (withZone.length === 0) return null
  const byZone: Record<string, PainRow[]> = {}
  for (const p of withZone) {
    const z = p.zone.toLowerCase().trim()
    ;(byZone[z] = byZone[z] || []).push(p)
  }
  const rep = Object.entries(byZone).find(([, v]) => v.length >= 2 || v.some((r) => r.pain >= 7))
  if (!rep) return null
  const [zone, rows] = rep
  return {
    id: `pain:${zone}`, kind: 'pain', level: 'warn',
    title: `Dolor recurrente en ${zone} (${rows.length} registros)`,
    detail: 'No diagnostico. Al aparecer un ejercicio de esa zona, advierto y pregunto cómo está hoy.',
    evidence: rows.map((r) => `${r.date}${r.exercise ? ` (${r.exercise})` : ''}: ${r.pain}/10`).join(' · '),
    question: { key: `pain:${zone}`, text: `Registraste dolor en ${zone} más de una vez. ¿Sigue molestando? ¿En qué ejercicio lo notás más?` },
  }
}

function singular(tok: string): string {
  const t = tok.toLowerCase().trim()
  if (t.length <= 3) return t
  if (t.endsWith('es')) return t.slice(0, -2)
  if (t.endsWith('s')) return t.slice(0, -1)
  return t
}

/** ¿Esta zona con dolor coincide con el músculo del ejercicio? (tokens normalizados
 *  con singularización simple: hombros→hombro. Sin inventar relaciones nuevas.) */
export function painMatchesMuscle(zone: string, muscle: string): boolean {
  const zt = zone.toLowerCase().split(/[^a-záéíóúñü]+/).filter(Boolean).map(singular)
  const mt = muscle.toLowerCase().split(/[^a-záéíóúñü]+/).filter(Boolean).map(singular)
  if (zt.length === 0 || mt.length === 0) return false
  return zt.some((z) => mt.some((m) => z === m || z.includes(m) || m.includes(z)))
}

// 6. Exceso de carga: volumen semanal ×3 + recovery <60 ×2 (reutiliza shouldDeload, §9)
export function detectOvertraining(weeklyVolumes: number[], recoveryScores: number[]): CoachInsight | null {
  if (weeklyVolumes.length < 3 || recoveryScores.length < 2) return null
  const highVolume = weeklyVolumes[2] > weeklyVolumes[0] * 1.2
  const lowRecovery = recoveryScores.slice(-3).filter((s) => s < 60).length >= 2
  if (highVolume && lowRecovery) {
    return {
      id: 'overtrain', kind: 'overtrain', level: 'warn',
      title: 'Posible exceso de carga: volumen alto + recuperación baja',
      detail: 'Veo días de carga alta junto con menor recuperación. Sería prudente considerar descanso o reducir intensidad. No modifico tu rutina.',
      evidence: `Volumen semanal: ${weeklyVolumes.map((v) => Math.round(v)).join(' → ')} kg. Recovery <60 en ${recoveryScores.slice(-3).filter((s) => s < 60).length} de los últimos 3 registros.`,
      question: { key: 'overtrain:check', text: '¿Cómo viene tu descanso y tu energía esta semana?' },
    }
  }
  return null
}

// 7. Entrenamiento insuficiente semanal (§11)
export function detectUnderTraining(thisWeek: number, prevAvg: number, prevWeeks: number): CoachInsight | null {
  if (prevWeeks < 2 || prevAvg <= 0) return null
  if (thisWeek < prevAvg * 0.5) {
    return {
      id: 'undertrain', kind: 'undertrain', level: 'warn',
      title: `Semana floja: ${thisWeek} sesiones vs promedio ${prevAvg.toFixed(1)}`,
      detail: 'Registraste bastante menos entrenamiento que en tus semanas anteriores.',
      evidence: `${prevWeeks} semanas previas promediadas.`,
      question: { key: 'undertrain:why', text: '¿Pasó algo esta semana?' },
    }
  }
  return null
}

// 8. Rutina envejecida + estancamiento (§16)
export function detectRoutineStale(routineAgeDays: number, improvedRecently: boolean, totalSets: number): CoachInsight | null {
  if (routineAgeDays < 21 || totalSets < 6) return null
  if (!improvedRecently && routineAgeDays >= 45) {
    return {
      id: 'routine-stale', kind: 'routine', level: 'info',
      title: `Rutina con ${routineAgeDays} días y progreso estancado`,
      detail: 'Llevás varias semanas con esta rutina y el progreso se está estancando. Podríamos considerar modificarla. Vos decidís.',
      evidence: `${routineAgeDays} días de rutina, sin mejoras en el período analizado.`,
      question: { key: 'routine:change', text: '¿Querés que revisemos alternativas para esta rutina?' },
    }
  }
  return null
}

// 9. Proteína insuficiente vs objetivo (§14) — estimado: el diario no registra porciones
export function detectProteinGap(proteinEstimate: number | null, goalMin: number | null, items: number): CoachInsight | null {
  if (goalMin == null || items === 0 || proteinEstimate == null) return null
  if (proteinEstimate < goalMin * 0.5) {
    return {
      id: 'protein-low', kind: 'nutrition', level: 'warn',
      title: `Proteína baja hoy: ~${Math.round(proteinEstimate)}g vs objetivo ${goalMin}g (estimado)`,
      detail: 'Hoy registraste menos proteína de la que tenés como objetivo. Estimado: el diario no registra porciones.',
      evidence: `${items} alimentos hoy, objetivo mínimo ${goalMin}g.`,
    }
  }
  return null
}

// 10. Entrenó en descanso / cambió día (§10, §4-5 test)
export function detectRestDayTraining(sessions: SessionRow[]): CoachInsight | null {
  const rest = sessions.filter((s) => s.plannedDay == null && s.actualDay != null)
  if (rest.length === 0) return null
  return {
    id: 'rest-train', kind: 'restday', level: 'info',
    title: `Entrenaste ${rest.length} día(s) de descanso en el período`,
    detail: 'Permitido y registrado con su motivo. Lo tengo en cuenta para carga y recuperación.',
    evidence: rest.map((s) => s.date).join(', '),
  }
}

// Recolección desde módulos reales (sin duplicar stores).
export async function buildInsights(): Promise<CoachInsight[]> {
  const out: CoachInsight[] = []
  try {
    const today = new Date().toISOString().slice(0, 10)
    const since = (days: number) => {
      const d = new Date()
      d.setDate(d.getDate() - days)
      return d.toISOString().slice(0, 10)
    }
    // sesiones finales 30d
    const official: any[] = await db.table('trainingSessions').toArray().catch(() => [])
    const legacy: any[] = await db.table('sessions').toArray().catch(() => [])
    const finals = [
      ...official.filter((s) => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus)).map((s) => ({
        date: s.calendarDate, status: s.sessionStatus,
        plannedDay: s.plannedDay ?? null, actualDay: s.actualDay ?? null,
        volume: Number(s.totalVolume ?? 0),
      })),
      ...legacy.filter((s) => s.finishedAt).map((s) => ({ date: s.localDate, status: 'COMPLETED', plannedDay: null, actualDay: null, volume: 0 })),
    ].filter((s) => s.date && s.date >= since(60))
    // adherencia 14d (días planificados según ciclo)
    let planned14: string[] = []
    try {
      const p: any = await db.userProfile.get('me')
      const cycle = p?.cycle
      if (cycle?.weekMap) {
        for (let i = 0; i < 14; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const iso = d.toISOString().slice(0, 10)
          if (cycle.weekMap[d.getDay()] != null) planned14.push(iso)
        }
      }
    } catch { /* noop */ }
    const push = (x: CoachInsight | null) => { if (x) out.push(x) }
    push(detectAdherence(finals.filter((s) => s.date >= since(14)), planned14))
    push(detectGap(finals, today))
    push(detectRestDayTraining(finals.filter((s) => s.date >= since(30))))
    // skips 30d (store)
    try {
      const ses = await db.table('sessionExercises').toArray().catch(() => []) as any[]
      const skips: SkipRow[] = []
      // nombres/músculos desde rutinas activas
      const rawList = JSON.parse(localStorage.getItem('rutinas:list') || 'null')
      const nameOf: Record<string, { name: string; muscle: string }> = {}
      for (const r of rawList || []) {
        for (const arr of Object.values((r as any).dayExercises || {})) {
          for (const it of arr as any[]) nameOf[it.exId] = { name: it.name || it.exId, muscle: it.muscle || '' }
        }
      }
      for (const se of ses.filter((s) => s.status === 'SKIPPED')) {
        const meta = nameOf[se.exerciseId] || { name: se.exerciseId, muscle: '' }
        skips.push({ date: String(se.updatedAt || '').slice(0, 10), exerciseId: se.exerciseId, exerciseName: meta.name, muscle: meta.muscle, reason: se.skipReason || 'sin motivo' })
      }
      push(detectSkipPatterns(skips.filter((s) => s.date >= since(30))))
    } catch { /* noop */ }
    // dolor 30d: surveys + observaciones
    try {
      const surveys: any[] = await db.table('postWorkoutSurveys').toArray().catch(() => [])
      const pains: PainRow[] = surveys
        .filter((s) => Number(s.pain) > 0 && String(s.calendarDate || '') >= since(30))
        .map((s) => ({ date: String(s.calendarDate), zone: String(s.painZone || s.painDetail || ''), detail: String(s.painDetail || ''), pain: Number(s.pain) }))
      push(detectPainZones(pains))
    } catch { /* noop */ }
    // over/under training: volúmenes semanales + recovery
    try {
      const vols: number[] = [0, 0, 0]
      for (const s of finals) {
        const age = Math.round((new Date(today).getTime() - new Date(s.date).getTime()) / 86400000)
        const w = age < 7 ? 2 : age < 14 ? 1 : age < 21 ? 0 : -1
        if (w >= 0) vols[w] += s.volume
      }
      const recs: any[] = await db.recoveryChecks.toArray().catch(() => [])
      const scores = recs.map((r) => Number(r.score)).filter((n) => !isNaN(n)).slice(-6)
      push(detectOvertraining(vols, scores))
      const thisWeek = finals.filter((s) => s.date >= since(7)).length
      const prev = finals.filter((s) => s.date < since(7) && s.date >= since(28))
      const weeks = new Set(prev.map((s) => s.date.slice(0, 10))).size
      void weeks
      const prevByWeek: Record<string, number> = {}
      for (const s of prev) {
        const monday = weekKey(s.date)
        prevByWeek[monday] = (prevByWeek[monday] || 0) + 1
      }
      const vals = Object.values(prevByWeek)
      if (vals.length >= 2) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        push(detectUnderTraining(thisWeek, avg, vals.length))
      }
    } catch { /* noop */ }
    // rutina: edad + estancamiento simple (sin mejora de peso máx 14d)
    try {
      const rawList = JSON.parse(localStorage.getItem('rutinas:list') || 'null')
      const activeId = localStorage.getItem('rutina:activeId')
      const active = rawList?.find((r: any) => r.id === activeId) || rawList?.[0]
      if (active?.createdAt) {
        const age = Math.round((Date.now() - new Date(active.createdAt).getTime()) / 86400000)
        const off: any[] = await db.table('setRecords').toArray().catch(() => [])
        const leg: any[] = await db.setLogs.toArray().catch(() => [])
        const maxRecent = Math.max(0, ...off.filter((r) => r.status === 'COMPLETED' && String(r.completedAt || r.createdAt || '') >= since(14)).map((r) => Number(r.actualWeight || 0)), ...leg.filter((l) => l.completed && String(l.createdAt || '') >= since(14)).map((l) => Number(l.weight || 0)))
        const maxPrev = Math.max(0, ...off.filter((r) => r.status === 'COMPLETED' && String(r.completedAt || r.createdAt || '') < since(14) && String(r.completedAt || r.createdAt || '') >= since(60)).map((r) => Number(r.actualWeight || 0)), ...leg.filter((l) => l.completed && String(l.createdAt || '') < since(14) && String(l.createdAt || '') >= since(60)).map((l) => Number(l.weight || 0)))
        push(detectRoutineStale(age, maxRecent > maxPrev, off.length + leg.length))
      }
    } catch { /* noop */ }
    // proteína hoy (estimado honesto)
    try {
      const p: any = await db.userProfile.get('me')
      const w = Number(p?.weightKg)
      if (w > 0) {
        const { proteinRange } = await import('@/utils/nutrition')
        const range = proteinRange(w, p?.goalPrimary)
        const diario = JSON.parse(localStorage.getItem(`nutri:diario:${today}`) || '[]')
        const est = (diario as any[]).reduce((a, it) => a + Number(it?.macros?.proteins ?? 0), 0)
        push(detectProteinGap(est, range?.low ?? null, diario.length))
      }
    } catch { /* noop */ }
  } catch { /* noop: sin datos → sin insights, nunca inventar */ }
  return out
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}
