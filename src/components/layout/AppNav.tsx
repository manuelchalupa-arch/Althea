import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS, MAS_GROUPS } from '@/components/brand/icons'
import BrandIcon from '@/components/brand/BrandIcon'
import { Meander } from '@/components/brand/temple'

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
      {/* Desktop: sidebar — Hellenic side rail */}
      <aside aria-label="Menú lateral" className="hidden md:flex fixed left-0 top-[52px] h-[calc(100vh-52px)] w-[208px] z-40 flex-col justify-between py-6 px-3 bg-surface-container-low border-r border-outline-variant/30 shadow-sm transition-colors duration-500">
        <div className="flex flex-col gap-6">
          {/* Brand Header */}
          <div className={`flex items-center gap-3 px-2 pb-4 mb-3 border-b border-outline-variant/20 ${collapsed ? 'justify-center' : ''}`}>
            <BrandIcon name="logo" size={32} />
            {!collapsed && (
              <div>
                <h2 className="font-headline-md text-title-md font-semibold tracking-widest text-primary">ALTHEA</h2>
                <p className="font-label-caps text-[9px] tracking-widest text-secondary uppercase font-semibold">PALAESTRA VIRTUE</p>
              </div>
            )}
          </div>
          {/* Main Navigation */}
          <nav className="space-y-1.5">
            {NAV_ITEMS.map(({ to, label, icon }) => (
              <NavLink
                key={to} to={to} title={label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-medium ${
                    collapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-primary/20 text-primary border-l-2 border-primary font-bold'
                      : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                  }`
                }
              >
                <BrandIcon name={icon} size={24} />
                {!collapsed && <span className="font-label-md text-label-md tracking-wide">{label}</span>}
              </NavLink>
            ))}
          </nav>
          {/* Secondary Modules */}
          {!collapsed && (
            <div className="pt-4 border-t border-outline-variant/40 flex flex-col gap-1.5">
              <p className="font-label-caps text-[9px] uppercase tracking-widest text-on-surface-variant px-3 mb-1 font-semibold">Módulos</p>
              {MAS_GROUPS.flatMap(g => g.items).filter(item => !NAV_ITEMS.some(n => n.to === item.to)).slice(0, 5).map(item => (
                <NavLink
                  key={item.to} to={item.to} title={item.label}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-primary font-bold'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'
                    }`
                  }
                >
                  <BrandIcon name={item.icon} size={20} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>
        {/* Footer Collapse Toggle */}
        <div className="pt-4 border-t border-outline-variant/40">
          <button
            onClick={toggle}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            className="tpress w-full flex items-center gap-3 px-3 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors font-medium"
          >
            <BrandIcon name={collapsed ? 'expand' : 'collapse'} size={18} />
            {!collapsed && <span className="font-label-md text-label-md tracking-wide">Contraer</span>}
          </button>
        </div>
      </aside>

      {/* Mobile: bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-lg border-t border-outline-variant/30 py-1.5 px-3 shadow-lg transition-colors duration-500 pb-safe" aria-label="Navegación principal">
        <div className="max-w-[440px] mx-auto flex items-center justify-around">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to} to={to} aria-label={label} title={label}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 px-3 min-h-[44px] min-w-[44px] rounded-lg transition-colors active:scale-[0.97] ${
                  isActive
                    ? 'text-primary font-bold border-b-2 border-primary'
                    : 'text-on-surface-variant hover:text-primary'
                }`
              }
            >
              <BrandIcon name={icon} size={24} />
              <span className="text-[10px] tracking-wider mt-0.5 font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
