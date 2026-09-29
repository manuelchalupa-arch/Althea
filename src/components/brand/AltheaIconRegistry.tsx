import React from 'react';

export type AltheaIconName =
  | 'inicio'
  | 'entrenar'
  | 'nutricion'
  | 'progreso'
  | 'recuperacion'
  | 'rutinas'
  | 'calendario'
  | 'biblioteca'
  | 'coach'
  | 'perfil'
  | 'mas';

export interface AltheaIconProps {
  name: AltheaIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}

/**
 * Geometría compartida por todo el set: viewBox 0 0 24 24, stroke-only,
 * strokeWidth 1.75, cap/join redondeados, sin relleno. Cada icono es un solo
 * <g> de paths — nada de mezclar estilos (algunos rellenos, otros trazo) para
 * que el registro se lea como un único sistema.
 */
const PATHS: Record<AltheaIconName, React.ReactNode> = {
  inicio: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </>
  ),
  entrenar: (
    <>
      <path d="M6 8v8M18 8v8" />
      <path d="M3 10v4M21 10v4" />
      <path d="M6 12h12" />
    </>
  ),
  nutricion: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v8l5 3" />
    </>
  ),
  progreso: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  recuperacion: (
    <>
      <path d="M12 21c-4.4-2.6-8-6.2-8-10.3A5.2 5.2 0 0 1 9.2 5.5 5 5 0 0 1 12 7a5 5 0 0 1 2.8-1.5A5.2 5.2 0 0 1 20 10.7c0 4.1-3.6 7.7-8 10.3Z" />
    </>
  ),
  rutinas: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 2v4M16 2v4M4 10h16" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="8.2" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  biblioteca: (
    <>
      <path d="M5 4.5h5.5v15H5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
      <path d="M13.5 4.5H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5.5Z" />
      <path d="M10.5 4.5h3v15h-3Z" />
    </>
  ),
  coach: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </>
  ),
  mas: (
    <>
      <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
};

const LABELS: Record<AltheaIconName, string> = {
  inicio: 'Inicio',
  entrenar: 'Entrenar',
  nutricion: 'Nutrición',
  progreso: 'Progreso',
  recuperacion: 'Recuperación',
  rutinas: 'Rutinas',
  calendario: 'Calendario',
  biblioteca: 'Biblioteca',
  coach: 'Coach',
  perfil: 'Perfil',
  mas: 'Más',
};

/**
 * AltheaIcon — icono individual. Usar AltheaIconRegistry.get(name) o
 * directamente <AltheaIcon name="entrenar" />.
 */
export function AltheaIcon({ name, size = 22, strokeWidth = 1.75, className, title }: AltheaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title ?? LABELS[name]}
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

/** Registro consultable — útil cuando la navegación se arma desde datos (config-driven). */
export const AltheaIconRegistry = {
  names: Object.keys(PATHS) as AltheaIconName[],
  labels: LABELS,
  get(name: AltheaIconName, props?: Omit<AltheaIconProps, 'name'>) {
    return <AltheaIcon name={name} {...props} />;
  },
};

export default AltheaIconRegistry;
