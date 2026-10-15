import { useEffect, useRef } from 'react'

interface Props {
  seconds: number
  onAdjust: (delta: number) => void
}

export default function RestTimerOverlay({ seconds, onAdjust }: Props) {
  const minusRef = useRef<HTMLButtonElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    minusRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
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
      const target = document.activeElement === minusRef.current
        ? plusRef.current
        : minusRef.current
      target?.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Descanso entre ejercicios"
      onKeyDown={onKeyDown}
    >
      <section className="w-full max-w-sm rounded-2xl border border-secondary/40 bg-surface p-7 text-center shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          Descanso
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
            className="min-h-14 rounded-xl bg-primary px-3 py-4 text-lg font-semibold text-on-primary"
            aria-label="Agregar 15 segundos"
          >
            +15 s
          </button>
        </div>

        <p className="mt-5 text-xs text-on-surface-variant">
          El entrenamiento se reanudará al terminar el descanso.
        </p>
      </section>
    </div>
  )
}