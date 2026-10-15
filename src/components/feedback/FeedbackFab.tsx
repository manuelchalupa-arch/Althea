import { Link, useLocation } from 'react-router-dom'

// FAB de Feedback: reemplaza al acceso flotante del Coach (avatar + Link a
// /coach) manteniendo exactamente la misma posición: apilado sobre el FAB del
// chat en móvil (fab-feedback-stack) y a la izquierda de él en escritorio.
//
// Se oculta cuando el chat de Althea está abierto (ChatWidget publica
// data-chat-open en <html>): el panel del chat ocupa esa zona y el botón F no
// debe superponerse. Tampoco se muestra en las rutas de Feedback, donde sería
// redundante.

const HIDDEN_ON = ['/feedback', '/admin/feedback']

export default function FeedbackFab() {
  const { pathname } = useLocation()
  if (HIDDEN_ON.some((r) => pathname === r || pathname.startsWith(`${r}/`))) { return null }

  return (
    <Link
      to="/feedback"
      aria-label="Abrir Feedback"
      title="Feedback"
      className="fab-feedback fixed z-50 flex items-center justify-center rounded-full shadow-al-md transition-all duration-200 fab-feedback-stack right-4 w-12 h-12 bg-surface border border-outline-variant text-on-surface hover:scale-105 hover:bg-surface-container-high md:right-24"
    >
      <span aria-hidden="true" className="font-headline text-2xl leading-none font-semibold text-primary">F</span>
      <span className="sr-only">Feedback</span>
    </Link>
  )
}
