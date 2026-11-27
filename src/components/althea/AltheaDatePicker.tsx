import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

type AltheaDatePickerProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  ariaLabel?: string
  className?: string
  min?: string
  max?: string
  testId?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : new Date()
}

export function AltheaDatePicker({ value, onChange, label, ariaLabel, className = '', min, max }: AltheaDatePickerProps) {
  const selected = value ? parseKey(value) : null
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = selected ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  }, [month])

  const display = value ? parseKey(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Seleccionar fecha'
  const picker = open && createPortal(
    <div className="althea-picker-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <section className="althea-picker althea-calendar" role="dialog" aria-modal="true" aria-label={ariaLabel || label || 'Seleccionar fecha'}>
        <div className="althea-picker__eyebrow">Calendario</div>
        <div className="althea-picker__heading">
          <h2>{month.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</h2>
          <div className="althea-picker__nav">
            <button type="button" aria-label="Mes anterior" onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}><ChevronLeft size={20}/></button>
            <button type="button" aria-label="Mes siguiente" onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}><ChevronRight size={20}/></button>
          </div>
        </div>
        <div className="althea-calendar__grid althea-calendar__weekdays">{['L','M','X','J','V','S','D'].map((d,i)=><span key={i}>{d}</span>)}</div>
        <div className="althea-calendar__grid">
          {days.map((day, i) => {
            if (day === null) return <span key={`empty-${i}`} />
            const key = toKey(new Date(month.getFullYear(), month.getMonth(), day))
            const disabled = (!!min && key < min) || (!!max && key > max)
            return <button key={key} type="button" disabled={disabled} aria-pressed={value === key} className={value === key ? 'is-selected' : ''} onClick={() => { onChange(key); setOpen(false) }}>{day}</button>
          })}
        </div>
        <div className="althea-picker__actions">
          <button type="button" className="althea-picker__cancel" onClick={() => setOpen(false)}>Cancelar</button>
          <button type="button" className="althea-picker__today" onClick={() => { const today = toKey(new Date()); onChange(today); setMonth(new Date()); setOpen(false) }}>Hoy</button>
        </div>
      </section>
    </div>,
    document.body
  )

  return (
    <>
      {label && <span className="block mb-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</span>}
      <button type="button" className={`althea-date-trigger ${className}`} aria-label={ariaLabel || label || 'Seleccionar fecha'} data-testid={testId} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) { const d = selected ?? new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }; setOpen(v => !v) }}>
        <CalendarDays size={18} aria-hidden="true" />
        <span>{display}</span>
      </button>
      {picker}
    </>
  )
}
