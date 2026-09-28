import { useState, useEffect } from 'react'
import { NavLink, useMatch } from 'react-router-dom'
import { NAV_ITEMS, MAS_GROUPS, type NavItem } from '@/components/brand/icons'
import BrandIcon from '@/components/brand/BrandIcon'
import { useActiveTrainingSession } from '@/hooks/useActiveTrainingSession'

// Altura de la navegación móvil (barra inferior fija). Cualquier otro elemento
// fixed que deba apoyarse SOBRE la nav usa este offset: items (min-h-44 + py-2
// ×2) + py-1.5 ×2 + borde ≈ 74px, más el safe-area inferior del dispositivo.
export const MOBILE_NAV_OFFSET = 'calc(env(safe-area-inset-bottom, 0px) + 74px)'

// Jerarquía de navegación:
//   Principal (rail + mobile): Inicio · Entrenar · Nutrición · Progreso
//   Módulos (rail desktop): rutinas, calendario, biblioteca, recuperación, coach, perfil
//   Más (mobile): agregador del resto
const PRIMARY_ITEMS = NAV_ITEMS.filter(i => ['home', 'training', 'nutrition', 'progress'].includes(i.icon as string))
const MORE_ITEM = NAV_ITEMS.find(i => i.icon === 'more')!
const MODULES_BASE = MAS_GROUPS
  .flatMap(g => g.items)
  .filter(item => item.to !== '/entrenar')

function applyNavWidth(collapsed: boolean) {
  try {
    document.documentElement.style.setProperty('--navw', collapsed ? 'var(--navw-collapsed)' : '256px')
  } catch { /* noop */ }
}

interface NavLinkClass {
  to: string
  label: string
  icon: string
}

function RailItem({ item, rail }: { item: NavLinkClass; rail: boolean }) {
  return (
    <NavLink
      key={item.to}
      to={item.to}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg transition-all font-medium ${
          rail ? 'justify-center w-full min-h-[44px] min-w-[44px]' : 'px-3 py-2.5 w-full min-h-[44px]'
        } ${
          isActive
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {!rail && (
            <span
              aria-hidden="true"
              className={`absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full bg-primary transition-opacity ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
          <BrandIcon name={item.icon} size={rail ? 22 : 20} />
          {!rail && <span className="font-label-md text-label-md tracking-wide">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}

export default function AppNav() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('althea:nav-collapsed') === '1'
      applyNavWidth(v)
      return v
    } catch { return false }
  })
  // Sesión activa canónica (READY/IN_PROGRESS/PAUSED/COMPLETING): reactivo a
  // cambios de sesión (crear, finalizar, cancelar) sin recargar la página.
  const { hasActiveSession } = useActiveTrainingSession()
  const primaryItems = NAV_ITEMS.filter(i => {
    if (i.icon === 'training') {return hasActiveSession}
    return ['home', 'nutrition', 'progress'].includes(i.icon as string)
  })
  const mobileItems = [...primaryItems, MORE_ITEM]
  const modules = MODULES_BASE
    .filter(item => !primaryItems.some(n => n.to === item.to))
  const toggle = () => {
    const nx = !collapsed
    setCollapsed(nx)
    applyNavWidth(nx)
    try { localStorage.setItem('althea:nav-collapsed', nx ? '1' : '0') } catch { /* noop */ }
  }

  return (
    <>
      {/* Rail lateral — tablet (md) y desktop (lg+) */}
      <aside
        aria-label="Menú lateral"
        className="hidden md:flex fixed left-0 top-16 h-[calc(100vh-64px)] z-30 bg-surface/90 backdrop-blur-xl border-r border-outline-variant/40 transition-colors"
      >
        {/* Desktop: rail completo con colapso */}
        <div className="hidden lg:flex flex-col justify-between w-[var(--navw)] transition-[width] duration-200 py-5 px-3">
          <div className="flex flex-col gap-5">
            {/* Identidad */}
            <div className={`flex items-center gap-3 px-2 pb-4 mb-2 border-b border-outline-variant/40 ${collapsed ? 'justify-center' : ''}`}>
              <span className="temple-mark" aria-hidden="true">Α</span>
              {!collapsed && (
                <div className="min-w-0">
                  <h2 className="font-headline text-[15px] font-semibold tracking-[0.22em] text-on-surface leading-none">ALTHEA</h2>
                  <p className="label-olymp mt-1 text-on-surface-variant">Palaestra Virtue</p>
                </div>
              )}
            </div>
            {/* Principal */}
            <nav aria-label="Navegación de secciones" className="flex flex-col gap-1.5">
              {primaryItems.map(item => <RailItem key={item.to} item={item} rail={collapsed} />)}
            </nav>
            {/* Módulos */}
            {!collapsed && (
              <div className="pt-4 border-t border-outline-variant/40 flex flex-col gap-1.5">
                <p className="text-aux px-3 mb-1">Módulos</p>
                {modules.map(item => <RailItem key={item.to} item={item} rail={false} />)}
              </div>
            )}
          </div>
          {/* Pie: colapso */}
          <div className="pt-4 border-t border-outline-variant/40">
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              className="tpress w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-medium min-h-[44px]"
            >
              <BrandIcon name={collapsed ? 'expand' : 'collapse'} size={18} />
              {!collapsed && <span className="font-label-md text-label-md tracking-wide">Contraer</span>}
            </button>
          </div>
        </div>

        {/* Tablet: rail de iconos */}
        <div className="lg:hidden flex flex-col justify-between w-16 py-5 px-2 items-center">
          <div className="flex flex-col gap-2 w-full items-center">
            <span className="temple-mark mb-3" aria-hidden="true">Α</span>
            {primaryItems.map(item => <RailItem key={item.to} item={item} rail />)}
            <div className="my-1 h-px w-8 bg-outline-variant/50" aria-hidden="true" />
            {modules.slice(0, 4).map(item => <RailItem key={item.to} item={item} rail />)}
          </div>
        </div>
      </aside>

      {/* Mobile: navegación inferior */}
      <nav
        aria-label="Navegación principal"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl border-t border-outline-variant/40 py-1.5 px-2 shadow-al-md pb-safe"
      >
        <div className="max-w-[480px] mx-auto flex items-center justify-around gap-1">
            {mobileItems.map(item => <MobileNavItem key={item.to} item={item} />)}
        </div>
      </nav>
    </>
  )
}

function MobileNavItem({ item }: { item: NavItem }) {
  const active = useMatch({ path: item.to, end: item.to === '/' })
  return (
    <NavLink
      to={item.to}
      aria-label={item.label}
      title={item.label}
      className={`flex flex-col items-center justify-center py-2 px-3 min-h-[44px] min-w-[44px] rounded-lg transition-colors active:scale-[0.97] ${
        active ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <BrandIcon name={item.icon} size={23} />
      <span className="text-[10px] tracking-wider mt-0.5 font-medium">{item.label}</span>
      <span className={`mt-0.5 h-0.5 w-4 rounded-full transition-colors ${active ? 'bg-primary' : 'bg-transparent'}`} aria-hidden="true" />
    </NavLink>
  )
}