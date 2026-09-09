import { Link } from 'react-router-dom'
import { BookOpen, ClipboardList, Calendar, Apple, Moon, TrendingUp, User, Dumbbell } from 'lucide-react'

const ITEMS = [
  { to: '/biblioteca', label: 'Biblioteca', Icon: BookOpen },
  { to: '/rutinas', label: 'Rutinas', Icon: ClipboardList },
  { to: '/calendario', label: 'Calendario', Icon: Calendar },
  { to: '/nutricion', label: 'Nutrición', Icon: Apple },
  { to: '/recuperacion', label: 'Recuperación', Icon: Moon },
  { to: '/progreso', label: 'Progreso', Icon: TrendingUp },
  { to: '/perfil', label: 'Perfil corporal', Icon: User },
  { to: '/entrenar', label: 'Entrenar', Icon: Dumbbell },
] as const

export default function Mas(){
  return (
    <div className="min-h-screen bg-bg p-4 pb-24 mx-auto max-w-lg lg:max-w-3xl space-y-4">
      <h1 className="text-section">Más</h1>
      <p className="text-aux text-textMuted">Centro de accesos — 8 áreas que alimentan el Coach IA</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ITEMS.map(({to,label,Icon})=>(
          <Link
            key={to}
            to={to}
            aria-label={label}
            className="group rounded-xl bg-surface border border-border p-3 flex flex-col items-center justify-center text-center gap-2 min-h-[100px]
                       hover:bg-bg hover:border-info/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info
                       active:scale-[0.98] transition"
          >
            <Icon size={36} strokeWidth={1.75} className="text-textMain group-hover:text-info transition" aria-hidden />
            <span className="text-aux font-medium leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      <p className="text-aux text-textMuted text-center">Funciones avanzadas (export/import, demo, sync) movidas a Perfil → Ajustes avanzados para mantener Más simple, sin perder funcionalidad.</p>
    </div>
  )
}
