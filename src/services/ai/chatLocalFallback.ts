// FALLBACK LOCAL — motor determinista offline para el chat del Coach.
// Se usa cuando el proveedor remoto no está disponible (sin conexión,
// sin configuración, error del proveedor o timeout).
// NO simula un LLM: genera texto únicamente a partir de datos reales de
// Dexie y de las reglas locales existentes (contextBuilder, localEngine,
// insights deterministas). No descarga ni usa modelos externos.
import { db } from '@/services/storage/db'
import { buildTrainingContext } from './contextBuilder'
import { unifiedAllCompletedSets, unifiedCompletedSets } from '@/services/history'
import { recommendLoad } from './localEngine'
import { getNutritionRestrictions } from '@/utils/restrictions'
import { getBottleDailySummary, getCalculatedHydrationGoal } from '@/services/recovery/hydrationBottles'
import { todayKey, addDaysToKey } from '@/utils/dates'
import type { SetLog } from '@/types'
import type { AIContext } from './aiProvider'

export type CoachReplySource = 'groq' | 'local'

export interface LocalCoachReply {
  text: string
  source: 'local'
}

export type CoachIntent = 'nutrition' | 'recovery' | 'training' | 'hydration' | 'general'

const NUTRITION_RE = /(comer|comida|comí|comi|alimento|cena|almuerzo|desayuno|merienda|snack|calor|proteína|proteina|proteínas|carbohidrato|grasa)/i
const RECOVERY_RE = /(dolor|dolores|duele|recuperac|recupero|cansan|fatig|sue[ñn]o|duermo|dorm|descans|lesión|lesion|agotad|descarga)/i
const TRAINING_RE = /(entren|ejercicio|carga|peso|pesas|serie|repet|reps|rutina|método|metodo|técnica|tecnica|progres|volumen)/i
const HYDRATION_RE = /(agua|hidrat|beber|sed|líquido|liquido|\bml\b|botella)/i

export function detectIntent(message: string): CoachIntent {
  const m = message.toLowerCase()
  if (HYDRATION_RE.test(m)) {return 'hydration'}
  if (NUTRITION_RE.test(m)) {return 'nutrition'}
  if (RECOVERY_RE.test(m)) {return 'recovery'}
  if (TRAINING_RE.test(m)) {return 'training'}
  return 'general'
}

const LOCAL_NOTE = 'Estoy en modo local, así que te respondo con tus datos (sin conexión).'

async function resolveExerciseName(exerciseId: string): Promise<string> {
  try {
    const se = await db.sessionExercises.where('exerciseId').equals(exerciseId).last()
    if (se && typeof (se as unknown as { exerciseName?: string }).exerciseName === 'string') {
      return (se as unknown as { exerciseName: string }).exerciseName
    }
  } catch { /* noop */ }
  try {
    const ex = await db.exercises.get(exerciseId)
    if (ex && typeof (ex as { name?: string }).name === 'string') {
      return (ex as { name: string }).name
    }
  } catch { /* noop */ }
  return ''
}

async function buildTrainingLine(): Promise<string[]> {
  const all = await unifiedAllCompletedSets().catch(() => [])
  if (all.length === 0) {return []}
  const latest = [...all].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
  const name = await resolveExerciseName(latest.exerciseId)
  const logs = await unifiedCompletedSets(latest.exerciseId).catch(() => [])
  logs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const rec = recommendLoad(logs.map(l => ({ weight: l.weight, reps: l.reps, rpe: undefined, completed: true })) as unknown as SetLog[])
  const lines: string[] = []
  if (name) {lines.push(`Último ejercicio: ${name}`)}
  lines.push(`Recomendación: ${rec.text}`)
  if (rec.reason) {lines.push(`Por qué: ${rec.reason}`)}
  return lines
}

function scoreLines(ctx: AIContext): string[] {
  const lines: string[] = []
  if (ctx.score && typeof ctx.score.score === 'number') {
    lines.push(`Estado global: ${ctx.score.score}/100`)
    if (ctx.score.score < 45) {lines.push('Priorizá recuperación hoy: el puntaje global está bajo.')}
  }
  const warns = (ctx.insights || []).filter(i => i.level === 'warn').slice(0, 2)
  for (const w of warns) {lines.push(`Alerta: ${w.title}${w.detail ? ` — ${w.detail}` : ''}`)}
  const pat = (ctx.patterns || []).find(p => p.kind === 'recomendacion')
  if (pat) {lines.push(`Dato: ${pat.statement}`)}
  return lines
}

