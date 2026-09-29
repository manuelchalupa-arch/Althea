import React from 'react';
import { AltheaMonogram } from './AltheaMonogram';

export interface AltheaBrandProps {
  /** 'full' = monograma + wordmark + tagline (splash, PDF, sidebar ancho). 'compact' = monograma + wordmark (header). 'mark' = solo símbolo. */
  variant?: 'full' | 'compact' | 'mark';
  size?: number;
  className?: string;
}

/**
 * AltheaBrand
 * Lockup oficial de marca. Combina AltheaMonogram con la wordmark tipográfica
 * en Playfair Display y, en la variante completa, el tagline en Inter con
 * tracking amplio ("CIENCIA · DISCIPLINA · RESULTADOS").
 */
export function AltheaBrand({ variant = 'compact', size = 28, className }: AltheaBrandProps) {
  if (variant === 'mark') {
    return <AltheaMonogram size={size} variant="mark" className={className} />;
  }

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--althea-space-3)' }}
    >
      <AltheaMonogram size={size} variant="mark" style={{ color: 'var(--althea-primary)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span
          className="althea-wordmark"
          style={{ fontSize: size * 0.75 }}
        >
          ALTHEA
        </span>
        {variant === 'full' && (
          <span className="althea-wordmark-tagline">
            Ciencia · Disciplina · Resultados
          </span>
        )}
      </div>
    </div>
  );
}

export default AltheaBrand;
