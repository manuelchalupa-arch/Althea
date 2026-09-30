import React, { useId } from 'react'

export interface MeanderFriezeProps {
  /** Alto de la franja en px (3–4 px según identidad). */
  height?: number
  /** Color del trazo; acepta cualquier color CSS (usa el dorado ornamental por defecto). */
  color?: string
  className?: string
  title?: string
}

/**
 * MeanderFrieze — friso helénico ornamental bajo el header.
 *
 * Mismo motivo que `.althea-fret-divider` (grecas de 24×6 unidades), pero como
 * SVG en línea: el color acepta variables CSS (responde al modo oscuro) y la
 * escala se deriva de `height`, así la greca nunca se recorta ni se deforma.
 * En flujo normal (`div` de alto fijo): no genera overlay ni desplaza contenido
 * más allá de su propia franja.
 */
export function MeanderFrieze({
  height = 3,
  color = 'rgb(var(--c-gold-rgb) / 0.4)',
  className,
  title = 'Ornamento helénico',
}: MeanderFriezeProps) {
  const uid = useId().replace(/:/g, '')
  const k = height / 6
  return (
    <div
      className={className}
      role="img"
      aria-label={title}
      style={{ height, overflow: 'hidden' }}
    >
      <svg width="100%" height={height} display="block" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`fret-${uid}`} width={24 * k} height={height} patternUnits="userSpaceOnUse">
            <path
              d="M0 1H7V5H11V1H17V5H21V1H24"
              transform={`scale(${k})`}
              fill="none"
              stroke={color}
              strokeWidth={1}
            />
          </pattern>
        </defs>
        <rect width="100%" height={height} fill={`url(#fret-${uid})`} />
      </svg>
    </div>
  )
}

export default MeanderFrieze
