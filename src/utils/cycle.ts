import type { UserProfile } from '@/types'

export type CycleConfig = {
  startDate: string // YYYY-MM-DD
  trainingDays: { n: number; name: string }[] // N°1..N
  weekMap: (number | null)[] // 0=Dom..6=Sab -> n | null (descanso)
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

export function getCycleFromProfile(p: UserProfile | null): CycleConfig {
  if (!p || !(p as any).cycle) return DEFAULT_CYCLE
  return (p as any).cycle as CycleConfig
}

export function getTrainingDayForDate(dateStr: string, cycle: CycleConfig): { n: number | null; name: string | null; isRest: boolean } {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const n = cycle.weekMap[dow] ?? null
  if (n === null) return { n: null, name: null, isRest: true }
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
