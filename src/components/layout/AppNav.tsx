import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NAV_ITEMS, MAS_GROUPS, type NavItem } from '@/components/brand/icons'
import { AltheaNav, type AltheaNavEntry } from '@/components/navigation/AltheaNav'
import { AltheaIcon, type AltheaIconName } from '@/components/brand/AltheaIconRegistry'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'

export const MOBILE_NAV_OFFSET = 'calc(env(safe-area-inset-bottom, 0px) + 74px)'

const ICON_MAP: Record<string, AltheaIconName> = {
  home: 'inicio',
  training: 'entrenar',
  nutrition: 'nutricion',
  progress: 'progreso',
  calendar: 'calendario',
  more: 'mas',
  library: 'biblioteca',
  routines: 'rutinas',
  coach: 'coach',
  profile: 'perfil',
}

function toAltheaEntry(item: NavItem): AltheaNavEntry {
  return {
    id: item.to,
    label: item.label,
    icon: ICON_MAP[item.icon] ?? 'mas',
  }
}

function applyNavWidth(collapsed: boolean) {
  try {
    document.documentElement.style.setProperty('--navw', collapsed ? 'var(--navw-collapsed)' : '256px')
  } catch { /* noop */ }
}

export default function AppNav() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('althea:nav-collapsed') === '1'
      applyNavWidth(v)
      return v
    } catch { return false }
  })
  const { hasActiveSession } = useActiveTrainingSession()
  const { pathname } = useLocation()

  const primaryItems = NAV_ITEMS.filter(i => {
    if (i.icon === 'training') {return hasActiveSession}
    return ['home', 'nutrition', 'progress'].includes(i.icon as string)
  })
  const moreItem = NAV_ITEMS.find(i => i.icon === 'more')!
  // Deduplicar por ICONO, no por ruta: '/progreso' y '/progresos' son dos
  // strings que renderizan la misma pagina (Progreso.tsx). Comparar por icono
  // cubre ese caso y cualquier alias futuro.
  const modules = MAS_GROUPS
    .flatMap(g => g.items)
    .filter(item => item.to !== '/entrenar')
    .filter(item => !primaryItems.some(n => n.icon === item.icon))

  const primaryEntries = primaryItems.map(toAltheaEntry)
  const moduleEntries = modules.map(toAltheaEntry)
  const mobileEntries = [...primaryItems, moreItem].map(toAltheaEntry)

  const toggle = () => {
    const nx = !collapsed
    setCollapsed(nx)
    applyNavWidth(nx)
    try { localStorage.setItem('althea:nav-collapsed', nx ? '1' : '0') } catch { /* noop */ }
  }

  const renderNavLink = (
    entry: AltheaNavEntry,
    props: { className: string; 'aria-current'?: 'page'; children: React.ReactNode },
  ) => (
    <NavLink
      to={entry.id}
      title={entry.label}
      aria-label={entry.label}
      className={({ isActive }) =>
        `${props.className} ${
          isActive
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
        }`
      }
    >
      {props.children}
    </NavLink>
  )

  return (
    <>
      <aside
        aria-label="Menú lateral"
        className="hidden md:flex fixed left-0 top-16 h-[calc(100vh-64px)] z-30 bg-surface/90 backdrop-blur-xl border-r border-outline-variant/40 transition-colors"
      >
        <div className="hidden lg:flex flex-col justify-between w-[var(--navw)] transition-[width] duration-200 py-5 px-3">
          <div className="flex flex-col gap-5">
            <div className={`flex items-center gap-3 px-2 pb-4 mb-2 border-b border-outline-variant/40 ${collapsed ? 'justify-center' : ''}`}>
              <span className="temple-mark" aria-hidden="true">Α</span>
              {!collapsed && (
                <div className="min-w-0">
                  <h2 className="font-headline text-[15px] font-semibold tracking-[0.22em] text-on-surface leading-none">ALTHEA</h2>
                  <p className="label-olymp mt-1 text-on-surface-variant">Palaestra Virtue</p>
                </div>
              )}
            </div>
            <AltheaNav
              items={primaryEntries}
              activeId={pathname}
              variant="sidebar"
              renderLink={renderNavLink}
              className="flex flex-col gap-1.5"
            />
            {!collapsed && (
              <div className="pt-4 border-t border-outline-variant/40 flex flex-col gap-1.5">
                <p className="text-aux px-3 mb-1">Módulos</p>
                <AltheaNav
                  items={moduleEntries}
                  activeId={pathname}
                  variant="sidebar"
                  renderLink={renderNavLink}
                  className="flex flex-col gap-1.5"
                />
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-outline-variant/40">
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              className="tpress w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-medium min-h-[44px]"
            >
              <AltheaIcon name="mas" size={18} />
              {!collapsed && <span className="font-label-md text-label-md tracking-wide">Contraer</span>}
            </button>
          </div>
        </div>

        <div className="lg:hidden flex flex-col justify-between w-16 py-5 px-2 items-center">
          <div className="flex flex-col gap-2 w-full items-center">
            <span className="temple-mark mb-3" aria-hidden="true">Α</span>
            <AltheaNav
              items={primaryEntries}
              activeId={pathname}
              variant="sidebar"
              renderLink={renderNavLink}
              className="flex flex-col gap-1.5 w-full items-center"
            />
            <div className="my-1 h-px w-8 bg-outline-variant/50" aria-hidden="true" />
            <AltheaNav
              items={moduleEntries.slice(0, 4)}
              activeId={pathname}
              variant="sidebar"
              renderLink={renderNavLink}
              className="flex flex-col gap-1.5 w-full items-center"
            />
          </div>
        </div>
      </aside>

      <nav
        aria-label="Navegación principal"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 min-h-16 bg-surface/90 backdrop-blur-xl border-t border-primary/20 py-1.5 px-2 shadow-al-md pb-safe"
      >
        <div className="max-w-[480px] mx-auto flex items-center justify-around gap-1">
          <AltheaNav
            items={mobileEntries}
            activeId={pathname}
            variant="bar"
            renderLink={renderNavLink}
          />
        </div>
      </nav>
    </>
  )
}