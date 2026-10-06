import { useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import BrandIcon from './BrandIcon'
import { AltheaAvatar } from './AltheaAvatar'

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
  if (pathname === '/') {return 'inicio'}
  if (pathname.startsWith('/entrenar')) {return 'entrenar'}
  if (pathname.startsWith('/nutricion')) {return 'nutricion'}
  if (pathname.startsWith('/progreso')) {return 'progreso'}
  if (pathname.startsWith('/mas')) {return 'mas'}
  if (pathname.startsWith('/biblioteca')) {return 'biblioteca'}
  if (pathname.startsWith('/rutina')) {return 'rutina'}
  if (pathname.startsWith('/calendario')) {return 'calendario'}
  if (pathname.startsWith('/recuperacion')) {return 'recuperacion'}
  if (pathname.startsWith('/perfil')) {return 'perfil'}
  if (pathname.startsWith('/coach')) {return 'coach'}
  return 'default'
}

export function TempleBackdrop() {
  const { pathname } = useLocation()
  const section = sectionForPath(pathname)
  // Fondo sólido (sin vectores decorativos): el tema define el color vía CSS.
  return (
    <div aria-hidden="true" className="temple-backdrop" data-section={section} />
  )
}

const SECTION_TITLES: Record<TempleSection, string> = {
  inicio: 'Panel de día',
  entrenar: 'Entrenamiento',
  nutricion: 'Nutrición',
  progreso: 'Progreso',
  mas: 'Menú',
  biblioteca: 'Biblioteca',
  rutina: 'Rutinas',
  calendario: 'Calendario',
  recuperacion: 'Recuperación',
  perfil: 'Perfil y configuración',
  coach: 'Coach y objetivos',
  default: 'Althea',
}

export function AppHeader() {
  const loc = useLocation()
  const section = sectionForPath(loc.pathname)
  return (
    <header className="sticky top-[var(--safe-top)] z-30 flex items-center justify-between gap-3 pl-4 pr-4 sm:pl-6 sm:pr-6 lg:pl-8 lg:pr-8 h-16 w-full bg-surface/85 backdrop-blur-xl border-b border-outline-variant/50 supports-[backdrop-filter]:bg-surface/75 transition-colors">
      {/* Izquierda: identidad + contexto */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 w-8 h-8 rounded-full overflow-hidden ring-1 ring-primary/25 bg-surface-container-high" aria-hidden="true">
          <BrandIcon name="logo" size={32} className="w-full h-full object-cover" />
        </span>
        <div className="leading-none">
          <span className="font-headline block text-[15px] font-semibold tracking-[0.22em] text-on-surface">ALTHEA</span>
          <span className="label-olymp mt-1 block text-on-surface-variant hidden sm:block">{SECTION_TITLES[section]}</span>
        </div>
      </div>
      {/* Centro: spacer de layout (antes ocupaba un buscador sin functionality) */}
      <div className="hidden md:flex flex-1 max-w-[420px]">
        <div className="flex-1" />
      </div>
      {/* Derecha: coach → perfil → tema */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-medium">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-primary" /> Coach activo
        </span>
        <div className="w-9 h-9 rounded-full bg-surface-container-high border border-outline-variant/50 overflow-hidden flex items-center justify-center text-on-surface-variant font-serif" aria-label="Perfil">
          <AltheaAvatar context="avatar" size={36} alt="Perfil" />
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
