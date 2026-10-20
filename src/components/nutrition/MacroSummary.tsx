import { useEffect, useState } from 'react'
import SemanticIcon from '../ui/SemanticIcon'

import {
  getMacroTotals,
  getMacroGoals,
  macroPercent,
  type MacroTotals,
  type MacroGoals,
} from '@/services/nutrition/macroService'
import { todayKey } from '@/utils/dates'

const MACRO_ITEMS: Array<{ key: 'protein' | 'carbs' | 'fat'; label: string; icon: string; tone: string }> = [
  { key: 'protein', label: 'Proteínas', icon: 'restaurant', tone: 'text-primary' },
  { key: 'carbs', label: 'Carbohidratos', icon: 'grain', tone: 'text-tertiary' },
  { key: 'fat', label: 'Grasas', icon: 'local_fire_department', tone: 'text-secondary' },
]

export function MacroSummary() {
  const [totals, setTotals] = useState<MacroTotals | null>(null)
  const [goals, setGoals] = useState<MacroGoals | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([getMacroTotals(todayKey()), getMacroGoals()]).then(([t, g]) => {
      if (alive) { setTotals(t); setGoals(g); setLoading(false) }
    }).catch(() => { if (alive) { setLoading(false) } })
    return () => { alive = false }
  }, [])

  if (loading) {
    return (
      <div className="border border-outline-variant/40 rounded-lg p-4 min-h-[200px] flex flex-col justify-center items-center">
        <span className="text-on-surface-variant text-[11px] font-label-caps uppercase">Consumo de macronutrientes</span>
        <p className="text-[10px] text-on-surface-variant mt-1">Cargando…</p>
      </div>
    )
  }

  if (!totals || !goals) {
    return null
  }

  return (
    <div className="border border-outline-variant/40 rounded-lg p-3.5 sm:p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <SemanticIcon name="nutrition" size={18} className="text-secondary" />
          <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold">Consumo de macronutrientes</span>
        </div>
        <span className="shrink-0 font-label-caps text-[10px] text-on-surface-variant uppercase">{todayKey()}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MACRO_ITEMS.map(({ key, label, icon, tone }) => {
          const consumed = totals[key]
          const goal = goals[key]
          const pct = goal > 0 ? macroPercent(consumed, goal) : 0
          return (
            <div key={key} className="rounded bg-surface-container-high border border-outline-variant/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <SemanticIcon name={icon} size={16} className={`text-[14px] ${tone}`} />
                  <span className="font-label-caps text-[9px] font-semibold text-on-surface truncate">{label}</span>
                </div>
                <span className={`font-headline-sm text-[13px] font-bold text-on-surface tabular-nums ${tone}`}>
                  {Math.round(consumed)}g
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-bright overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%`, background: tone === 'text-primary' ? 'var(--c-primary-rgb)' : tone === 'text-tertiary' ? 'var(--c-tertiary-rgb)' : 'var(--c-secondary-rgb)' }} />
              </div>
              <p className="text-[10px] text-on-surface-variant text-right">
                {goal > 0 ? `${Math.round(pct)}% de ${goal}g` : 'sin objetivo'}
              </p>
            </div>
          )
        })}
      </div>

      <div className="pt-2 border-t border-surface-bright flex justify-between text-center">
        <span className="font-label-caps text-[9px] text-on-surface-variant uppercase flex-1">Calorías hoy</span>
        <span className="font-headline-sm text-[12px] font-bold text-on-surface tabular-nums">{Math.round(totals.calories)} kcal</span>
      </div>
      <p className="text-[10px] text-on-surface-variant text-center">
        Consumo real del día vs objetivos calculados desde tu perfil.
      </p>
    </div>
  )
}

export default MacroSummary
