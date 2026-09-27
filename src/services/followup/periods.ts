/**
 * Períodos de seguimiento. Reutiliza las mismas etiquetas y el mismo motor de
 * fechas que los informes: '7' = semanal, '30' = mensual, 'custom' = personalizado.
 */
export type FollowUpPeriod = '7' | '30' | 'custom'

export const FOLLOW_UP_PERIODS: Array<{ id: FollowUpPeriod; label: string; days: number | null }> = [
  { id: '7', label: 'Semanal', days: 7 },
  { id: '30', label: 'Mensual', days: 30 },
  { id: 'custom', label: 'Personalizado', days: null },
]

export function followUpPeriodLabel(id: FollowUpPeriod): string {
  return FOLLOW_UP_PERIODS.find(p => p.id === id)?.label ?? 'Semanal'
}
