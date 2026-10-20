import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import ActivityWorkspace from './ActivityWorkspace'

export interface ActivityModalProps {
  onClose: () => void
}

/**
 * Ventana modal de Actividad libre: mismo workspace que la página
 * `/actividad` (mismos servicios, mismos cálculos, mismo almacenamiento).
 *
 * Se monta con portal en `document.body`: la página vive dentro del
 * stacking context de `.shell-content` (relative + z-10), donde ningún
 * z-index local puede superar al chrome fijo de nivel body (nav móvil,
 * FABs). Sin portal, el modal queda debajo en móviles.
 *
 * - role="dialog" + aria-modal + título accesible.
 * - Foco al abrir, restauración al cerrar, Escape y clic en fondo para cerrar
 *   (el clic en el contenido no cierra).
 * - Bloquea el scroll de fondo. En móvil ocupa todo el viewport dinámico
 *   (100dvh, acompaña al teclado virtual) con scroll interno.
 * - Cerrar no descarta sesiones ni el GPS en curso (tracker singleton).
 */
export default function ActivityModal({ onClose }: ActivityModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    openerRef.current = document.activeElement
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      const opener = openerRef.current
      if (opener instanceof HTMLElement) { opener.focus() }
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Actividad libre"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-surface text-on-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-outline-variant"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant p-4">
          <h2 className="text-lg font-semibold">
            Actividad libre
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar actividad"
            className="tpress min-w-[44px] min-h-[44px] rounded-lg bg-surface-container-high border border-outline-variant px-4 text-on-surface-variant hover:text-on-surface shrink-0 font-label-caps text-[11px] uppercase"
          >
            Cerrar
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <ActivityWorkspace />
        </div>
      </section>
    </div>,
    document.body,
  )
}
