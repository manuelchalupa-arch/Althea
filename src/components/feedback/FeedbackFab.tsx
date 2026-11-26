import { Link, useLocation } from 'react-router-dom'

/**
 * Único acceso flotante a Feedback.
 * Solo aparece en Inicio y se oculta mediante html[data-chat-open] mientras
 * el panel del Coach está abierto.
 */
export default function FeedbackFab() {
  const { pathname } = useLocation()

  if (pathname !== '/') { return null }

  return (
    <Link
      to="/feedback"
      aria-label="Abrir Feedback"
      title="Feedback"
      className="fab-feedback fab-feedback-stack fixed right-4 z-50 flex min-w-[44px] min-h-[44px] w-11 h-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface shadow-al-md transition-all duration-200 hover:scale-105 hover:bg-surface-container-high md:right-24"
    >
      <span aria-hidden="true" className="font-headline text-2xl leading-none font-semibold text-primary">F</span>
      <span className="sr-only">Feedback</span>
    </Link>
  )
}
