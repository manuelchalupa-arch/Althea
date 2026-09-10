import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Dumbbell, Apple, TrendingUp, LayoutGrid, ChevronsLeft, ChevronsRight } from 'lucide-react'

// 5 secciones principales visibles simultáneamente (§10).
const items = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/entrenar', label: 'Entrenamiento', icon: Dumbbell },
  { to: '/nutricion', label: 'Nutrición', icon: Apple },
  { to: '/progresos', label: 'Progreso', icon: TrendingUp },
  { to: '/mas', label: 'Menú', icon: LayoutGrid },
]

function applyNavWidth(collapsed: boolean) {
  try {
    document.documentElement.style.setProperty('--navw', collapsed ? 'var(--navw-collapsed)' : '208px')
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
        <div className={`flex items-center gap-2 px-4 h-16 border-b border-border ${collapsed ? 'justify-center px-0' : ''}`}>
          <span className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold">A</span>
          {!collapsed && <span className="text-subtitle">Althea</span>}
        </div>
        <nav className="flex-1 py-3 space-y-1 px-2">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to} title={label}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-body ${collapsed ? 'justify-center px-0' : ''} ${isActive ? 'bg-elevated text-textMain st-active border' : 'text-textMuted'}`}
            >
              <Icon size={20} strokeWidth={2} aria-hidden />
              {!collapsed && <span className="text-body">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={toggle} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} className="m-2 p-2 rounded-lg bg-bg border border-border text-textMuted flex items-center justify-center">
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </aside>

      {/* Mobile: bottom navigation diseñada para móvil */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg border-t border-border pb-safe">
        <div className="mx-auto max-w-lg lg:max-w-3xl flex justify-around px-1">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) => `flex flex-col items-center gap-1 py-2 px-3 text-aux ${isActive ? 'text-textMain' : 'text-textMuted'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`p-1.5 rounded-lg ${isActive ? 'bg-elevated' : ''}`}>
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                  </span>
                  <span className="text-[11px]">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
