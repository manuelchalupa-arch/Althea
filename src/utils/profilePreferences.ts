// Preferencias de entrenamiento: una sola lectura canónica para generador,
// selector de métodos y contexto IA. Nunca incluye nombre, email ni ids de cuenta.
import type { ExperienceLevel } from '@/types'
import { getExcludedExercises, getPainAreas, getTrainingLimitations } from '@/utils/restrictions'
import { resolveTrainingGoal } from '@/utils/trainingGoal'

type ProfileLike = Record<string, any> | null | undefined

const LEVELS: Record<string, ExperienceLevel> = {
  beginner: 'beginner', principiante: 'beginner',
  intermediate: 'intermediate', intermedio: 'intermediate',
  advanced: 'advanced', avanzado: 'advanced',
}

/** `level` es legacy; `experienceLevel` manda cuando es válido. */
export function resolveExperienceLevel(p: ProfileLike): ExperienceLevel {
  if (!p) { return 'intermediate' }
  const direct = LEVELS[String(p.experienceLevel || '').toLowerCase()]
  if (direct) { return direct }
  return LEVELS[String(p.level || '').toLowerCase()] || 'intermediate'
}

/** Intensidad de ENTRENAMIENTO. `coachIntensity` es tono del Coach, no esto. */
export function resolveTrainingIntensity(p: ProfileLike): number | undefined {
  const n = Number(p?.exigencia?.entrenamiento ?? p?.trainingIntensity)
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : []
}

// El perfil guarda Equipment (español); catálogo y métodos usan inglés.
const EQUIPMENT_CANONICAL: Record<string, string> = {
  barra: 'barbell', barras: 'barbell',
  mancuernas: 'dumbbell', mancuerna: 'dumbbell',
  maquina: 'machine', maquinas: 'machine',
  polea: 'cable', poleas: 'cable',
  peso_corporal: 'bodyweight', 'peso corporal': 'bodyweight',
  banda: 'band', bandas: 'band',
  kettlebell: 'kettlebell', otro: 'other',
}
function canonicalEquipment(value: unknown): string[] {
  return [...new Set(asStrings(value).map(e => EQUIPMENT_CANONICAL[e.toLowerCase()] || e))]
}

export interface TrainingPreferences {
  goal: string | undefined
  secondaryGoals: string[]
  level: ExperienceLevel
  daysPerWeek: number
  availableDays: number[]
  equipment: string[]
  limitations: string[]
  painAreas: string[]
  excludedExercises: string[]
  excludedMovements: string[]
  sessionDurationMin: number
  preferredTime: string | undefined
  availabilityNotes: string | undefined
  modality: 'gym' | 'crossfit'
  trainingIntensity: number | undefined
  needs: string | undefined
}

export function getTrainingPreferences(p: ProfileLike): TrainingPreferences {
  const profile = p || {}
  const days = (profile.availableDays?.length
    ?? profile.schedule?.availableDays?.length
    ?? (Array.isArray(profile.cycle?.weekMap) ? profile.cycle.weekMap.filter((d: unknown) => d !== null).length : 0))
    || 3
  return {
    goal: resolveTrainingGoal(profile),
    secondaryGoals: asStrings(profile.goalsSecondary),
    level: resolveExperienceLevel(profile),
    daysPerWeek: Math.max(1, Math.min(7, Number(days) || 3)),
    availableDays: [...new Set((Array.isArray(profile.availableDays) ? profile.availableDays : Array.isArray(profile.schedule?.availableDays) ? profile.schedule.availableDays : []).map((d: unknown) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))],
    equipment: canonicalEquipment(profile.equipment),
    limitations: getTrainingLimitations(profile),
    painAreas: getPainAreas(profile),
    excludedExercises: getExcludedExercises(profile),
    excludedMovements: asStrings(profile.excludedMovements),
    sessionDurationMin: Number(profile.sessionDurationMin || profile.schedule?.sessionTimeAvailable) || 60,
    preferredTime: profile.trainingTime || profile.schedule?.preferredTime || undefined,
    availabilityNotes: profile.availabilityNotes || undefined,
    modality: profile.trainingModality === 'crossfit' ? 'crossfit' : 'gym',
    trainingIntensity: resolveTrainingIntensity(profile),
    needs: profile.needsDescription || undefined,
  }
}

/** Contexto mínimo para prompts: solo entrenamiento, sin PII. */
export function buildAiTrainingContext(p: ProfileLike, routine?: { name?: string; daysPerWeek?: number } | null): string {
  const t = getTrainingPreferences(p)
  const lines = [
    `Objetivo: ${t.goal || 'no declarado'}`,
    t.secondaryGoals.length ? `Objetivos secundarios: ${t.secondaryGoals.join(', ')}` : '',
    `Nivel: ${t.level}`,
    `Días disponibles por semana: ${t.daysPerWeek}`,
    t.availableDays.length ? `Días exactos: ${t.availableDays.map(d => ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d]).join(', ')}` : '',
    t.equipment.length ? `Equipamiento: ${t.equipment.join(', ')}` : '',
    t.limitations.length ? `Restricciones: ${t.limitations.join(', ')}` : '',
    t.painAreas.length ? `Zonas con dolor: ${t.painAreas.join(', ')}` : '',
    t.excludedExercises.length ? `Ejercicios excluidos: ${t.excludedExercises.join(', ')}` : '',
    t.excludedMovements.length ? `Movimientos excluidos: ${t.excludedMovements.join(', ')}` : '',
    `Duración de sesión: ${t.sessionDurationMin} min`,
    `Modalidad: ${t.modality}`,
    t.availabilityNotes ? `Disponibilidad: ${t.availabilityNotes}` : '',
    routine?.name ? `Rutina activa: ${routine.name}${routine.daysPerWeek ? ` (${routine.daysPerWeek} días/semana)` : ''}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}
