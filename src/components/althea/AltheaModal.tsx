import { useEffect, useRef, type ReactNode } from 'react';
import { useOverlay } from './useOverlay';

interface AltheaModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}

export function AltheaModal({ open, onClose, title, subtitle, footer, children, size = 'md', className = '' }: AltheaModalProps) {
  const panelRef = useOverlay(onClose, open)

  useEffect(() => {
    if (!open) {return}
    const prev = document.activeElement as HTMLElement | null
    return () => prev?.focus?.()
  }, [open])

  if (!open) {return null}
  return (
    <>
      <div className="veil" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Diálogo'}
        className={`althea-modal ${size === 'lg' ? 'althea-modal--lg' : ''} outline-none ${className}`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 meander-border-b sticky top-0 bg-surface z-10">
            <div className="min-w-0">
              {title && <h2 className="text-section">{title}</h2>}
              {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="tpress w-9 h-9 shrink-0 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 pb-5 pt-1 flex flex-col-reverse sm:flex-row justify-end gap-2">{footer}</div>}
      </div>
    </>
  );
}