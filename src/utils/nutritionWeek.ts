import { dayKeyOffset, weekdayOfKey } from '@/utils/dates'

export type DayPoint = { key: string; label: string; kcal: number; today: boolean }

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Serie de 7 días (6 previos + hoy) de calorías reales.
 * Las claves ausentes en el mapa se dibujan en 0: nunca se inventan valores.
 * Vive en Progreso; Nutrición muestra solo la acción del día.
 */
export function buildNutritionWeek(anchor: string, kcalByKey: Record<string, number>): DayPoint[] {
  return Array.from({ length: 7 }, (_, i) => {
    const key = dayKeyOffset(anchor, i - 6)
    return { key, label: DAY_LABELS[weekdayOfKey(key)], kcal: Number(kcalByKey[key] || 0), today: key === anchor }
  })
}
