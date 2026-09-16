import { db } from '@/services/storage/db'

interface PageContextData {
  page: string
  profile: any
  todayStats: any
  activeRoutine: any
  recentSessions: any[]
  nutrition: any
  recovery: any
}

export async function buildChatContext(page: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const ctx: PageContextData = {
    page,
    profile: null,
    todayStats: null,
    activeRoutine: null,
    recentSessions: [],
    nutrition: null,
    recovery: null,
  }

  try { ctx.profile = await db.userProfile.get('me') } catch {}
  try {
    const raw = JSON.parse(localStorage.getItem('rutinas:list') || 'null')
    const activeId = localStorage.getItem('rutina:activeId')
    ctx.activeRoutine = raw?.find((r: any) => r.id === activeId) || raw?.[0] || null
  } catch {}
  try {
    const sessions: any[] = await db.table('trainingSessions').toArray()
    ctx.recentSessions = sessions.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus))
      .sort((a, b) => (a.calendarDate || '').localeCompare(b.calendarDate || ''))
      .slice(-5)
  } catch {}
  try {
    const diario = JSON.parse(localStorage.getItem(`nutri:diario_v2:${today}`) || '[]')
    const hyd = Number(localStorage.getItem('hydration:' + today) || '0')
    ctx.nutrition = { meals: diario.length, hydrationMl: hyd }
  } catch {}
  try {
    const recs: any[] = await db.recoveryChecks.toArray()
    const sorted = recs.sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || '')))
    ctx.recovery = sorted.length > 0 ? sorted[sorted.length - 1] : null
  } catch {}

  return formatContext(ctx)
}

function formatContext(ctx: PageContextData): string {
  const parts: string[] = []
  const p = ctx.profile as any

  if (p) {
    parts.push(`USUARIO: ${p.name || 'sin nombre'}, ${p.age || '?'} años, ${p.weightKg || '?'}kg, ${p.heightCm || '?'}cm`)
    if (p.goalPrimary) parts.push(`Objetivo: ${p.goalPrimary}`)
    if (p.experienceLevel) parts.push(`Nivel: ${p.experienceLevel}`)
    if (p.painAreas?.length) parts.push(`Zonas de dolor: ${p.painAreas.join(', ')}`)
    if (p.excludedExercises?.length) parts.push(`Ejercicios excluidos: ${p.excludedExercises.join(', ')}`)
  }

  if (ctx.activeRoutine?.cycle) {
    const cyc = ctx.activeRoutine.cycle
    parts.push(`Rutina activa: ${ctx.activeRoutine.name || 'Sin nombre'}`)
    if (cyc.trainingDays) parts.push(`Días de entrenamiento: ${cyc.trainingDays.length}`)
  }

  if (ctx.recentSessions.length > 0) {
    const last = ctx.recentSessions[ctx.recentSessions.length - 1]
    parts.push(`Última sesión: ${last.calendarDate} — ${last.sessionStatus}, ${last.completedExerciseCount || 0} ejercicios, ${last.totalVolume || 0}kg volumen`)
  }

  if (ctx.nutrition) {
    parts.push(`Nutrición hoy: ${ctx.nutrition.meals} alimentos registrados, ${ctx.nutrition.hydrationMl}ml hidratación`)
  }

  if (ctx.recovery) {
    const r = ctx.recovery
    parts.push(`Último recovery: energía ${r.energy}/10, cansancio ${r.fatigue}/10, sueño ${r.sleepHours || '?'}h`)
  }

  return parts.join('\n')
}
