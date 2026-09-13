import { useState } from 'react'
import { useLocation } from 'react-router-dom'

// Design System griego: lenguaje arquitectónico/escultórico reutilizable.
// Todo usa currentColor + vars de paleta existentes (NO se cambia la gama).
// Motivos abstractos originales de una misma familia (trazo grueso, simetría,
// extremos redondos): misma dirección artística en todas las secciones.

export type TempleSection =
  | 'inicio' | 'entrenar' | 'nutricion' | 'progreso' | 'mas'
  | 'biblioteca' | 'rutina' | 'calendario' | 'recuperacion' | 'perfil' | 'coach' | 'default'

export type SigilKind = 'laurel' | 'athlete' | 'torso' | 'bust' | 'column' | 'arch' | 'disc'

const SECTION_SIGIL: Record<TempleSection, SigilKind> = {
  inicio: 'laurel',
  entrenar: 'athlete',
  nutricion: 'disc',
  progreso: 'torso',
  mas: 'column',
  biblioteca: 'bust',
  rutina: 'column',
  calendario: 'arch',
  recuperacion: 'laurel',
  perfil: 'bust',
  coach: 'disc',
  default: 'column',
}

export function sigilForSection(s: TempleSection): SigilKind {
  return SECTION_SIGIL[s] ?? 'column'
}

export function sectionForPath(pathname: string): TempleSection {
  if (pathname === '/') return 'inicio'
  if (pathname.startsWith('/entrenar')) return 'entrenar'
  if (pathname.startsWith('/nutricion')) return 'nutricion'
  if (pathname.startsWith('/progreso')) return 'progreso'
  if (pathname.startsWith('/mas')) return 'mas'
  if (pathname.startsWith('/biblioteca')) return 'biblioteca'
  if (pathname.startsWith('/rutina')) return 'rutina'
  if (pathname.startsWith('/calendario')) return 'calendario'
  if (pathname.startsWith('/recuperacion')) return 'recuperacion'
  if (pathname.startsWith('/perfil')) return 'perfil'
  if (pathname.startsWith('/coach')) return 'coach'
  return 'default'
}

function SigilPaths({ kind }: { kind: SigilKind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'laurel':
      return (
        <g {...common}>
          <path d="M60 12 C36 30 30 62 44 96" />
          <path d="M60 12 C84 30 90 62 76 96" />
          <ellipse cx="42" cy="46" rx="7" ry="4" transform="rotate(-38 42 46)" />
          <ellipse cx="78" cy="46" rx="7" ry="4" transform="rotate(38 78 46)" />
          <ellipse cx="40" cy="66" rx="7" ry="4" transform="rotate(-24 40 66)" />
          <ellipse cx="80" cy="66" rx="7" ry="4" transform="rotate(24 80 66)" />
          <ellipse cx="44" cy="86" rx="6" ry="3.6" transform="rotate(-12 44 86)" />
          <ellipse cx="76" cy="86" rx="6" ry="3.6" transform="rotate(12 76 86)" />
        </g>
      )
    case 'athlete':
      return (
        <g {...common}>
          <circle cx="60" cy="24" r="10" />
          <path d="M60 40 L60 76" />
          <path d="M60 50 L34 64" />
          <path d="M60 50 L86 62" />
          <path d="M60 76 L42 104" />
          <path d="M60 76 L80 102" />
          <circle cx="90" cy="56" r="6" />
        </g>
      )
    case 'torso':
      return (
        <g {...common}>
          <path d="M32 46 Q60 30 88 46 L82 90 Q60 99 38 90 Z" />
          <path d="M44 52 L72 84" opacity="0.55" />
          <path d="M56 44 L48 60" opacity="0.55" />
        </g>
      )
    case 'bust':
      return (
        <g {...common}>
          <circle cx="60" cy="42" r="15" />
          <path d="M48 58 L43 82 L77 82 L72 58" />
          <path d="M38 82 L38 82" opacity="0" />
          <rect x="36" y="86" width="48" height="9" rx="2" />
        </g>
      )
    case 'column':
      return (
        <g {...common}>
          <rect x="36" y="26" width="48" height="8" rx="2" />
          <path d="M42 38 L78 38 L74 46 L46 46 Z" />
          <path d="M48 46 L48 96 M60 46 L60 96 M72 46 L72 96" />
          <rect x="38" y="96" width="44" height="8" rx="2" />
        </g>
      )
    case 'arch':
      return (
        <g {...common}>
          <path d="M24 100 A36 36 0 0 1 96 100" />
          <path d="M36 100 A24 24 0 0 1 84 100" />
          <path d="M56 58 L64 58 L62 70 L58 70 Z" />
          <path d="M24 100 L24 108 M96 100 L96 108" />
        </g>
      )
    case 'disc':
      return (
        <g {...common}>
          <circle cx="60" cy="60" r="38" />
          <circle cx="60" cy="60" r="24" />
          <circle cx="60" cy="60" r="4" fill="currentColor" stroke="none" />
        </g>
      )
  }
}

export function SectionSigil({ section, className = '' }: { section: TempleSection; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <SigilPaths kind={sigilForSection(section)} />
    </svg>
  )
}

// Cenefa de grecas (meandro) sutil para header/sidebar.
export function Meander({ className = '' }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 120 10">
      <defs>
        <pattern id="temple-meander" width="20" height="10" patternUnits="userSpaceOnUse">
          <path d="M1 9 V2 H13 V6 H6 V9 M13 9 V9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="120" height="10" fill="url(#temple-meander)" />
    </svg>
  )
}

// Velo de mármol: estratos + vetas con la paleta existente, muy sutil.
export function MarbleVeil({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`temple-veil ${className}`} />
}

// Variante fotográfica por sección: 3 fondos móvil + 3 desktop, nunca cruzados.
// Mapeo estable por sección (data-variant) -> media query elige el archivo correcto.
function variantForSection(s: TempleSection): 'a' | 'b' | 'c' {
  if (s === 'inicio' || s === 'biblioteca' || s === 'coach') return 'a'
  if (s === 'entrenar' || s === 'rutina' || s === 'calendario') return 'b'
  return 'c'
}

// Fondo global por sección: foto responsive + velo + sigilo. Fijo, sin interacción,
// por debajo de navegación y modales. Opacidad mínima: la información manda.
export function TempleBackdrop() {
  const { pathname } = useLocation()
  const section = sectionForPath(pathname)
  const variant = variantForSection(section)
  return (
    <div aria-hidden="true" className={`temple-backdrop temple-variant-${variant}`} data-section={section} data-variant={variant}>
      <div className="temple-photo" aria-hidden="true" />
      <div className="temple-photo-overlay" aria-hidden="true" />
      <MarbleVeil />
      <SectionSigil section={section} className="temple-sigil" />
    </div>
  )
}

// Header móvil: nombre centrado + logo del usuario (o marca de mármol temporal).
export function AppHeader() {
  const [logoOk, setLogoOk] = useState(true)
  return (
    <header className="md:hidden sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-border">
      <div className="flex items-center justify-center gap-2 h-[52px] px-4">
        {logoOk ? (
          <img
            src="/assets/logo/logo.svg"
            alt="Althea"
            className="w-7 h-7"
            onError={() => {
              console.warn('[ICONO PENDIENTE: logo/logo.svg] usando marca temporal.')
              setLogoOk(false)
            }}
          />
        ) : (
          <span className="temple-mark" aria-hidden="true">A</span>
        )}
        <span className="temple-word">ALTHEA</span>
      </div>
      <Meander className="temple-frieze" />
    </header>
  )
}
