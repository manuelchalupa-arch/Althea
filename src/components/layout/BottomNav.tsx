import { NavLink } from 'react-router-dom'
import { Home, Dumbbell, ClipboardList, Apple, TrendingUp, Brain } from 'lucide-react'

const items = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/entrenar', label: 'Entrenar', icon: Dumbbell },
  { to: '/rutina', label: 'Rutinas', icon: ClipboardList },
  { to: '/nutricion', label: 'Nutrición', icon: Apple },
  { to: '/progresos', label: 'Progreso', icon: TrendingUp },
  { to: '/coach', label: 'Coach', icon: Brain },
]
export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg/95 backdrop-blur border-t border-border pb-safe">
      <div className="mx-auto max-w-lg flex overflow-x-auto scrollbar-none justify-start md:justify-around gap-1 px-1">
        {items.map(({to,label,icon:Icon})=>(
          <NavLink key={to} to={to} className={({isActive})=>`flex flex-col items-center gap-1 py-2 px-2 text-aux whitespace-nowrap ${isActive?'text-action':'text-textMuted'}`}>
            <Icon size={18} strokeWidth={2} />
            <span className="text-[10px]">{label}</span>
          </NavLink>
        ))}
        <NavLink to="/mas" className={({isActive})=>`flex flex-col items-center gap-1 py-2 px-2 text-aux whitespace-nowrap ${isActive?'text-action':'text-textMuted'}`}>
          <span className="text-xs">⋯</span>
          <span className="text-[10px]">Más</span>
        </NavLink>
      </div>
    </nav>
  )
}
