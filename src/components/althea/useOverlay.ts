import { useEffect, useRef } from 'react';

// Estado compartido de overlays (modal / drawer / sheet): Esc + bloqueo de scroll.
export function useOverlay(onClose: () => void, open: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {return}
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {onClose()}
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => panelRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      cancelAnimationFrame(raf)
    }
  }, [open, onClose])

  return panelRef
}