import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** Confirmación de actualización con la identidad visual global de Althea. */
export default function UpdateConfirmDialog({ open, onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) { return }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCancel() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onCancel])

  if (!open) { return null }

  return createPortal(
    <div className="althea-dialog-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) { onCancel() }
    }}>
      <section className="althea-dialog althea-dialog--compact" role="alertdialog" aria-modal="true" aria-labelledby="althea-update-title" aria-describedby="althea-update-description">
        <div className="althea-dialog__eyebrow">Actualización disponible</div>
        <h2 id="althea-update-title" className="althea-dialog__title">¿Actualizar Althea?</h2>
        <p id="althea-update-description" className="althea-dialog__description">
          Se recargará la aplicación. Tus datos, rutinas e historial guardados se conservan.
        </p>
        <div className="althea-dialog__actions">
          <button ref={cancelRef} type="button" className="althea-dialog__button althea-dialog__button--secondary" onClick={onCancel}>Cancelar</button>
          <button type="button" className="althea-dialog__button althea-dialog__button--primary" onClick={onConfirm}>Actualizar</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
