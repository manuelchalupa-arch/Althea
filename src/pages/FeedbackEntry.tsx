import { useFeedbackActor } from '@/hooks/useFeedbackActor'
import Feedback from './Feedback'
import AdminFeedback from './AdminFeedback'

/**
 * Gate de las rutas de feedback (005): el servidor decide el rol a través de
 * useFeedbackActor; con rol admin se muestra la bandeja y con cuenta normal el
 * formulario de siempre. `adminOnly` fuerza la bandeja (pantalla "No autorizado"
 * para el resto, en lugar de esconderla).
 */
export default function FeedbackEntry({ adminOnly = false }: { adminOnly?: boolean }) {
  const { actor, loading } = useFeedbackActor()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto" />
          <p className="text-on-surface-variant text-sm mt-3">Cargando…</p>
        </div>
      </div>
    )
  }

  if (adminOnly || actor?.isAdmin) {
    return <AdminFeedback />
  }
  return <Feedback />
}
