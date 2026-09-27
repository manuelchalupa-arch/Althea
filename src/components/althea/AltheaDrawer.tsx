import type { ReactNode } from 'react';
import { useOverlay } from './useOverlay';

export interface AltheaDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  position?: 'right' | 'left';
  className?: string;
}

export function AltheaDrawer({ open, onClose, title, subtitle, footer, children, position = 'right', className = '' }: AltheaDrawerProps) {
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
        aria-label={title || 'Panel'}
        className={`althea-drawer outline-none ${position === 'left' ? 'althea-drawer--left' : ''} ${className}`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 meander-border-b shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-section">{title}</h2>}
              {subtitle && <p className="font-body-md text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="tpress w-9 h-9 shrink-0 rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
        <div className="px-5 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 pb-5 pt-1 shrink-0 flex flex-col-reverse sm:flex-row justify-end gap-2">{footer}</div>}
      </div>
    </>
  );
}