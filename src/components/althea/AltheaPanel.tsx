import React from 'react';

export interface AltheaPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 'default' | 'compact' (menos padding) | 'flush' (sin padding, para contenido que gestiona su propio espaciado). */
  density?: 'default' | 'compact' | 'flush';
  /** Panel clickeable: recibe foco, Enter/Espacio lo activan, hover verde. */
  interactive?: boolean;
  /** Esquina dorada ornamental (detalle, nunca protagonista). */
  goldCorner?: boolean;
  /** Nombre de Material Symbol (string) o un nodo propio, a la izquierda. */
  icon?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * AltheaPanel — superficie base única del sistema. NO crear una tarjeta por
 * dato: agrupar métricas relacionadas dentro de un mismo panel con
 * AltheaStatRow / AltheaMetric.
 */
export const AltheaPanel = React.forwardRef<HTMLDivElement, AltheaPanelProps>(
  ({ density = 'default', interactive = false, goldCorner = false, icon, className, children, onKeyDown, ...rest }, ref) => {
    const classes = [
      'althea-panel',
      icon ? 'althea-panel--with-icon' : '',
      density === 'compact' ? 'althea-panel--compact' : density === 'flush' ? 'althea-panel--flush' : '',
      interactive ? 'althea-panel--interactive' : '',
      goldCorner ? 'althea-gold-corner' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={classes}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? 'button' : undefined}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (interactive && !e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
AltheaPanel.displayName = 'AltheaPanel';

export default AltheaPanel;
