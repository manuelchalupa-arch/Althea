import { useEffect, useState } from 'react'
import SemanticIcon from '../ui/SemanticIcon'
import { MacroPlate } from './MacroPlate'

import {
  getMacroTotals,
  getMacroGoals,
  macroPercent,
  type MacroTotals,
  type MacroGoals,
} from '@/services/nutrition/macroService'
import { todayKey } from '@/utils/dates'

const MACRO_ITEMS: Array<{ key: 'protein' | 'carbs' | 'fat'; label: string; icon: string; tone: string }> = [
  { key: 'protein', label: 'Proteína', icon: 'restaurant', tone: 'text-primary' },
  { key: 'carbs', label: 'Carbos', icon: 'grain', tone: 'text-tertiary' },
  { key: 'fat', label: 'Grasas', icon: 'local_fire_department', tone: 'text-secondary' },
]

export function MacroSummary({ size = 260 }: { size?: number }) {
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
      <div className="border border-outline-variant/40 rounded-2xl p-5 sm:p-6 flex flex-col justify-center items-center shadow-al-sm bg-surface-container">
        <span className="text-on-surface-variant text-[11px] font-label-caps uppercase">Consumo de macronutrientes</span>
        <p className="text-[10px] text-on-surface-variant mt-1">Cargando…</p>
      </div>
    )
  }

  if (!totals || !goals) {
    return null
  }

  return (
    <div className="border border-outline-variant/40 rounded-2xl p-5 sm:p-6 space-y-5 shadow-al-sm bg-surface-container">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-secondary-container/40 border border-secondary/40 flex items-center justify-center shrink-0">
          <SemanticIcon name="nutrition" size={20} className="text-secondary" />
        </div>
        <div className="min-w-0">
          <span className="font-label-caps text-[10px] uppercase text-on-surface font-semibold truncate block">Macronutrientes</span>
          <span className="shrink-0 font-label-caps text-[10px] text-on-surface-variant uppercase block mt-0.5">{todayKey()}</span>
        </div>
      </div>

      {/* ─── GRÁFICO CIRCULAR — elemento visual principal ─── */}
      <div className="flex flex-col gap-5">
        <div className="mx-auto w-full max-w-[320px]">
          <MacroPlate totals={totals} goals={goals} size={size} showLegend={false} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {MACRO_ITEMS.map(({ key, label, tone }) => {
            const consumed = totals[key]
            const goal = goals[key]
            const pct = goal > 0 ? macroPercent(consumed, goal) : 0
            return (
              <div key={key} className="rounded-xl bg-surface-container-high border border-outline-variant/30 p-2 space-y-1.5 min-w-0">
                <div className="min-w-0">
                  <span className="font-label-caps !text-[12px] sm:!text-[13px] font-semibold text-on-surface truncate block">{label}</span>
                </div>
                <span className={`font-headline-sm text-[15px] font-bold text-on-surface tabular-nums ${tone}`}>
                  {Math.round(consumed)}g
                </span>
                <div className="h-2 w-full rounded-full bg-surface-bright overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%`, background: tone === 'text-primary' ? 'var(--c-primary-rgb)' : tone === 'text-tertiary' ? 'var(--c-tertiary-rgb)' : 'var(--c-secondary-rgb)' }} />
                </div>
                <p className="text-[11px] text-on-surface-variant text-right">
                  {goal > 0 ? `${Math.round(pct)}% de ${goal}g` : 'sin objetivo'}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="pt-3 border-t border-surface-bright flex items-center justify-between gap-3">
        <div className="text-center">
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Calorías hoy</span>
          <span className="font-headline-sm text-[14px] font-bold text-on-surface tabular-nums">{Math.round(totals.calories)} kcal</span>
        </div>
        <div className="text-center">
          <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">Objetivo</span>
          <span className="font-headline-sm text-[14px] font-bold text-on-surface tabular-nums">{Math.round(goals.calories)} kcal</span>
        </div>
      </div>
      <p className="text-[11px] text-on-surface-variant text-center">
        Consumo real del día vs objetivos del perfil.
      </p>
    </div>
  )
}

export default MacroSummary