function recoveryLines(ctx: AIContext): string[] {
  const lines: string[] = []
  if (ctx.recovery && typeof ctx.recovery.lastScore === 'number') {
    lines.push(`Recuperación: ${ctx.recovery.lastScore}/100${ctx.recovery.trend ? ` (${ctx.recovery.trend})` : ''}`)
    if (typeof ctx.recovery.consecutiveLow === 'number' && ctx.recovery.consecutiveLow >= 2) {
      lines.push('Priorizá descanso: llevás varios días con recuperación baja.')
    }
  }
  if (ctx.sueno && ctx.sueno !== 'no registrado') {lines.push(`Sueño: ${ctx.sueno}`)}
  if (ctx.energia && ctx.energia !== 'no registrada') {lines.push(`Energía: ${ctx.energia}`)}
  if (typeof ctx.fatiga === 'string' && ctx.fatiga !== 'no registrada') {lines.push(`Fatiga: ${ctx.fatiga}`)}
  if (typeof ctx.dolor === 'string' && ctx.dolor !== 'sin dolor') {lines.push(`Dolor: ${ctx.dolor}`)}
  return lines
}

function nutritionLines(ctx: AIContext): string[] {
  const lines: string[] = []
  const a = ctx.nutritionAnalysis
  if (a) {
    const parts: string[] = []
    if (typeof a.calorieGoal === 'number') {parts.push(`objetivo ${a.calorieGoal} kcal/día`)}
    if (typeof a.proteinPerKg === 'number') {parts.push(`proteína ~${a.proteinPerKg} g/kg`)}
    if (a.gap) {parts.push(a.gap)}
    if (parts.length > 0) {lines.push(`Nutrición: ${parts.join(' · ')}`)}
  }
  if (ctx.nutriDaily && typeof ctx.nutriDaily.diarioCount === 'number' && ctx.nutriDaily.diarioCount > 0) {
    lines.push(`Hoy registraste ${ctx.nutriDaily.diarioCount} alimento(s).`)
  }
  // FASE 2 S4 — nutritional: fuente canónica nutritionPrefs.restrictions.
  // Antes leía profile.restrictions (restricciones de ENTRENAMIENTO).
  const restrictions = getNutritionRestrictions(ctx.userProfile)
  if (restrictions.length > 0) {
    lines.push(`Restricciones: ${restrictions.join(', ')}`)
  }
  return lines
}

/**
 * Hidratación desde la fuente canónica (db.hydrationBottleLogs + espejo legacy
 * ya unificado en getBottleDailySummary): reutilizarla evita que el Coach cuente
 * agua por su cuenta y diverja de la botella que ve el usuario en Inicio.
 */
async function hydrationLines(): Promise<string[]> {
  const [summary, goalMl] = await Promise.all([
    getBottleDailySummary().catch(() => null),
    getCalculatedHydrationGoal().catch(() => 0),
  ])
  if (!summary) {return []}
  const lines: string[] = []
  const total = summary.totalMl
  if (total > 0) {
    const goal = goalMl > 0 ? goalMl : 0
    const pct = goal > 0 ? Math.round((total / goal) * 100) : 0
    lines.push(`Hidratación de hoy: ${total} ml${goal > 0 ? ` de ${goal} ml (${pct}%)` : ''}.`)
    const pending = goal > 0 ? goal - total : 0
    if (pending > 0) {lines.push(`Te faltan ${pending} ml para tu objetivo diario.`)}
    else {lines.push('Objetivo de agua cubierto.')}
  } else {
    lines.push('Hoy todavía no registraste agua.')
  }
  const botellas = (summary.perBottle ?? []) as Array<{ bottleId: string; name: string; count: number; capacityLiters: number }>
  const usados = botellas.filter(b => b.count > 0).map(b => `${b.name} ${b.count}/${b.capacityLiters} L`).join(', ')
  if (usados) {lines.push(`Botellas: ${usados}.`)}
  return lines
}

