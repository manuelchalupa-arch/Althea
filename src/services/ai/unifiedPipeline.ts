// PIPELINE UNIFICADO DEL COACH IA
//
// Flujo único y coherente:
//   Usuario → Contexto Real → Conocimiento → Razonamiento → Respuesta → Fuentes
//
// Este módulo consolida los pipelines paralelos anteriores:
// - contextBuilder.ts + chatContext.ts → buildUnifiedContext()
// - evidence.ts → retrieveEvidence()
// - intentRouter.ts → routeIntent()
// - safetyLayer.ts → check()
// - goalEngine.ts → resolveGoal()
// - coachPersonality.ts → resolveCoachTone()
// - chatLocalFallback.ts + fallbackAIProvider.ts → composeFallbackReply()
//
// Reglas:
// - NO inventa fuentes: todo sale de la biblioteca de evidencia
// - NO inventa datos: todo sale de Dexie
// - Si no hay evidencia, lo dice
// - Si no hay API, usa fallback determinístico

import { buildTrainingContext } from './contextBuilder'
import { routeIntent, type AiIntent, type IntentResult } from './intentRouter'
import { retrieveEvidence, type EvidenceHit, type EvidenceSource } from './evidence'
import { check as safetyCheck, type SafetyContext } from './safetyLayer'
import { resolveGoal, type GoalLogic } from './goalEngine'
import { resolveCoachTone, type CoachTone } from './coachPersonality'
import { recommendLoad } from './localEngine'
import { resolveTrainingGoal } from '@/utils/trainingGoal'
import type { TrainingGoal, ExperienceLevel } from '@/types'
import { logDecision } from './decisionLogger'
import { db } from '@/services/storage/db'
import { unifiedCompletedSets, unifiedAllCompletedSets } from '@/services/history'
import { getDiaryEntries } from '@/services/storage/diaryStore'
import { getBottleDailySummary, getCalculatedHydrationGoal } from '@/services/recovery/hydrationBottles'
import { todayKey, addDaysToKey } from '@/utils/dates'
import type { AIContext, AIRecommendation } from './aiProvider'

export interface UnifiedContext {
  intent: AiIntent
  intentResult: IntentResult
  context: AIContext
  evidence: EvidenceHit[]
  safety: SafetyCheck
  goalLogic: GoalLogic
  tone: CoachTone
}

export interface UnifiedResponse {
  text: string
  sourcesUsed: EvidenceSource[]
  source: 'groq' | 'local'
  confidence: number
}

export interface SafetyCheck {
  requiresProfessional: boolean
  severity: 'info' | 'warning' | 'critical'
  message: string
  professionalReferral?: string
  blockedActions?: string[]
}

/**
 * Paso 1-3 del pipeline: intención, contexto real del usuario y evidencia.
 * Determinista y offline-safe: no llama al LLM.
 */
export async function prepareUnifiedContext(text: string): Promise<UnifiedContext> {
  const intentResult = routeIntent(text)
  const context = await buildTrainingContext()
  const evidence = retrieveEvidence({ intent: intentResult.intent, query: text, limit: 3 })

  const safetyCtx: SafetyContext = {
    recovery: context.recovery ? { pain: context.recovery.pain ?? 0, fatigue: context.recovery.fatigue ?? 5, energy: context.recovery.energy ?? 5 } : undefined,
    sessionPain: context.sessionPain,
    painZone: context.painZone,
    userProfile: context.userProfile,
    qaHistory: context.qa ? Object.entries(context.qa).map(([key, v]) => ({ key, answer: v.answer })) : undefined,
  }
  const safety = await safetyCheck(safetyCtx)

  const goal = (resolveTrainingGoal(context.userProfile) as TrainingGoal) || 'hypertrophy'
  const goalLogic = resolveGoal(goal, context.userProfile?.experienceLevel as ExperienceLevel)
  const tone = (context.personalidad || 'ABUELITOS') as CoachTone

  return { intent: intentResult.intent, intentResult, context, evidence, safety, goalLogic, tone }
}

/**
 * Construye el prompt del sistema con contexto + evidencia.
 * Instruye a citar con [id] sólo las fuentes entregadas.
 */
