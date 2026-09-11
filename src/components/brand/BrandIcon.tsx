import { useState } from 'react'
import { ICONS, iconSrc } from './icons'

// Icono por nombre semántico. Usa el SVG del usuario si existe en /assets;
// si falta, usa el fallback Lucide y avisa en consola (placeholder de desarrollo §18).
// Nunca inventa el diseño definitivo: el SVG del usuario siempre gana cuando existe.
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
  if (!def || !src || missing) {
    const Fallback = def?.lucide
    if (!def) return null
    return (
      <span className={className} role="img" aria-label={label || def.label} data-icon-fallback={name}>
        <Fallback size={size} strokeWidth={strokeWidth} aria-hidden />
      </span>
    )
  }
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
