import type { UserProfile } from '@/types'
import type { TrainingMethodId } from '@/services/ai/trainingMethods'
import { getMethod } from '@/services/ai/trainingMethodsDB'
import { selectMethods } from '@/services/ai/methodSelector'

export type CycleConfig = {
  startDate: string // YYYY-MM-DD
  trainingDays: { n: number; name: string }[] // N°1..N
  weekMap: (number | null)[] // 0=Dom..6=Sab -> n | null (descanso)
  methodId?: TrainingMethodId // método de entrenamiento seleccionado
  methodJustification?: string // por qué se eligió este método
}

export const DEFAULT_CYCLE: CycleConfig = {
  startDate: new Date().toISOString().slice(0,10),
  trainingDays: [
    { n: 1, name: 'Pecho + tríceps' },
    { n: 2, name: 'Espalda + bíceps' },
    { n: 3, name: 'Piernas' },
    { n: 4, name: 'Hombros + abdomen' },
  ],
  weekMap: [null, 1, 2, null, 3, 4, null] // Dom, Lun..Sab
}

/** Generar CycleConfig desde un método de entrenamiento */
export function buildCycleFromMethod(methodId: TrainingMethodId, availableDays?: number[], startDate?: string): CycleConfig {
  const method = getMethod(methodId)
  if (!method) {return DEFAULT_CYCLE}

  const days = availableDays || getDefaultDays(method.structure.typicalFrequency[0] || 3)
  const splitType = method.structure.splitType

  // Generar nombres de días según el split
  const dayNames = generateDayNames(splitType, methodId, days.length)

  // Construir trainingDays
  const trainingDays = dayNames.map((name, i) => ({ n: i + 1, name }))

  // Construir weekMap
  const weekMap: (number | null)[] = [null, null, null, null, null, null, null] // Dom-Sáb
  days.forEach((dow, i) => { weekMap[dow] = i + 1 })

  return {
    startDate: startDate || new Date().toISOString().slice(0, 10),
    trainingDays,
    weekMap,
    methodId,
    methodJustification: method.descriptionEs,
  }
}

/** Generar CycleConfig desde una recomendación de método (con mixto) */
export function buildCycleFromRecommendation(rec: { primary: TrainingMethodId; mixed?: { structure: { daysPerWeek: number } }; justification: string }, availableDays?: number[], startDate?: string): CycleConfig {
  // Usar método mixto si existe, sino el primario
  const methodId = rec.primary
  const method = getMethod(methodId)
  if (!method) {return DEFAULT_CYCLE}

  const daysCount = rec.mixed?.structure?.daysPerWeek || method.structure.typicalFrequency[0] || 3
  const days = availableDays || getDefaultDays(daysCount)
  const splitType = method.structure.splitType

  const dayNames = generateDayNames(splitType, methodId, days.length)
  const trainingDays = dayNames.map((name, i) => ({ n: i + 1, name }))

  const weekMap: (number | null)[] = [null, null, null, null, null, null, null]
  days.forEach((dow, i) => { weekMap[dow] = i + 1 })

  return {
    startDate: startDate || new Date().toISOString().slice(0, 10),
    trainingDays,
    weekMap,
    methodId,
    methodJustification: rec.justification,
  }
}

/** Generar CycleConfig completo desde perfil de usuario */
export function buildCycleFromProfile(profile: UserProfile, availableDays?: number[], startDate?: string): CycleConfig {
  const rec = selectMethods(profile)
  return buildCycleFromRecommendation(rec, availableDays, startDate)
}

function getDefaultDays(count: number): number[] {
  // Lunes=1, Martes=2, Miércoles=3, Jueves=4, Viernes=5, Sábado=6
  const allDays = [1, 2, 3, 4, 5, 6]
  // Distribuir equitativamente
  if (count >= 6) {return allDays}
  if (count <= 0) {return [1, 3, 5]}
  const step = Math.floor(6 / count)
  const days: number[] = []
  for (let i = 0; i < count; i++) {
    days.push(allDays[Math.min(i * step, 5)])
  }
  return [...new Set(days)].sort((a, b) => a - b)
}

function generateDayNames(splitType: string, methodId: TrainingMethodId, daysCount: number): string[] {
  const method = getMethod(methodId)
  const patterns = method?.structure.primaryMovementPatterns || []

  switch (splitType) {
    case 'full_body':
      return Array.from({ length: daysCount }, (_, i) => `Cuerpo completo ${i + 1}`)
    case 'upper_lower':
      const upper: string[] = []
      const lower: string[] = []
      for (let i = 0; i < daysCount; i++) {
        if (i % 2 === 0) {upper.push(`Tren superior ${Math.floor(i / 2) + 1}`)}
        else {lower.push(`Tren inferior ${Math.floor(i / 2) + 1}`)}
      }
      return [...upper, ...lower]
    case 'push_pull_legs':
      const ppl = ['Empuje', 'Tirón', 'Piernas']
      return Array.from({ length: daysCount }, (_, i) => ppl[i % ppl.length] + (daysCount > 3 ? ` ${Math.floor(i / 3) + 1}` : ''))
    case 'body_part':
      const parts = ['Pecho + tríceps', 'Espalda + bíceps', 'Piernas', 'Hombros + abdomen', 'Brazos', 'Core']
      return Array.from({ length: daysCount }, (_, i) => parts[i % parts.length])
    case 'custom':
      return Array.from({ length: daysCount }, (_, i) => `Día ${i + 1}`)
    default:
      return Array.from({ length: daysCount }, (_, i) => `Entrenamiento ${i + 1}`)
  }
}

export function getCycleFromProfile(p: UserProfile | null): CycleConfig {
  if (!p || !p.cycle) {return DEFAULT_CYCLE}
  return { ...p.cycle, methodId: p.cycle.methodId as TrainingMethodId | undefined }
}

export function getTrainingDayForDate(dateStr: string, cycle: CycleConfig): { n: number | null; name: string | null; isRest: boolean } {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const n = cycle.weekMap[dow] ?? null
  if (n === null) {return { n: null, name: null, isRest: true }}
  const td = cycle.trainingDays.find(x => x.n === n)
  return { n, name: td?.name ?? `Día N°${n}`, isRest: false }
}

export function formatAgendaDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const dayName = d.toLocaleDateString('es', { weekday: 'long' }).toUpperCase()
  const dayNum = d.getDate()
  const month = d.toLocaleDateString('es', { month: 'long' }).toUpperCase()
  return { dayName, dayNum, month, dow: d.getDay() }
}
