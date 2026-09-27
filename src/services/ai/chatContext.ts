import { db } from '@/services/storage/db'
import { getDiaryEntries } from '@/services/storage/diaryStore'
import type { UserProfile, TrainingGoal } from '@/types'
import { getMethod } from './trainingMethodsDB'
import type { TrainingMethodId } from './trainingMethods'
import { METHOD_COACHING_STYLES, resolveCoachTone } from './coachPersonality'
import { PERSONALITY_INSTRUCTION } from './systemPrompt'
import { getGoalLabel } from './goalEngine'
import { getLearningInsight } from './coachMemory'
import { todayKey } from '@/utils/dates'
import { resolveTrainingGoal } from '@/utils/trainingGoal'
import { getPainAreas, getExcludedExercises } from '@/utils/restrictions'

interface PageContextData {
  page: string
  profile: UserProfile | null
  todayStats: any
  activeRoutine: any
  recentSessions: any[]
  nutrition: any
  recovery: any
}

export async function buildChatContext(page: string): Promise<string> {
  const today = todayKey()
  const ctx: PageContextData = {
    page,
    profile: null,
    todayStats: null,
    activeRoutine: null,
    recentSessions: [],
    nutrition: null,
    recovery: null,
  }

  try { ctx.profile = (await db.userProfile.get('me')) ?? null } catch {}
  try {
    const { getAllRoutines, getActiveRoutineId } = await import('@/services/storage/routineStore')
    const raw = await getAllRoutines()
    const activeId = await getActiveRoutineId()
    ctx.activeRoutine = raw?.find((r: any) => r.id === activeId) || raw?.[0] || null
  } catch {}
  try {
    const sessions: any[] = await db.trainingSessions.toArray()
    ctx.recentSessions = sessions.filter(s => ['COMPLETED', 'PARTIAL'].includes(s.sessionStatus))
      .sort((a, b) => (a.calendarDate || '').localeCompare(b.calendarDate || ''))
      .slice(-5)
  } catch {}
  try {
    const diario = await getDiaryEntries(today)
    const hydLogs = await db.hydrationLogs.where('localDate').equals(today).toArray().catch(()=>[])
    const hyd = hydLogs.reduce((a: number, b: any) => a + Number(b.amountMl || 0), 0)
    ctx.nutrition = { meals: diario.length, hydrationMl: hyd }
  } catch {}
  try {
    const recs: any[] = await db.recoveryChecks.toArray()
    const sorted = recs.sort((a, b) => String(a.localDate || '').localeCompare(String(b.localDate || '')))
    ctx.recovery = sorted.length > 0 ? sorted[sorted.length - 1] : null
  } catch {}

  let memoryInsight: string | null = null
  try { memoryInsight = await getLearningInsight() } catch {}

  // Método de la planificación vigente (canónico). El snapshot profile.cycle
  // queda como fallback en formatContext para instalaciones pre-versionado.
  let cycleMethodId: string | null = null
  try {
    const { getActiveVersion, PROFILE_SCOPE } = await import('@/services/planning/cycleVersions')
    const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
    cycleMethodId = pv?.methodId ?? pv?.cycle?.methodId ?? null
  } catch {}

  return formatContext(ctx, memoryInsight, cycleMethodId)
}

function formatContext(ctx: PageContextData, memoryInsight: string | null = null, cycleMethodId: string | null = null): string {
  const parts: string[] = []
  const p = ctx.profile

  if (p) {
    parts.push(`USUARIO: ${p.displayName || 'sin nombre'}, ${p.age || '?'} años, ${p.weightKg || '?'}kg, ${p.heightCm || '?'}cm`)
    const tgResolved = resolveTrainingGoal(p)
    if (tgResolved) {parts.push(`Objetivo: ${getGoalLabel(tgResolved as TrainingGoal)}`)}
    else if (p.goalPrimary) {parts.push(`Objetivo: ${p.goalPrimary}`)}
    if (p.experienceLevel) {parts.push(`Nivel: ${p.experienceLevel}`)}
    // FASE 2 S4 — dolor y excluidos son conceptos de ENTRENAMIENTO con
    // semántica propia; se leen desde su fuente canónica, no se fusionan.
    const painAreas = getPainAreas(p)
    const excludedEx = getExcludedExercises(p)
    if (painAreas.length) {parts.push(`Zonas de dolor: ${painAreas.join(', ')}`)}
    if (excludedEx.length) {parts.push(`Ejercicios excluidos: ${excludedEx.join(', ')}`)}
    const methodId = (p.coachMethodView || cycleMethodId || p.cycle?.methodId) as TrainingMethodId | undefined
    if (methodId) {
      const method = getMethod(methodId)
      const style = METHOD_COACHING_STYLES[methodId]
      if (method) {
        // FASE 2 S6 · mismo resolutor canónico que el resto del Coach.
        const tone = resolveCoachTone({ coachTone: p.coachTone, methodId })
        parts.push(`Coach activo: ${method.nameEs} — tono ${tone}. ${style?.motivationStyle ?? ''}`.trim())
        const personLine = PERSONALITY_INSTRUCTION[tone]
        if (personLine) { parts.push(`Estilo del Coach: ${personLine}`) }
      }
    }
  }

  if (memoryInsight) {
    parts.push(`Nota del Coach: ${memoryInsight}`)
  }

  if (ctx.activeRoutine?.cycle) {
    const cyc = ctx.activeRoutine.cycle
    parts.push(`Rutina activa: ${ctx.activeRoutine.name || 'Sin nombre'}`)
    if (cyc.trainingDays) {parts.push(`Días de entrenamiento: ${cyc.trainingDays.length}`)}
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