/** Peso real: última medición y variación contra la primera de la ventana de 7 días. */
async function bodyLines(): Promise<string[]> {
  const today = todayKey()
  const rows = await db.bodyMeasurements
    .where('localDate')
    .between(addDaysToKey(today, -7), today, true, true)
    .toArray()
    .catch(() => [])
  const valid = rows.filter(r => !r.isDemo && typeof r.weightKg === 'number' && Number.isFinite(r.weightKg))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : 1))
  if (valid.length === 0) {return []}
  const last = valid[valid.length - 1]
  const lines = [`Peso: ${last.weightKg} kg (${last.localDate}).`]
  if (valid.length > 1) {
    const first = valid[0]
    const delta = Math.round((last.weightKg! - first.weightKg!) * 10) / 10
    if (delta !== 0) {lines.push(`Variación en 7 días: ${delta > 0 ? '+' : ''}${delta} kg.`)}
  }
  return lines
}

/** Adherencia real: días con-series completadas contra los días planificados de la rutina. */
async function adherenceLines(): Promise<string[]> {
  const today = todayKey()
  const since = addDaysToKey(today, -6)
  const sets = await unifiedAllCompletedSets().catch(() => [])
  const trained = new Set(
    sets
      .filter(s => {
        const d = s.createdAt?.slice(0, 10) ?? ''
        return d >= since && d <= today
      })
      .map(s => s.createdAt!.slice(0, 10)),
  )
  const planned = await db.routineDays.toArray().then(days => new Set(days.map(d => d.weekday)).size).catch(() => 0)
  if (trained.size === 0) {return []}
  if (planned <= 0) {return [`Adherencia: entrenaste ${trained.size} de los últimos 7 días.`]}
  const pct = Math.round((trained.size / planned) * 100)
  return [
    `Adherencia: entrenaste ${trained.size} de los últimos 7 días (${pct}% de la adherencia semanal de ${planned} día(s) planificado(s)).`,
  ]
}

/** Sesión de hoy y rutina vigente, tal como están planificadas. */
function sessionLines(ctx: AIContext): string[] {
  const lines: string[] = []
  if (ctx.rutina?.name) {
    lines.push(`Rutina activa: ${ctx.rutina.name}${ctx.rutina.planVersion ? ` (plan v${ctx.rutina.planVersion})` : ''}.`)
  }
  const dia = ctx.dia?.trim()
  if (dia && !/^no registrado$/i.test(dia)) {lines.push(`Sesión de hoy: ${dia}.`)}
  return lines
}

async function composeLocalReply(intent: CoachIntent, ctx: AIContext | null): Promise<string> {
  if (!ctx) {
    return `${LOCAL_NOTE}\nNo pude acceder a tus datos ahora. Revisá tu conexión y volvé a intentar.`
  }
  const tr = intent === 'training' ? await buildTrainingLine().catch(() => []) : []
  const nu = intent === 'nutrition' || intent === 'general' ? nutritionLines(ctx) : []
  const rc = intent === 'recovery' || intent === 'general' ? recoveryLines(ctx) : []
  const sc = intent === 'general' ? scoreLines(ctx) : intent === 'training' ? scoreLines(ctx).slice(0, 2) : []
  const hy = intent === 'hydration' || intent === 'general' || intent === 'recovery'
    ? await hydrationLines().catch(() => [])
    : []
  const body = intent === 'general' || intent === 'training' ? await bodyLines().catch(() => []) : []
  const adh = intent === 'general' || intent === 'training' ? await adherenceLines().catch(() => []) : []
  const ses = intent === 'general' || intent === 'training' ? sessionLines(ctx) : []

  const lines: string[] = [LOCAL_NOTE, ...tr, ...nu, ...rc, ...hy, ...body, ...adh, ...ses, ...sc]
  if (lines.length === 1) {
    if (intent === 'training') {
      lines.push('No encontré entrenamientos registrados para recomendarte todavía.')
    } else if (intent === 'nutrition') {
      lines.push('No hay registros de nutrición en tu día todavía.')
    } else if (intent === 'hydration') {
      lines.push('No hay registros de hidratación todavía. Marcá una botella y lo veo al toque.')
    } else if (intent === 'recovery') {
      lines.push('No hay registros de recuperación para analizar todavía.')
    } else {
      lines.push('No tengo datos suficientes todavía. Cargá tu entrenamiento, nutrición o recuperación y volvé a preguntar.')
    }
  }
  lines.push('¿Querés que revise otro tema de tu entrenamiento, nutrición o recuperación?')
  return lines.join('\n')
}

export async function buildLocalCoachReply(userMessage: string): Promise<LocalCoachReply> {
  const ctx = await buildTrainingContext().catch(() => null as AIContext | null)
  const text = await composeLocalReply(detectIntent(userMessage), ctx)
  return { text, source: 'local' }
}