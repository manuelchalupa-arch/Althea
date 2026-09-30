import React from 'react';

export interface AltheaMonogramProps {
  /** Tamaño en px. Vectorial: nítido en 16, 24, 32, 48, 64, 128, 192 y 512. */
  size?: number;
  /** 'mark' = solo el símbolo (favicon, app icon). 'framed' = símbolo dentro de un círculo verde (botones, navegación). */
  variant?: 'mark' | 'framed';
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

/** Por debajo de este tamaño la corona de laurel se simplifica a un punto dorado (no se lee a 16–24 px). */
const DETAIL_MIN_SIZE = 28;

/**
 * AltheaMonogram — símbolo independiente de la marca: una "A" abrazada por una
 * corona de laurel abierta arriba. Un solo peso de trazo en la A (color de
 * marca vía currentColor) y dorado únicamente en el laurel (ornamento).
 * No depende del busto fotográfico: funciona en tamaños donde una fotografía
 * pierde toda su información.
 */
export function AltheaMonogram({ size = 32, variant = 'mark', className, title = 'Althea', style }: AltheaMonogramProps) {
  const detailed = size >= DETAIL_MIN_SIZE;
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      className={variant === 'mark' ? className : undefined}
      style={variant === 'mark' ? style : undefined}
    >
      <path d="M24 12 L34.5 40 M24 12 L13.5 40" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.2 31 H29.8" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
      {detailed ? (
        <g>
      <path d="M7.8 33.1L6.6 28.7L6.6 24.3L7.8 19.9L10.0 16.0L13.1 12.8L16.9 10.5" stroke="var(--althea-gold)" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M40.2 33.1L41.4 28.7L41.4 24.3L40.2 19.9L38.0 16.0L34.9 12.8L31.1 10.5" stroke="var(--althea-gold)" strokeWidth="1" strokeLinecap="round" fill="none" />
      <ellipse cx="5.0" cy="29.0" rx="2.25" ry="0.95" transform="rotate(67 5.0 29.0)" fill="var(--althea-gold)" />
      <ellipse cx="8.3" cy="28.5" rx="2.25" ry="0.95" transform="rotate(67 8.3 28.5)" fill="var(--althea-gold)" />
      <ellipse cx="5.0" cy="24.0" rx="2.25" ry="0.95" transform="rotate(52 5.0 24.0)" fill="var(--althea-gold)" />
      <ellipse cx="8.3" cy="24.5" rx="2.25" ry="0.95" transform="rotate(52 8.3 24.5)" fill="var(--althea-gold)" />
      <ellipse cx="6.2" cy="19.3" rx="2.25" ry="0.95" transform="rotate(38 6.2 19.3)" fill="var(--althea-gold)" />
      <ellipse cx="9.4" cy="20.6" rx="2.25" ry="0.95" transform="rotate(38 9.4 20.6)" fill="var(--althea-gold)" />
      <ellipse cx="8.6" cy="15.0" rx="2.25" ry="0.95" transform="rotate(23 8.6 15.0)" fill="var(--althea-gold)" />
      <ellipse cx="11.3" cy="17.1" rx="2.25" ry="0.95" transform="rotate(23 11.3 17.1)" fill="var(--althea-gold)" />
      <ellipse cx="12.0" cy="11.5" rx="2.25" ry="0.95" transform="rotate(8 12.0 11.5)" fill="var(--althea-gold)" />
      <ellipse cx="14.1" cy="14.2" rx="2.25" ry="0.95" transform="rotate(8 14.1 14.2)" fill="var(--althea-gold)" />
      <ellipse cx="16.2" cy="9.0" rx="2.25" ry="0.95" transform="rotate(-6 16.2 9.0)" fill="var(--althea-gold)" />
      <ellipse cx="17.6" cy="12.1" rx="2.25" ry="0.95" transform="rotate(-6 17.6 12.1)" fill="var(--althea-gold)" />
      <ellipse cx="43.0" cy="29.0" rx="2.25" ry="0.95" transform="rotate(113 43.0 29.0)" fill="var(--althea-gold)" />
      <ellipse cx="39.7" cy="28.5" rx="2.25" ry="0.95" transform="rotate(113 39.7 28.5)" fill="var(--althea-gold)" />
      <ellipse cx="43.0" cy="24.0" rx="2.25" ry="0.95" transform="rotate(128 43.0 24.0)" fill="var(--althea-gold)" />
      <ellipse cx="39.7" cy="24.5" rx="2.25" ry="0.95" transform="rotate(128 39.7 24.5)" fill="var(--althea-gold)" />
      <ellipse cx="41.8" cy="19.3" rx="2.25" ry="0.95" transform="rotate(142 41.8 19.3)" fill="var(--althea-gold)" />
      <ellipse cx="38.6" cy="20.6" rx="2.25" ry="0.95" transform="rotate(142 38.6 20.6)" fill="var(--althea-gold)" />
      <ellipse cx="39.4" cy="15.0" rx="2.25" ry="0.95" transform="rotate(157 39.4 15.0)" fill="var(--althea-gold)" />
      <ellipse cx="36.7" cy="17.1" rx="2.25" ry="0.95" transform="rotate(157 36.7 17.1)" fill="var(--althea-gold)" />
      <ellipse cx="36.0" cy="11.5" rx="2.25" ry="0.95" transform="rotate(172 36.0 11.5)" fill="var(--althea-gold)" />
      <ellipse cx="33.9" cy="14.2" rx="2.25" ry="0.95" transform="rotate(172 33.9 14.2)" fill="var(--althea-gold)" />
      <ellipse cx="31.8" cy="9.0" rx="2.25" ry="0.95" transform="rotate(186 31.8 9.0)" fill="var(--althea-gold)" />
      <ellipse cx="30.4" cy="12.1" rx="2.25" ry="0.95" transform="rotate(186 30.4 12.1)" fill="var(--althea-gold)" />
        </g>
      ) : (
        <circle cx="24" cy="6.2" r="2.3" fill="var(--althea-gold)" />
      )}
    </svg>
  );

  if (variant === 'mark') {return mark;}

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--althea-primary)',
        color: 'var(--althea-on-primary)',
        ...style,
      }}
    >
      <AltheaMonogram size={Math.round(size * 0.72)} variant="mark" title={title} />
    </span>
  );
}

export default AltheaMonogram;