export function buildUnifiedSystemPrompt(ctx: UnifiedContext): string {
  const rules = `Especialización: ${ctx.intent} (confianza ${ctx.intentResult.confidence}).

EVIDENCIA RECUPERADA (única permitida para fundamentar):
${ctx.evidence.length > 0 ? ctx.evidence.map((h, i) => {
  const claims = h.matchedClaims.length > 0
    ? h.matchedClaims.map(c => `  - ${c}`).join('\n')
    : '  - (sin fragmentos citables; usar solo el título/nivel de evidencia)'
  return `[${i + 1}] ${h.source.title} — ${h.source.organization} (${h.source.evidence})
    Cita: ${h.source.citationLabel}${h.source.url ? `\n    URL: ${h.source.url}` : ''}
${claims}`
}).join('\n\n') : 'Sin evidencia disponible para esta consulta.'}

REGLAS DE EVIDENCIA:
- Solo podés apoyarte en las fuentes listadas arriba. Si algo no está ahí, decí
  que no tenés evidencia para eso: NO inventes estudios, cifras ni fuentes.
- Cuando uses una afirmación de esas fuentes, cerrá el párrafo con su marca
  [1], [2]… en el mismo orden en que las listé.
- Si no usaste ninguna fuente, no cites ninguna.
- Los datos del usuario son datos propios, no necesitan cita.`

  const contextBlock = buildContextBlock(ctx)

  return `${rules}\n\n${contextBlock}`
}

function buildContextBlock(ctx: UnifiedContext): string {
  const c = ctx.context
  const parts: string[] = []

  if (c.userProfile) {
    const p = c.userProfile
    parts.push(`USUARIO: ${p.displayName || 'sin nombre'}, ${p.age || '?'} años, ${p.weightKg || '?'}kg, ${p.heightCm || '?'}cm`)
    if (p.goalPrimary) { parts.push(`Objetivo: ${p.goalPrimary}`) }
    if (p.experienceLevel) { parts.push(`Nivel: ${p.experienceLevel}`) }
  }

  if (c.dia) { parts.push(`Día: ${c.dia}`) }
  if (c.ejercicio) { parts.push(`Ejercicio: ${c.ejercicio}`) }

  const hist = c.historial?.map((h, i) => `Sesión ${i + 1}: ${h.peso}kg × ${h.reps} RPE${h.rpe ?? '?'}`).join(' | ')
  if (hist) { parts.push(`Historial: ${hist}`) }

  if (c.fatiga) { parts.push(`Fatiga: ${c.fatiga}`) }
  if (c.sueno) { parts.push(`Sueño: ${c.sueno}`) }
  if (c.energia) { parts.push(`Energía: ${c.energia}`) }
  if (c.hidratacion) { parts.push(`Hidratación: ${c.hidratacion}`) }
  if (c.dolor) { parts.push(`Dolor: ${c.dolor}`) }

  if (c.score) { parts.push(`Estado global: ${c.score.score}/100`) }

  const warns = (c.insights || []).filter(i => i.level === 'warn')
  for (const w of warns.slice(0, 2)) {
    parts.push(`Alerta: ${w.title}${w.detail ? ` — ${w.detail}` : ''}`)
  }

  if (c.recovery?.lastScore) {
    parts.push(`Recuperación: ${c.recovery.lastScore}/100${c.recovery.trend ? ` (${c.recovery.trend})` : ''}`)
  }

  if (c.nutritionAnalysis) {
    const a = c.nutritionAnalysis
    const nutParts: string[] = []
    if (typeof a.calorieGoal === 'number') { nutParts.push(`objetivo ${a.calorieGoal} kcal/día`) }
    if (typeof a.proteinPerKg === 'number') { nutParts.push(`proteína ~${a.proteinPerKg} g/kg`) }
    if (a.gap) { nutParts.push(a.gap) }
    if (nutParts.length > 0) { parts.push(`Nutrición: ${nutParts.join(' · ')}`) }
  }

  if (c.rutina?.name) {
    parts.push(`Rutina activa: ${c.rutina.name}${c.rutina.planVersion ? ` (plan v${c.rutina.planVersion})` : ''}`)
  }

  if (parts.length === 0) {
    return 'CONTEXTO REAL DEL USUARIO: sin datos disponibles todavía (no asumas valores).'
  }

  return `CONTEXTO REAL DEL USUARIO:\n${parts.join('\n')}\n\nUsá estos datos para personalizar la respuesta.`
}

const MARKER_RE = /\[(?:fuente:)?([a-z0-9][a-z0-9-]*)\]/gi

/**
 * Validator: la respuesta solo puede reportar como usadas fuentes que fueron
 * realmente recuperadas. Reescribe las marcas [id] como [n] y elimina las que
 * apunten a fuentes inexistentes.
 */
