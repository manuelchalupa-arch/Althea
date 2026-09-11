import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '@/components/brand/icons'
import BrandIcon from '@/components/brand/BrandIcon'
import { Meander } from '@/components/brand/temple'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'

// 5 secciones principales visibles simultáneamente (§10).
// Móvil: SOLO ICONOS (§21), activo = cambio de fondo (§22), Entrenamiento con prioridad.

function applyNavWidth(collapsed: boolean) {
  try {
    document.documentElement.style.setProperty('--navw', collapsed ? 'var(--navw-collapsed)' : '208px')
  } catch { /* noop */ }
}

function LogoSlot({ size = 32 }: { size?: number }) {
  const [ok, setOk] = useState(true)
  if (ok) {
    return (
      <img
        src="/assets/logo/logo.svg"
        alt="Althea"
        width={size}
        height={size}
        onError={() => setOk(false)}
      />
    )
  }
  return <span className="temple-mark" aria-hidden="true">A</span>
}

export default function AppNav() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('althea:nav-collapsed') === '1'
      applyNavWidth(v)
      return v
    } catch { return false }
  })
  const toggle = () => {
    const nx = !collapsed
    setCollapsed(nx)
    applyNavWidth(nx)
    try { localStorage.setItem('althea:nav-collapsed', nx ? '1' : '0') } catch { /* noop */ }
  }

  return (
    <>
      {/* Desktop: sidebar colapsable */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-50 flex-col bg-surface border-r border-border transition-all" style={{ width: 'var(--navw)' }}>
        <div className={`flex items-center gap-2 px-4 h-16 ${collapsed ? 'justify-center px-0' : ''}`}>
          <LogoSlot size={32} />
          {!collapsed && <span className="text-subtitle tracking-wide">Althea</span>}
        </div>
        <Meander className="temple-frieze mx-3" />
        <nav className="flex-1 py-3 space-y-1 px-2">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to} to={to} title={label}
              className={({ isActive }) => `tpress flex items-center gap-3 rounded-lg px-3 py-2.5 text-body ${collapsed ? 'justify-center px-0' : ''} ${isActive ? 'bg-elevated text-textMain st-active border' : 'text-textMuted'}`}
            >
              <BrandIcon name={icon} size={20} strokeWidth={2} />
              {!collapsed && <span className="text-body">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={toggle} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} className="tpress m-2 p-2 rounded-lg bg-bg border border-border text-textMuted flex items-center justify-center">
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </aside>

      {/* Mobile: bottom navigation solo iconos */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg border-t border-border pb-safe" aria-label="Navegación principal">
        <div className="mx-auto max-w-lg lg:max-w-3xl flex justify-around px-1">
          {NAV_ITEMS.map(({ to, label, icon, priority }) => (
            <NavLink
              key={to} to={to} aria-label={label} title={label}
              className="tpress flex items-center justify-center py-2 min-w-[56px] min-h-[52px]"
            >
              {({ isActive }) => (
                <span className={`flex items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-elevated text-textMain st-active border px-4 py-2' : 'text-textMuted px-4 py-2'} ${priority && isActive ? 'ring-1 ring-primary' : ''}`}>
                  <BrandIcon name={icon} size={priority ? 23 : 21} strokeWidth={isActive ? 2.5 : 2} />
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
