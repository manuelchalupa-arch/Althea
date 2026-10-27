import { useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { AltheaAvatar } from './AltheaAvatar'
import { IconChatBubble } from './FitnessIcons'
import { accentSectionForPath as navSectionForPath } from '@/components/navigation/sections'

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
  const nav = useNavigate()
  const section = sectionForPath(loc.pathname)
  return (
    <header
      data-section={navSectionForPath(loc.pathname)}
      className="sticky top-[var(--safe-top)] z-30 flex items-center justify-between gap-3 pl-4 pr-4 sm:pl-6 sm:pr-6 lg:pl-8 lg:pr-8 h-14 md:h-16 w-full bg-surface/85 backdrop-blur-xl border-b border-outline-variant/50 [border-bottom-color:rgb(var(--althea-accent-rgb)/0.45)] supports-[backdrop-filter]:bg-surface/75 transition-colors"
    >
      {/* Izquierda: wordmark de Althea (sin icono ni círculo) + apartado en su color */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-headline block text-[32px] md:text-[34px] font-semibold tracking-[0.2em] leading-none text-[rgb(var(--althea-accent-rgb))]">
          ALTHEA
        </span>
        <span className="label-olymp hidden md:block truncate text-on-surface-variant">{SECTION_TITLES[section]}</span>
      </div>
      {/* Centro: spacer de layout (antes ocupaba un buscador sin functionality) */}
      <div className="hidden md:flex flex-1 max-w-[420px]">
        <div className="flex-1" />
      </div>
      {/* Derecha: desktop → coach → perfil → tema; mobile → chat */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-medium">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-primary" /> Coach activo
        </span>
        <button
          type="button"
          onClick={() => nav('/perfil')}
          className="hidden md:flex w-9 h-9 rounded-full bg-surface-container-high border border-outline-variant/50 overflow-hidden items-center justify-center text-on-surface-variant font-serif hover:border-primary/50 transition-colors"
          aria-label="Perfil y configuración"
        >
          <AltheaAvatar context="avatar" size={36} alt="Perfil" />
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('althea:open-chat'))}
          aria-label="Abrir conversación del Coach"
          className="md:hidden inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <IconChatBubble className="w-6 h-6" />
        </button>
      </div>
    </header>
  )
}