export function validateUnifiedAnswer(rawText: string, hits: EvidenceHit[]): { text: string; sourcesUsed: EvidenceSource[] } {
  const allowed = new Map(hits.map(h => [h.source.id.toLowerCase(), h.source]))
  const used: EvidenceSource[] = []
  const index = new Map<string, number>()

  let text = rawText.replace(MARKER_RE, (full, id: string) => {
    const source = allowed.get(id.toLowerCase())
    if (!source) { return '' }
    if (!index.has(source.id)) {
      used.push(source)
      index.set(source.id, used.length)
    }
    return `[${index.get(source.id)}]`
  })

  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return { text, sourcesUsed: used }
}

/**
 * Respuesta local (sin red): datos reales del usuario + evidencia de la
 * biblioteca. Si no hay evidencia para la consulta lo declara en vez de
 * inventar una.
 */
export async function composeUnifiedLocalReply(
  text: string,
  ctx: UnifiedContext
): Promise<UnifiedResponse> {
  const lines: string[] = []
  const intent = ctx.intent

  // Safety primero
  if (ctx.safety.requiresProfessional && ctx.safety.severity === 'critical') {
    lines.push(ctx.safety.message)
    if (ctx.safety.professionalReferral) {
      lines.push(`Recomiendo consultar con un ${ctx.safety.professionalReferral}.`)
    }
  }

  // Datos reales según intención
  if (intent === 'TRAINING' || intent === 'HYPERTROPHY' || intent === 'STRENGTH') {
    const trainingLines = await buildTrainingLines()
    lines.push(...trainingLines)
  }

  if (intent === 'NUTRITION' || intent === 'MEAL_LOG') {
    const nutritionLines = buildNutritionLines(ctx.context)
    lines.push(...nutritionLines)
  }

  if (intent === 'RECOVERY') {
    const recoveryLines = buildRecoveryLines(ctx.context)
    lines.push(...recoveryLines)
  }

  if (intent === 'HYDRATION') {
    const hydrationLines = await buildHydrationLines()
    lines.push(...hydrationLines)
  }

  if (intent === 'PROGRESS' || intent === 'BODY_MEASUREMENTS') {
    const progressLines = await buildProgressLines()
    lines.push(...progressLines)
  }

  // Score global para consultas generales
  if (intent === 'GENERAL') {
    const scoreLines = buildScoreLines(ctx.context)
    lines.push(...scoreLines)
  }

  // Evidencia de la biblioteca
  if (ctx.evidence.length > 0) {
    lines.push('', 'Evidencia de la biblioteca de Althea:')
    ctx.evidence.forEach((h, i) => {
      const claim = h.matchedClaims[0]
      if (claim) { lines.push(`- ${claim} [${h.source.id}]`) }
      else { lines.push(`- ${h.source.title} (${h.source.evidence}) [${h.source.id}]`) }
    })
  } else {
    lines.push('', 'No tengo evidencia en la biblioteca para esa consulta, así que no te doy una respuesta inventada.')
  }

  if (lines.length === 0) {
    lines.push('No tengo datos suficientes todavía. Cargá tu entrenamiento, nutrición o recuperación y volvé a preguntar.')
  }

  const fullText = lines.join('\n')
  const validated = validateUnifiedAnswer(fullText, ctx.evidence)

  return {
    text: validated.text,
    sourcesUsed: validated.sourcesUsed,
    source: 'local',
    confidence: ctx.safety.severity === 'warning' ? 0.55 : 0.6,
  }
}

async function buildTrainingLines(): Promise<string[]> {
  const lines: string[] = []
  try {
    const all = await unifiedAllCompletedSets()
    if (all.length === 0) { return [] }
    const latest = [...all].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
    const logs = await unifiedCompletedSets(latest.exerciseId)
    logs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    const rec = recommendLoad(logs.map(l => ({ weight: l.weight, reps: l.reps, rpe: undefined, completed: true })) as any)
    lines.push(`Recomendación: ${rec.text}`)
    if (rec.reason) { lines.push(`Por qué: ${rec.reason}`) }
  } catch { /* noop */ }
  return lines
}

