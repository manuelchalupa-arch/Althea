import { useNavigate } from 'react-router-dom'
import SemanticIcon from '@/components/ui/SemanticIcon'
import ActivityWorkspace from '@/components/activity/ActivityWorkspace'

export default function Actividad() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-transparent pb-24 sm:px-5 lg:px-8 xl:px-10 2xl:px-12 w-full mx-auto pt-2 md:py-6 space-y-5">
      <header className="flex items-center gap-4">
        <button onClick={() => navigate('/')} className="tpress w-11 h-11 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent" aria-label="Volver">
          <SemanticIcon name="chevron_left" size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="font-headline-lg text-lg text-on-surface font-semibold">Actividad</h1>
          <p className="font-body-md text-xs text-on-surface-variant truncate">Registrá tu sesión deportiva</p>
        </div>
      </header>
      <ActivityWorkspace />
    </div>
  )
}
