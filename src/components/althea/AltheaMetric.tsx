import React from 'react';

export interface AltheaMetricProps {
  value: string | number;
  unit?: string;
  label: string;
  /** Variación respecto al período anterior. Positivo => 'up', a menos que invertDelta esté activo (ej. peso a bajar). */
  delta?: number;
  /** Para métricas donde bajar es la mejora (ej. peso, grasa corporal): invierte el color de la flecha. */
  invertDelta?: boolean;
  deltaSuffix?: string;
  /** Nombre de Material Symbol (string) o un nodo propio. Opcional. */
  icon?: React.ReactNode;
  className?: string;
}

function formatDelta(delta: number, suffix: string) {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${suffix}`;
}

/**
 * AltheaMetric
 * El "número protagonista" del sistema: Playfair Display grande, unidad y
 * label discretos en Inter. Usar dentro de un AltheaPanel o AltheaStatRow.
 */
export function AltheaMetric({
  value,
  unit,
  label,
  delta,
  invertDelta = false,
  deltaSuffix = '%',
  icon,
  className,
}: AltheaMetricProps) {
  let deltaClass = 'althea-metric__delta--flat';
  let arrow = '→';
  if (typeof delta === 'number' && delta !== 0) {
    const isUp = delta > 0;
    const isGood = invertDelta ? !isUp : isUp;
    deltaClass = isGood ? 'althea-metric__delta--up' : 'althea-metric__delta--down';
    arrow = isUp ? '↑' : '↓';
  }

  return (
    <div className={`althea-metric${className ? ` ${className}` : ''}`}>
      <div>
        <span className="althea-metric__value">{value}</span>
        {unit && <span className="althea-metric__unit">{unit}</span>}
      </div>
      <span className="althea-metric__label">
        {icon && <span className="althea-metric__icon" aria-hidden="true">{icon}</span>}
        {label}
      </span>
      {typeof delta === 'number' && (
        <span className={`althea-metric__delta ${deltaClass}`}>
          {arrow} {formatDelta(delta, deltaSuffix)}
        </span>
      )}
    </div>
  );
}

export default AltheaMetric;
