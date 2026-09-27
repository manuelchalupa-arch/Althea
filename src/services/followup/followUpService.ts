/**
 * Seguimiento (check-in) manual del usuario.
 *
 * NO crea una fuente de verdad nueva: escribe en las tablas que ya consumen
 * Progreso, los informes y el coach:
 *   - medidas  → db.bodyMeasurements (BodyMeasurement)
 *   - recuperación → db.recoveryChecks vía updateRecoveryCheck()
 *
 * El período (semanal / mensual / personalizado) determina la fecha del
 * registro; no duplica datos automáticos de entrenamiento ni de nutrición.
 */
import { db } from '@/services/storage/db'
import { updateRecoveryCheck } from '@/services/recovery/recoveryService'
import { recoveryIndex, recoveryColor } from '@/utils/calc'
import { todayKey } from '@/utils/dates'
import { FOLLOW_UP_PERIODS, type FollowUpPeriod } from './periods'

export interface FollowUpMeasurements {
  weightKg?: number
  heightCm?: number
  bodyFatPct?: number
  muscleMassKg?: number
  chestCm?: number
  waistCm?: number
  hipCm?: number
}

export interface FollowUpRecovery {
  sleepHours?: number
  energy?: number
  fatigue?: number
  soreness?: number
  stress?: number
  motivation?: number
  mood?: number
  perceivedExertion?: number
}

export interface FollowUpInput {
  period: FollowUpPeriod
  customStart?: string
  customEnd?: string
  date?: string
  measurements?: FollowUpMeasurements
  recovery?: FollowUpRecovery
  notes?: string
}

export interface FollowUpResult {
  date: string
  savedMeasurement: boolean
  savedRecovery: boolean
  error?: string
}

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function clean<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') {continue}
    if (typeof v === 'number' && !Number.isFinite(v)) {continue}
    out[k] = v
  }
  return out as Partial<T>
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Rango inclusivo [start, end] del período seleccionado. */
export function followUpRange(period: FollowUpPeriod, customStart?: string, customEnd?: string, today = todayKey()): { start: string; end: string } {
  if (period === 'custom') {
    const start = customStart || today
    const end = customEnd || customStart || today
    return { start: start <= end ? start : end, end: start <= end ? end : start }
  }
  const days = FOLLOW_UP_PERIODS.find(p => p.id === period)?.days ?? 7
  const [y, m, d] = today.split('-').map(Number)
  const base = new Date(y, (m ?? 1) - 1, d ?? 1)
  base.setDate(base.getDate() - (days ?? 7) + 1)
  const start = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
  return { start, end: today }
}

/** Fecha del check-in: la del campo o el fin del período. */
export function followUpDate(input: Pick<FollowUpInput, 'period' | 'customStart' | 'customEnd' | 'date'>): string {
  if (input.date) {return input.date}
  return followUpRange(input.period, input.customStart, input.customEnd).end
}

/** ¿El usuario registró algo? Evita escrituras vacías. */
export function hasFollowUpData(input: FollowUpInput): boolean {
  const m = input.measurements
  const hasM = !!m && Object.values(m).some(isNum)
  const r = input.recovery
  const hasR = !!r && Object.values(r).some(isNum)
  return hasM || hasR
}

export async function saveFollowUp(input: FollowUpInput): Promise<FollowUpResult> {
  const date = followUpDate(input)
  const result: FollowUpResult = { date, savedMeasurement: false, savedRecovery: false }

  const m = clean(input.measurements ?? {}) as FollowUpMeasurements
  const measured = Object.values(m).some(isNum)
  if (measured) {
    const payload = clean({
      weightKg: isNum(m.weightKg) ? round1(m.weightKg) : undefined,
      heightCm: isNum(m.heightCm) ? round1(m.heightCm) : undefined,
      bodyFatPct: isNum(m.bodyFatPct) ? round1(m.bodyFatPct) : undefined,
      muscleMassKg: isNum(m.muscleMassKg) ? round1(m.muscleMassKg) : undefined,
      chestCm: isNum(m.chestCm) ? round1(m.chestCm) : undefined,
      waistCm: isNum(m.waistCm) ? round1(m.waistCm) : undefined,
      hipCm: isNum(m.hipCm) ? round1(m.hipCm) : undefined,
    })
    const id = `followup-${date}`
    const prev = await db.bodyMeasurements.get(id).catch(() => undefined)
    await db.bodyMeasurements.put({
      ...(prev ?? {}),
      id,
      localDate: date,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      ...payload,
      isDemo: false,
    } as never)
    result.savedMeasurement = true
  }

  const r = clean(input.recovery ?? {}) as FollowUpRecovery
  if (Object.values(r).some(isNum)) {
    const patch: Record<string, unknown> = {}
    if (isNum(r.sleepHours)) {patch.sleepHours = round1(r.sleepHours)}
    if (isNum(r.energy)) {patch.energy = Math.round(r.energy)}
    if (isNum(r.fatigue)) {patch.fatigue = Math.round(r.fatigue)}
    if (isNum(r.soreness)) {patch.soreness = Math.round(r.soreness)}
    if (isNum(r.stress)) {patch.stress = Math.round(r.stress)}
    if (isNum(r.motivation)) {patch.motivation = Math.round(r.motivation)}
    if (isNum(r.mood)) {patch.mood = Math.round(r.mood)}
    if (isNum(r.perceivedExertion)) {patch.perceivedExertion = Math.round(r.perceivedExertion)}
    if (input.notes) {patch.notes = input.notes}

    await updateRecoveryCheck(patch as never, date)

    // El índice solo se calcula si el registro ya tiene los 7 campos de
    // recoveryIndex(). Nunca se inventan valores para completarlo.
    const merged = await db.recoveryChecks.get(date).catch(() => undefined)
    if (merged) {
      const hasAll = (['energy', 'fatigue', 'mood', 'motivation', 'perceivedExertion', 'stress'] as const)
        .every(k => isNum(merged[k])) && isNum(merged.soreness)
      if (hasAll) {
        const score = recoveryIndex({
          energy: Number(merged.energy),
          fatigue: Number(merged.fatigue),
          pain: Number(merged.soreness),
          mood: Number(merged.mood),
          motivation: Number(merged.motivation),
          perceivedExertion: Number(merged.perceivedExertion),
          stress: Number(merged.stress),
        })
        await db.recoveryChecks.update(date, { score, color: recoveryColor(score) })
      }
    }
    result.savedRecovery = true
  }

  return result
}

/** Últimos seguimientos guardados (medidas + recuperación unidas por fecha). */
export async function listFollowUps(limit = 12): Promise<Array<{ date: string; weightKg?: number; sleepHours?: number; score?: number }>> {
  const [bodies, recs] = await Promise.all([
    db.bodyMeasurements.toArray().catch(() => []),
    db.recoveryChecks.toArray().catch(() => []),
  ])
  const byDate = new Map<string, { date: string; weightKg?: number; sleepHours?: number; score?: number }>()
  for (const b of bodies) {
    if (!b.localDate || b.isDemo) {continue}
    if (!isNum(b.weightKg)) {continue}
    byDate.set(b.localDate, { date: b.localDate, weightKg: round1(b.weightKg) })
  }
  for (const r of recs) {
    if (!r.localDate) {continue}
    const cur = byDate.get(r.localDate) ?? { date: r.localDate }
    if (isNum(r.sleepHours)) {cur.sleepHours = round1(r.sleepHours)}
    if (isNum(r.score)) {cur.score = Math.round(r.score)}
    byDate.set(r.localDate, cur)
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}
