import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Minus, Plus } from 'lucide-react'

type AltheaTimePickerProps = {
  value: string
  onChange: (value: string) => void
  label?: string
  ariaLabel?: string
  className?: string
  minuteStep?: number
}

export function AltheaTimePicker({ value, onChange, label, ariaLabel, className = '', minuteStep = 5 }: AltheaTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [hour, setHour] = useState((value.split(':')[0] || '08').padStart(2, '0'))
  const [minute, setMinute] = useState((value.split(':')[1] || '00').padStart(2, '0'))

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [open])

  const picker = open && createPortal(
    <div className="althea-picker-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <section className="althea-picker althea-time-picker" role="dialog" aria-modal="true" aria-label={ariaLabel || label || 'Seleccionar hora'}>
        <div className="althea-picker__eyebrow">Horario</div>
        <h2 className="althea-time-picker__title">Seleccionar hora</h2>
        <div className="althea-time-picker__fields">
          <div className="althea-time-stepper">
            <span>Hora</span>
            <button type="button" aria-label="Aumentar hora" onClick={() => setHour(v => String((Number(v) + 1) % 24).padStart(2, '0'))}><Plus size={18}/></button>
            <strong>{hour}</strong>
            <button type="button" aria-label="Disminuir hora" onClick={() => setHour(v => String((Number(v) + 23) % 24).padStart(2, '0'))}><Minus size={18}/></button>
          </div>
          <span>:</span>
          <div className="althea-time-stepper">
            <span>Minutos</span>
            <button type="button" aria-label="Aumentar minutos" onClick={() => setMinute(v => String((Number(v) + minuteStep) % 60).padStart(2, '0'))}><Plus size={18}/></button>
            <strong>{minute}</strong>
            <button type="button" aria-label="Disminuir minutos" onClick={() => setMinute(v => String((Number(v) - minuteStep + 60) % 60).padStart(2, '0'))}><Minus size={18}/></button>
          </div>
        </div>
        <div className="althea-picker__actions">
          <button type="button" className="althea-picker__cancel" onClick={() => setOpen(false)}>Cancelar</button>
          <button type="button" className="althea-picker__today" onClick={() => { onChange(`${hour}:${minute}`); setOpen(false) }}>Guardar</button>
        </div>
      </section>
    </div>,
    document.body
  )

  return (
    <>
      {label && <span className="block mb-1 font-label-md text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</span>}
      <button type="button" className={`althea-date-trigger ${className}`} aria-label={ariaLabel || label || 'Seleccionar hora'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { const [h='08',m='00'] = value.split(':'); setHour(h.padStart(2,'0')); setMinute(m.padStart(2,'0')); setOpen(true) }}>
        <Clock3 size={18} aria-hidden="true" />
        <span>{value || 'Seleccionar hora'}</span>
      </button>
      {picker}
    </>
  )
}