function buildNutritionLines(ctx: AIContext): string[] {
  const lines: string[] = []
  const a = ctx.nutritionAnalysis
  if (a) {
    const parts: string[] = []
    if (typeof a.calorieGoal === 'number') { parts.push(`objetivo ${a.calorieGoal} kcal/día`) }
    if (typeof a.proteinPerKg === 'number') { parts.push(`proteína ~${a.proteinPerKg} g/kg`) }
    if (a.gap) { parts.push(a.gap) }
    if (parts.length > 0) { lines.push(`Nutrición: ${parts.join(' · ')}`) }
  }
  if (ctx.nutriDaily && typeof ctx.nutriDaily.diarioCount === 'number' && ctx.nutriDaily.diarioCount > 0) {
    lines.push(`Hoy registraste ${ctx.nutriDaily.diarioCount} alimento(s).`)
  }
  return lines
}

function buildRecoveryLines(ctx: AIContext): string[] {
  const lines: string[] = []
  if (ctx.recovery && typeof ctx.recovery.lastScore === 'number') {
    lines.push(`Recuperación: ${ctx.recovery.lastScore}/100${ctx.recovery.trend ? ` (${ctx.recovery.trend})` : ''}`)
    if (typeof ctx.recovery.consecutiveLow === 'number' && ctx.recovery.consecutiveLow >= 2) {
      lines.push('Priorizá descanso: llevás varios días con recuperación baja.')
    }
  }
  if (ctx.sueno && ctx.sueno !== 'no registrado') { lines.push(`Sueño: ${ctx.sueno}`) }
  if (ctx.energia && ctx.energia !== 'no registrada') { lines.push(`Energía: ${ctx.energia}`) }
  if (typeof ctx.fatiga === 'string' && ctx.fatiga !== 'no registrada') { lines.push(`Fatiga: ${ctx.fatiga}`) }
  if (typeof ctx.dolor === 'string' && ctx.dolor !== 'sin dolor') { lines.push(`Dolor: ${ctx.dolor}`) }
  return lines
}

async function buildHydrationLines(): Promise<string[]> {
  const lines: string[] = []
  try {
    const [summary, goalMl] = await Promise.all([
      getBottleDailySummary().catch(() => null),
      getCalculatedHydrationGoal().catch(() => 0),
    ])
    if (!summary) { return [] }
    const total = summary.totalMl
    if (total > 0) {
      const goal = goalMl > 0 ? goalMl : 0
      const pct = goal > 0 ? Math.round((total / goal) * 100) : 0
      lines.push(`Hidratación de hoy: ${total} ml${goal > 0 ? ` de ${goal} ml (${pct}%)` : ''}.`)
      const pending = goal > 0 ? goal - total : 0
      if (pending > 0) { lines.push(`Te faltan ${pending} ml para tu objetivo diario.`) }
      else { lines.push('Objetivo de agua cubierto.') }
    } else {
      lines.push('Hoy todavía no registraste agua.')
    }
  } catch { /* noop */ }
  return lines
}

async function buildProgressLines(): Promise<string[]> {
  const lines: string[] = []
  try {
    const rows = await db.bodyMeasurements.toArray().catch(() => [])
    const valid = rows
      .filter(r => !r.isDemo && typeof r.weightKg === 'number')
      .sort((a, b) => String(a.localDate).localeCompare(String(b.localDate)))
    if (valid.length > 0) {
      const last = valid[valid.length - 1]
      lines.push(`Último peso registrado: ${last.weightKg} kg (${last.localDate})`)
      lines.push(`Mediciones registradas: ${valid.length}`)
    }
  } catch { /* noop */ }
  return lines
}

function buildScoreLines(ctx: AIContext): string[] {
  const lines: string[] = []
  if (ctx.score && typeof ctx.score.score === 'number') {
    lines.push(`Estado global: ${ctx.score.score}/100`)
    if (ctx.score.score < 45) { lines.push('Priorizá recuperación hoy: el puntaje global está bajo.') }
  }
  const warns = (ctx.insights || []).filter(i => i.level === 'warn').slice(0, 2)
  for (const w of warns) { lines.push(`Alerta: ${w.title}${w.detail ? ` — ${w.detail}` : ''}`) }
  const pat = (ctx.patterns || []).find(p => p.kind === 'recomendacion')
  if (pat) { lines.push(`Dato: ${pat.statement}`) }
  return lines
}

/**
 * Genera recomendación de entrenamiento usando el pipeline unificado.
 * Usa el motor determinístico local con contexto real e historial.
 */
