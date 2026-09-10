import { Link } from 'react-router-dom'
import { BookOpen, ClipboardList, Calendar, Moon, Apple, TrendingUp, Brain, User } from 'lucide-react'

// Menú / Biblioteca: única zona para áreas secundarias (§13).
const GROUPS = [
  {
    title: 'Biblioteca',
    items: [
      { to: '/biblioteca', label: 'Ejercicios y músculos', Icon: BookOpen },
    ],
  },
  {
    title: 'Entrenamiento',
    items: [
      { to: '/rutinas', label: 'Rutinas', Icon: ClipboardList },
      { to: '/calendario', label: 'Calendario e historial', Icon: Calendar },
      { to: '/recuperacion', label: 'Recuperación', Icon: Moon },
    ],
  },
  {
    title: 'Salud y progreso',
    items: [
      { to: '/nutricion', label: 'Nutrición', Icon: Apple },
      { to: '/progreso', label: 'Progreso y estadísticas', Icon: TrendingUp },
    ],
  },
  {
    title: 'Persona',
    items: [
      { to: '/coach', label: 'Coach y objetivos', Icon: Brain },
      { to: '/perfil', label: 'Perfil y configuración', Icon: User },
    ],
  },
] as const

export default function Mas(){
  return (
    <div className="min-h-screen bg-bg p-4 pb-24 mx-auto max-w-lg lg:max-w-3xl space-y-5">
      <div>
        <h1 className="text-section">Menú</h1>
        <p className="text-aux text-textMuted">Todo lo secundario, en un solo lugar</p>
      </div>

      {GROUPS.map((g)=>(
        <section key={g.title}>
          <h2 className="text-aux font-medium tracking-wide mb-2">{g.title.toUpperCase()}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {g.items.map(({to,label,Icon})=>(
              <Link
                key={to}
                to={to}
                aria-label={label}
                className="group rounded-xl bg-surface border border-border p-3 flex flex-col items-center justify-center text-center gap-2 min-h-[100px]
                           hover:border-info/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info
                           active:scale-[0.98] transition"
              >
                <Icon size={32} strokeWidth={1.75} className="text-textMain group-hover:text-info transition" aria-hidden />
                <span className="text-aux font-medium leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
