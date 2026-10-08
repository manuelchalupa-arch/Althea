import { AltheaIcon, AltheaIconName } from '../brand/AltheaIconRegistry';

export interface AltheaStatProps {
  icon: AltheaIconName;
  value: string | number;
  label: string;
  className?: string;
}

/** Un ítem de estadística compacto: icono + valor + label, pensado para compartir fila con otros. */
export function AltheaStat({ icon, value, label, className }: AltheaStatProps) {
  return (
    <div className={`althea-stat${className ? ` ${className}` : ''}`}>
      <span className="althea-stat__icon">
        <AltheaIcon name={icon} size={18} />
      </span>
      <span className="althea-stat__body">
        <span className="althea-stat__value">{value}</span>
        <span className="althea-stat__label">{label}</span>
      </span>
    </div>
  );
}

export interface AltheaStatRowProps {
  items: AltheaStatProps[];
  className?: string;
}

/** Fila de AltheaStat — usar en vez de N tarjetas separadas para métricas relacionadas (ej. "Esta semana": días, peso, sueño). */
export function AltheaStatRow({ items, className }: AltheaStatRowProps) {
  return (
    <div className={`althea-stat-row${className ? ` ${className}` : ''}`}>
      {items.map((item, i) => (
        <AltheaStat key={i} {...item} />
      ))}
    </div>
  );
}

export default AltheaStat;
