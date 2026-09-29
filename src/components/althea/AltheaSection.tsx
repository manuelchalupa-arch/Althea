import React from 'react';

export interface AltheaSectionProps {
  title: string;
  subtitle?: string;
  /** Nombre de Material Symbol (string, como en el repo) o un nodo propio (ej. <AltheaIcon />). */
  icon?: React.ReactNode | string;
  /** Nodo libre (compatible con el AltheaSection actual del repo) o acción textual { label, onClick }. */
  action?: React.ReactNode | { label: string; onClick: () => void };
  children: React.ReactNode;
  className?: string;
}

function isTextAction(a: AltheaSectionProps['action']): a is { label: string; onClick: () => void } {
  return !!a && typeof a === 'object' && 'label' in a && 'onClick' in a && !React.isValidElement(a);
}

/**
 * AltheaSection — agrupador editorial: título en Playfair Display, subtítulo
 * opcional y acción a la derecha. Superconjunto del AltheaSection existente:
 * acepta las mismas props (title, subtitle, icon, action nodo, className),
 * por lo que puede reemplazar al archivo actual sin tocar a sus consumidores.
 */
export function AltheaSection({ title, subtitle, icon, action, children, className }: AltheaSectionProps) {
  return (
    <section className={`althea-section${className ? ` ${className}` : ''}`}>
      <div className="althea-section__header">
        <div className="althea-section__heading">
          {icon && (
            <span className="althea-section__icon" aria-hidden="true">
              {typeof icon === 'string' ? <span className="material-symbols-outlined">{icon}</span> : icon}
            </span>
          )}
          <div>
            <h2 className="althea-section__title">{title}</h2>
            {subtitle && <p className="althea-section__subtitle">{subtitle}</p>}
          </div>
        </div>
        {isTextAction(action) ? (
          <button type="button" className="althea-section__action" onClick={action.onClick}>{action.label}</button>
        ) : (
          action && <div className="althea-section__slot">{action}</div>
        )}
      </div>
      {children}
    </section>
  );
}

export default AltheaSection;
