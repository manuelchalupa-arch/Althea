import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

const LazySearchDialog = lazy(() => import('./GlobalSearchDialog'))

/** Botón ligero del header: descarga el catálogo de búsqueda solo al abrirlo. */
export default function GlobalSearchLauncher() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (wasOpenRef.current && !open) { triggerRef.current?.focus() }
    wasOpenRef.current = open
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
      if (event.key === 'Escape') { setOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar ejercicios, alimentos y rutinas"
        title="Buscar en Althea (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex items-center justify-center w-11 h-11 rounded-full border border-outline-variant/60 bg-surface text-on-surface-variant hover:border-primary/50 hover:text-on-surface transition-colors shrink-0"
      >
        <Search size={19} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={null}>
          <LazySearchDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
