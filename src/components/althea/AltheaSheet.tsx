import type { ReactNode } from 'react';
import { useOverlay } from './useOverlay';

export interface AltheaSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AltheaSheet({ open, onClose, title, subtitle, footer, children, className = '' }: AltheaSheetProps) {
  const panelRef = useOverlay(onClose, open)
  if (!open) {return null}
  return (
    <>
      <div className="veil" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel inferior'}
        className={`althea-sheet outline-none ${className}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-outline-variant shrink-0" aria-hidden="true" />
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2 meander-border-b shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-section">{title}</h2>}
              {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="tpress w-9 h-9 shrink-0 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="px-5 pb-6 pt-1 flex flex-col-reverse justify-end gap-2">{footer}</div>}
      </div>
    </>
  );
}