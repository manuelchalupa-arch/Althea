import { useEffect, useRef, useState } from 'react'

interface Props {
  seconds: number
  label: string
  onAdjust: (delta: number) => void
  onFinish: () => void
}

const ARM_MS = 3000

export default function RestTimerOverlay({ seconds, label, onAdjust, onFinish }: Props) {
  const minusRef = useRef<HTMLButtonElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const finRef = useRef<HTMLButtonElement>(null)
  const [armed, setArmed] = useState(false)
  const armTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    minusRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  // Si cambia el tipo de descanso, el "Fin" vuelve a requerir doble toque.
  useEffect(() => {
    setArmed(false)
  }, [label])

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) { window.clearTimeout(armTimerRef.current) }
    }
  }, [])

  if (seconds <= 0) { return null }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      const order = [minusRef.current, plusRef.current, finRef.current]
      const idx = order.indexOf(document.activeElement as HTMLButtonElement | null)
      const next = order[(idx + 1) % order.length] ?? minusRef.current
      next?.focus()
    }
  }

  const handleFin = () => {
    if (!armed) {
      setArmed(true)
      armTimerRef.current = window.setTimeout(() => setArmed(false), ARM_MS)
      return
    }
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current)
      armTimerRef.current = null
    }
    setArmed(false)
    onFinish()
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-5"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <section className="w-full max-w-sm rounded-2xl border border-secondary/40 bg-surface p-7 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          {label}
        </p>

        <div
          className="my-8 font-mono text-7xl font-bold tabular-nums text-on-surface"
          role="timer"
          aria-live="off"
        >
          {Math.floor(seconds / 60)}:
          {String(seconds % 60).padStart(2, '0')}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            ref={minusRef}
            type="button"
            onClick={() => onAdjust(-15)}
            className="min-h-14 rounded-xl border border-outline-variant bg-surface-container px-3 py-4 text-lg font-semibold text-on-surface"
            aria-label="Restar 15 segundos"
          >
            −15 s
          </button>
          <button
            ref={plusRef}
            type="button"
            onClick={() => onAdjust(15)}
            className="min-h-14 rounded-xl border border-outline-variant bg-surface-container px-3 py-4 text-lg font-semibold text-on-surface"
            aria-label="Agregar 15 segundos"
          >
            +15 s
          </button>
        </div>

        <button
          ref={finRef}
          type="button"
          onClick={handleFin}
          className="mt-3 w-full min-h-14 rounded-xl bg-primary px-3 py-4 text-base font-bold uppercase tracking-widest text-on-primary"
          aria-label="Terminar descanso"
        >
          {armed ? '¿Seguro? Tocá de nuevo' : 'Fin'}
        </button>

        <p className="mt-5 text-xs text-on-surface-variant">
          {armed
            ? 'Tocá «Fin» otra vez para dejar el descanso.'
            : 'El entrenamiento se reanudará al terminar el descanso.'}
        </p>
      </section>
    </div>
  )
}
