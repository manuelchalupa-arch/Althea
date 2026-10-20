import { useCallback, useEffect, useRef, useState } from 'react'

const SPLASH_VIDEO_URL = '/videos/althea-splash-mobile.mp4'
export const MOBILE_SPLASH_BREAKPOINT = 768
const SAFETY_TIMEOUT_MS = 15000
const MAX_BUFFER_MS = 1000

/**
 * Marca de consumo por documento: garantiza una única reproducción del splash
 * por carga de página. Vive en `window`, por lo que sobrevive a remontajes de
 * React (StrictMode, HMR, resets del árbol) y desaparece sola con la recarga
 * del documento. No usa storage: una recarga completa debe habilitar un
 * nuevo splash. Solo se escribe al INICIAR efectivamente el primer splash
 * móvil; nunca se borra ni se revierte.
 */
const SPLASH_SHOWN_THIS_DOCUMENT = '__ALTHEA_SPLASH_SHOWN_THIS_DOCUMENT__'

export function isMobileSplashConsumedThisDocument(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>)[SPLASH_SHOWN_THIS_DOCUMENT] === true
  )
}

function consumeMobileSplashThisDocument(): void {
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>)[SPLASH_SHOWN_THIS_DOCUMENT] = true
  }
}

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedRef = useRef(false)
  const startedRef = useRef(false)
  const playStartedRef = useRef(false)
  const [visible, setVisible] = useState(false)

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current)
      safetyTimeoutRef.current = null
    }
  }, [])

  const stopVideo = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.pause()
    }
  }, [])

  // Finalización visual: oculta el splash y avisa al padre UNA sola vez.
  const finishSplash = useCallback(() => {
    if (finishedRef.current) {
      return
    }
    finishedRef.current = true
    setVisible(false)
    onComplete()
  }, [onComplete])

  // Detección de viewport: solo móvil muestra el splash, una única vez por
  // documento. La visibilidad es unidireccional: finalizado → visible jamás.
  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < MOBILE_SPLASH_BREAKPOINT
      if (!mobile) {
        setVisible(false)
        clearTimers()
        stopVideo()
        finishSplash()
        return
      }
      if (isMobileSplashConsumedThisDocument() || finishedRef.current) {
        return
      }
      if (!startedRef.current) {
        startedRef.current = true
        consumeMobileSplashThisDocument()
        setVisible(true)
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
    }
  }, [clearTimers, stopVideo, finishSplash])

  // Reproducción: corre SOLO cuando el overlay ya está en el DOM,
  // por eso depende de `visible` y no de banderas previas al render.
  useEffect(() => {
    if (!visible) {
      return
    }
    const video = videoRef.current
    if (!video) {
      return
    }

    let released = false
    const release = () => {
      if (released) {
        return
      }
      released = true
      clearTimers()
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('canplay', handleCanPlay)
    }

    const handleEnded = () => {
      release()
      finishSplash()
    }
    const handleError = () => {
      release()
      finishSplash()
    }
    const scheduleFromDuration = () => {
      const durationSec = Number(video.duration)
      const videoDurationMs = Math.ceil((Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 8) * 1000)
      const timeoutMs = Math.min(videoDurationMs + MAX_BUFFER_MS, SAFETY_TIMEOUT_MS)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        release()
        finishSplash()
      }, timeoutMs)
    }
    const handleLoadedMetadata = () => {
      scheduleFromDuration()
    }
    const handleCanPlay = () => {
      video.removeEventListener('canplay', handleCanPlay)
      // Protección StrictMode: la segunda ejecución del efecto no repite play().
      if (playStartedRef.current) {
        return
      }
      playStartedRef.current = true
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          release()
          finishSplash()
        })
      }
    }

    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleError)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('canplay', handleCanPlay)

    // Si los metadatos ya estaban disponibles, no esperar el evento.
    if (video.readyState >= 1) {
      scheduleFromDuration()
    }

    safetyTimeoutRef.current = setTimeout(() => {
      release()
      finishSplash()
    }, SAFETY_TIMEOUT_MS)

    video.load()

    // Limpieza de recursos al desmontar: NO inicia transiciones.
    return () => {
      release()
    }
  }, [visible, clearTimers, finishSplash])

  if (!visible) {
    return null
  }

  return (
    <div
      data-testid="mobile-splash"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        data-testid="mobile-splash-video"
        src={SPLASH_VIDEO_URL}
        muted
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
        aria-hidden="true"
      />
    </div>
  )
}
