import { useEffect, useState } from 'react'
import SemanticIcon from '@/components/ui/SemanticIcon'
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
    <div data-testid="gym-card" data-status={exp?.status ?? 'none'} className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-al-sm ${tone}`}>
      <SemanticIcon name="fitness_center" size={16} className="shrink-0 opacity-80" />
      <span className="font-label-caps text-[9px] uppercase tracking-widest shrink-0">Gimnasio</span>
      {!payment || editing ? (
        <label className="flex items-center gap-2 min-w-0 text-[11px]">
          <span className="opacity-80 hidden sm:inline">{payment ? 'Vence' : 'Fecha de pago'}</span>
          <input
            type="date"
            data-testid="gym-card-input"
            aria-label="Fecha de pago del gimnasio"
            defaultValue={payment ?? ''}
            autoFocus={!payment}
            onChange={(e) => save(e.target.value)}
            className="bg-transparent border border-outline-variant/60 rounded px-2 py-1 text-[11px] text-inherit focus:outline-none"
          />
        </label>
      ) : (
        <p className="min-w-0 flex-1 truncate text-[11px]">
          <span data-testid="gym-card-due">
            Pagado {fmt(payment)} · {exp!.status === 'expired' ? 'venció' : 'vence'} {fmt(exp!.due)}
            {exp!.status === 'soon' && <> · en {exp!.daysLeft} {exp!.daysLeft === 1 ? 'día' : 'días'}</>}
            {exp!.status === 'expired' && <> · renová la cuota</>}
          </span>
        </p>
      )}
      {payment && !editing && (
        <button type="button" onClick={() => setEditing(true)} aria-label="Editar fecha de pago del gimnasio" className="shrink-0 opacity-60 hover:opacity-100 transition-opacity min-h-[24px]">
          <SemanticIcon name="edit" size={14} />
        </button>
      )}
      {editing && payment && (
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="shrink-0 text-[10px] font-label-caps uppercase opacity-70">Cancelar</button>
      )}
    </div>
  )
}
