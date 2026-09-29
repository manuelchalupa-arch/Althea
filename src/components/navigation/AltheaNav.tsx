import React from 'react';
import { AltheaIcon, type AltheaIconName } from '../brand/AltheaIconRegistry';

export interface AltheaNavEntry {
  id: string;
  label: string;
  icon: AltheaIconName;
  disabled?: boolean;
  /** Si se pasa, se renderiza como <a>. Si no, como <button>. */
  href?: string;
}

export interface AltheaNavProps {
  items: AltheaNavEntry[];
  activeId: string;
  onSelect?: (id: string) => void;
  /** 'sidebar' (desktop/tablet, ícono + texto en fila) | 'bar' (mobile, ícono sobre texto, fija abajo). */
  variant?: 'sidebar' | 'bar';
  /** Render propio del enlace (ej. <NavLink> de react-router). Recibe className, aria y children ya resueltos. */
  renderLink?: (
    entry: AltheaNavEntry,
    props: { className: string; 'aria-current'?: 'page'; children: React.ReactNode },
  ) => React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * AltheaNav — navegación visual. Estados: inactive, hover, active
 * (aria-current="page", fondo verde), disabled. El cambio de estado es color
 * + una presión de 0.98 (120 ms, ease-out); nada más se mueve.
 */
export function AltheaNav({ items, activeId, onSelect, variant = 'sidebar', renderLink, className, ...rest }: AltheaNavProps) {
  return (
    <nav
      className={`althea-nav althea-nav--${variant}${className ? ` ${className}` : ''}`}
      aria-label={rest['aria-label'] ?? 'Navegación principal'}
    >
      {items.map((entry) => {
        const active = entry.id === activeId;
        const cls = 'althea-nav-item';
        const inner = (
          <>
            <AltheaIcon name={entry.icon} size={variant === 'bar' ? 22 : 20} />
            <span className="althea-nav-item__label">{entry.label}</span>
          </>
        );
        if (renderLink && !entry.disabled) {
          return (
            <React.Fragment key={entry.id}>
              {renderLink(entry, { className: cls, 'aria-current': active ? 'page' : undefined, children: inner })}
            </React.Fragment>
          );
        }
        const common = {
          key: entry.id,
          className: cls,
          'aria-current': active ? ('page' as const) : undefined,
          'data-disabled': entry.disabled ? 'true' : undefined,
        };
        return entry.href && !entry.disabled ? (
          <a {...common} href={entry.href} onClick={() => onSelect?.(entry.id)}>{inner}</a>
        ) : (
          <button {...common} type="button" disabled={entry.disabled} onClick={() => onSelect?.(entry.id)}>{inner}</button>
        );
      })}
    </nav>
  );
}

export default AltheaNav;