export async function generateUnifiedRecommendation(ctx: AIContext): Promise<AIRecommendation> {
  // Safety check primero
  const safetyCtx: SafetyContext = {
    recovery: ctx.recovery ? { pain: ctx.recovery.pain ?? 0, fatigue: ctx.recovery.fatigue ?? 5, energy: ctx.recovery.energy ?? 5 } : undefined,
    sessionPain: ctx.sessionPain,
    painZone: ctx.painZone,
    userProfile: ctx.userProfile,
    qaHistory: ctx.qa ? Object.entries(ctx.qa).map(([key, v]) => ({ key, answer: v.answer })) : undefined,
  }
  const safety = await safetyCheck(safetyCtx)
  if (safety.requiresProfessional && safety.severity === 'critical') {
    await logDecision({
      type: 'safety',
      context: { exercise: ctx.ejercicio },
      decision: {
        what: 'Bloqueado por seguridad',
        why: safety.message,
        factors: ['safety_layer', safety.message],
        confidence: 1,
      },
      safetyFlags: safety.blockedActions,
    })
    return {
      type: 'training_recommendation',
      exercise: ctx.ejercicio || '',
      action: 'stop',
      reason: safety.message,
      factors: ['seguridad', safety.professionalReferral || 'profesional'].filter(Boolean),
      confidence: 1,
      why: [safety.message],
    }
  }

  // Motor determinístico base
  const hist: any[] = (ctx.historial || []).map(h => ({ weight: h.peso, reps: h.reps, rpe: h.rpe, completed: true, createdAt: new Date().toISOString(), id: '', sessionId: '', exerciseId: '', setNumber: 0 }))
  const rec = recommendLoad(hist)
  let action = rec.text.includes('Probar') ? 'increase_weight' : rec.text.includes('bajar') ? 'decrease_weight' : 'maintain'
  let reason = rec.reason
  const factors = [...(rec.factors || [])]

  // Capa longitudinal: insights y score
  const warns = (ctx.insights || []).filter(i => i.level === 'warn')
  if (warns.length > 0) {
    const top = warns[0]
    reason = `${top.title}. ${top.detail} ${rec.reason}`
    factors.unshift(`alerta: ${top.kind}`)
    if (top.kind === 'overtrain' || top.kind === 'pain') { action = 'decrease_volume' }
    if (top.kind === 'pain') { reason += ' Sin diagnosticar: si el dolor es importante, consultá profesional.' }
  } else if ((ctx.insights || []).length === 0 && (ctx.historial || []).length === 0) {
    reason = 'Todavía no tengo suficientes datos tuyos para determinarlo. ' + rec.reason
    factors.push('sin datos suficientes')
  }

  const learnedRec = (ctx.patterns || []).find(p => p.kind === 'recomendacion')
  if (learnedRec) {
    reason += ` Dato: patrón observado — ${learnedRec.statement}`
    factors.push(`patrón: ${learnedRec.statement.slice(0, 80)}`)
  }

  if (ctx.score && ctx.score.score < 45) {
    reason += ` Tu estado global está en ${ctx.score.score}/100: priorizá recuperación hoy.`
    factors.push(`score ${ctx.score.score}/100`)
    if (action === 'increase_weight') { action = 'maintain' }
  }

  // Goal-driven adjustment
  const goal = (resolveTrainingGoal(ctx.userProfile) as TrainingGoal) || 'hypertrophy'
  const tone = (ctx.personalidad || 'ABUELITOS') as CoachTone
  const goalLogic = resolveGoal(goal, ctx.userProfile?.experienceLevel as ExperienceLevel)
  if (goalLogic.progressionRate === 'conservative' && action === 'increase_weight') {
    action = 'maintain'
    factors.push('objetivo conservador')
    reason += ' Tu perfil prioriza técnica y progresión gradual.'
  }

  const m = rec.text.match(/(\d+\.?\d*) kg/)
  const confidence = warns.length > 0 ? 0.7 : safety.severity === 'warning' ? 0.55 : 0.6

  await logDecision({
    type: 'training',
    context: { exercise: ctx.ejercicio, goal, level: ctx.userProfile?.experienceLevel, tone },
    decision: {
      what: `${action}: ${reason.slice(0, 100)}`,
      why: reason,
      factors,
      confidence,
    },
  })

  return {
    type: 'training_recommendation',
    exercise: ctx.ejercicio || '',
    action,
    suggested_weight: m ? Number(m[1]) : undefined,
    reason,
    factors,
    confidence,
    why: factors,
  }
}
