import React from 'react';

export interface AltheaToolbarOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Icono decorativo a la izquierda de la etiqueta. aria-hidden (el texto ya nombra la opcion). */
  icon?: React.ReactNode;
}

export interface AltheaToolbarProps {
  options: AltheaToolbarOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * AltheaToolbar
 * Selector tipo pill (Semanas/Mes/3 meses/Año, o los días Lun–Dom del
 * calendario de Entrenamiento). Un único componente para todo selector
 * horizontal de rango o tab compacto.
 */
export function AltheaToolbar({ options, value, onChange, className, ...rest }: AltheaToolbarProps) {
  return (
    <div
      className={`althea-toolbar${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={rest['aria-label']}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          className="althea-toolbar__item"
          aria-selected={opt.value === value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon && <span className="althea-toolbar__icon" aria-hidden="true">{opt.icon}</span>}{opt.label}
        </button>
      ))}
    </div>
  );
}

export default AltheaToolbar;
