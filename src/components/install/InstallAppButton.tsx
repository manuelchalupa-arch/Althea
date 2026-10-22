import { useEffect, useRef, useState } from 'react'
import { Download, Share } from 'lucide-react'
import { getInstallPrompt, clearInstallPrompt, isAppInstalled } from '@/services/pwa/installPrompt'

function isStandaloneMode(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) { return true } // iOS Safari en la pantalla de inicio
  if (typeof window.matchMedia !== 'function') { return false }
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
}

function isIOSDevice(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function InstallHelp({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  const ios = isIOSDevice()
  const steps = ios ? [
    'Tocá el botón Compartir (el ícono con la flecha hacia arriba).',
    'Buscá y elegí «Agregar a pantalla de inicio».',
    'Tocá «Agregar» en la esquina superior derecha.',
  ] : [
    'Tocá el menú ⋮ (tres puntos) del navegador.',
    'Elegí «Instalar aplicación» o «Agregar a pantalla de inicio».',
    'Confirmá la instalación: el ícono queda en tu pantalla.',
  ]

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Cómo instalar la aplicación"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') { onClose() } }}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-secondary/40 bg-surface p-6 text-center shadow-2xl"
      >
        <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
          {ios ? <Share size={22} className="text-on-primary" /> : <Download size={22} className="text-on-primary" />}
        </div>
        <h2 className="font-headline-md text-lg text-on-surface font-semibold mt-3">Instalar ALTHEA</h2>
        <p className="font-body-md text-sm text-on-surface-variant mt-1">
          {ios
            ? 'iOS no puede instalar solo: son tres pasos con el botón Compartir.'
            : 'Agregá el ícono a tu pantalla y usá la app sin navegador.'}
        </p>

        <ol className="mt-4 text-left space-y-2.5">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-2.5 items-start">
              <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/40 text-primary font-label-caps text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <span className="font-body-sm text-[13px] text-on-surface">{s}</span>
            </li>
          ))}
        </ol>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-5 w-full min-h-[48px] rounded-xl bg-gradient-to-r from-primary to-secondary text-on-primary font-label-caps text-[11px] uppercase font-bold tracking-widest"
        >
          Entendido
        </button>
      </section>
    </div>
  )
}

export default function InstallAppButton() {
  const [installed, setInstalled] = useState(() => isAppInstalled() || isStandaloneMode())
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  if (installed) { return null }

  const handleInstall = async () => {
    const promptEvent = getInstallPrompt()
    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const { outcome } = await promptEvent.userChoice
        clearInstallPrompt()
        if (outcome === 'accepted') { setInstalled(true) }
      } catch {
        setShowHelp(true)
      }
      return
    }
    setShowHelp(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { void handleInstall() }}
        aria-label="Instalar aplicación"
        className="ml-auto shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-gradient-to-r from-primary to-secondary text-on-primary font-label-caps text-[10px] uppercase font-bold tracking-widest shadow-md active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Download size={15} aria-hidden />
        Instalar app
      </button>
      {showHelp && <InstallHelp onClose={() => setShowHelp(false)} />}
    </>
  )
}
