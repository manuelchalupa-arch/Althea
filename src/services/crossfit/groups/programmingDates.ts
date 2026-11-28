/**
 * Fechas locales para la programación semanal.
 *
 * `weekStart` es `YYYY-MM-DD` del lunes de esa semana. Nunca se usa
 * `toISOString().slice(0, 10)` porque puede desplazar el día en husos como
 * Argentina (UTC-3): un mediodía local ya es el día siguiente en UTC.
 */

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Fecha local `YYYY-MM-DD` del lunes de la semana de `date` (hoy por defecto). */
export function getLocalWeekStart(date = new Date()): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const offset = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - offset)
  return formatLocalDate(monday)
}

/** Suma `amount` días a una fecha local `YYYY-MM-DD`. */
export function addDaysToLocalDate(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return formatLocalDate(date)
}

/** Siete días consecutivos, lunes a domingo, de la semana que empieza en `weekStart`. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToLocalDate(weekStart, i))
}

/** Valida que `weekStart` sea un lunes (día 1) y tenga formato YYYY-MM-DD. */
export function isValidWeekStart(value: string | null | undefined): value is string {
  if (typeof value !== 'string') { return false }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { return false }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getDay() === 1
  )
}
