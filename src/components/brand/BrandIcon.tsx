import { useState } from 'react'
import { ICONS, iconSrc } from './icons'

// Icono por nombre semático. Prioriza: SVG del usuario → custom fitness SVG → Lucide fallback.
const warned = new Set<string>()

export default function BrandIcon({
  name, size = 20, strokeWidth = 2, className = '', label,
}: {
  name: keyof typeof ICONS | string
  size?: number
  strokeWidth?: number
  className?: string
  label?: string
}) {
  const [missing, setMissing] = useState(false)
  const def = (ICONS as Record<string, (typeof ICONS)[keyof typeof ICONS]>)[name]
  const src = iconSrc(name)

  // Si hay icono custom fitness, usarlo directamente (SVG inline, siempre disponible)
  if (def?.custom) {
    const CustomIcon = def.custom
    return (
      <span className={className} role="img" aria-label={label || def.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
        <CustomIcon className="w-full h-full" />
      </span>
    )
  }

  // Si hay SVG del usuario en /assets, intentar cargarlo
  if (def && src && !missing) {
    return (
      <img
        src={src}
        alt=""
        aria-label={label || def.label}
        role="img"
        width={size}
        height={size}
        className={className}
        onError={() => {
          if (!warned.has(name)) {
            warned.add(name)
            console.warn(`[ICONO PENDIENTE: ${def.group}/${def.file}] usando fallback temporal.`)
          }
          setMissing(true)
        }}
      />
    )
  }

  // Fallback a Lucide
  if (!def) return null
  const Fallback = def.lucide
  return (
    <span className={className} role="img" aria-label={label || def.label} data-icon-fallback={name}>
      <Fallback size={size} strokeWidth={strokeWidth} aria-hidden />
    </span>
  )
}
