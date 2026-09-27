export type DateKey = string

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toLocalDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function todayKey(): DateKey {
  return toLocalDateKey(new Date())
}

export function toDateKey(value: string | Date): DateKey {
  if (value instanceof Date) return toLocalDateKey(value)
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return toLocalDateKey(d)
}

export function parseLocalDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0)
}

export function dayKeyOffset(key: DateKey, days: number): DateKey {
  const d = parseLocalDateKey(key)
  d.setDate(d.getDate() + days)
  return toLocalDateKey(d)
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  return dayKeyOffset(key, days)
}

export function daysBetween(from: DateKey, to: DateKey): number {
  const a = parseLocalDateKey(from).getTime()
  const b = parseLocalDateKey(to).getTime()
  return Math.round((b - a) / 86400000)
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function weekdayOfKey(key: DateKey): number {
  return parseLocalDateKey(key).getDay()
}

export function weekStartKey(key: DateKey): DateKey {
  return dayKeyOffset(key, -((weekdayOfKey(key) + 6) % 7))
}

export function monthStartKey(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`
}