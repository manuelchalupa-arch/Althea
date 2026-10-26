import { useEffect, useState } from 'react'
import { todayKey, isDateKey, parseLocalDateKey, toLocalDateKey, daysBetween } from '@/utils/dates'

const STORAGE_KEY = 'althea:gymPaymentDate'

/** Días de anticipación en los que la tarjeta cambia a color de aviso. */
export const GYM_WARN_DAYS = 5

/** Pago el 3 de abril → vence el 3 de mayo; con fin de mes se ajusta
 *  al último día real (31 de enero → 28/29 de feiembre). */
export function addOneMonthKey(key: string): string {
  const d = parseLocalDateKey(key)
  const y = d.getFullYear()
  const m = d.getMonth()
  const nextY = m === 11 ? y + 1 : y
  const nextM = m === 11 ? 0 : m + 1
  const lastDay = new Date(nextY, nextM + 1, 0).getDate()
  return toLocalDateKey(new Date(nextY, nextM, Math.min(d.getDate(), lastDay), 12))
}

export function gymExpiry(paymentKey: string, today: string = todayKey()): { due: string; daysLeft: number; status: 'ok' | 'soon' | 'expired' } {
  const due = addOneMonthKey(paymentKey)
  const daysLeft = daysBetween(today, due)
  return { due, daysLeft, status: daysLeft < 0 ? 'expired' : daysLeft <= GYM_WARN_DAYS ? 'soon' : 'ok' }
}

function fmt(key: string): string {
  return parseLocalDateKey(key).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
}

export default function GymPaymentCard() {
  const [payment, setPayment] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      setPayment(v && isDateKey(v) ? v : null)
    } catch { setPayment(null) }
  }, [])

  const save = (value: string) => {
    const next = isDateKey(value) ? value : null
    setPayment(next)
    try {
      if (next) { localStorage.setItem(STORAGE_KEY, next) } else { localStorage.removeItem(STORAGE_KEY) }
    } catch {}
    setEditing(false)
  }

  const exp = payment ? gymExpiry(payment) : null
  const tone = exp?.status === 'expired'
    ? 'bg-error/10 border-error/45 text-error'
    : exp?.status === 'soon'
      ? 'bg-[var(--althea-warning-soft)] border-[var(--althea-warning)]/40 text-[var(--althea-warning)]'
      : 'border-outline-variant/40 bg-surface-container text-on-surface'

  return (
    <div data-testid="gym-card" data-status={exp?.status ?? 'none'} className={`relative overflow-hidden rounded-2xl border px-5 py-4 shadow-al-md ${tone}`}>
      <div className="absolute -right-6 -top-6 text-6xl opacity-20 select-none pointer-events-none" aria-hidden="true">🏋️</div>
      <div className="relative z-10 flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary-container/30 border border-primary/30 flex items-center justify-center shrink-0 text-2xl" aria-hidden="true">💪</div>
        <div className="min-w-0 flex-1">
          <div className="font-label-caps text-[10px] uppercase tracking-widest opacity-80">Tu cuota del gimnasio</div>
          {!payment || editing ? (
            <label className="flex flex-wrap items-center gap-2 mt-1.5 text-[13px]">
              <span className="opacity-80 shrink-0">¿Cuándo pagaste?</span>
              <input
                type="date"
                data-testid="gym-card-input"
                aria-label="Fecha de pago del gimnasio"
                defaultValue={payment ?? ''}
                autoFocus={!payment}
                onChange={(e) => save(e.target.value)}
                className="min-w-0 bg-transparent border border-outline-variant/60 rounded-lg px-2 py-1.5 text-[14px] text-inherit focus:outline-none"
              />
            </label>
          ) : (
            <p className="min-w-0 mt-1 text-[14px] font-medium">
              <span data-testid="gym-card-due">
                Pagado {fmt(payment)} · {exp!.status === 'expired' ? 'venció' : 'vence'} {fmt(exp!.due)}
                {exp!.status === 'soon' && <> · en {exp!.daysLeft} {exp!.daysLeft === 1 ? 'día' : 'días'}</>}
                {exp!.status === 'expired' && <> · renová la cuota</>}
              </span>
            </p>
          )}
          {payment && !editing && (
            <button type="button" onClick={() => setEditing(true)} aria-label="Editar fecha de pago del gimnasio" className="mt-1.5 shrink-0 text-[11px] font-label-caps uppercase opacity-70 hover:opacity-100 transition-opacity">
              Editar fecha
            </button>
          )}
          {editing && payment && (
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="mt-1.5 shrink-0 text-[11px] font-label-caps uppercase opacity-70">Cancelar</button>
          )}
        </div>
      </div>
    </div>
  )
}
