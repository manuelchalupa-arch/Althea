import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

/**
 * True en viewports mobile (<768px).
 *
 * En entornos sin `matchMedia` (jsdom en tests) devuelve `false` para no
 * alterar el DOM que verifican los tests existentes. En el navegador resuelve
 * de forma síncrona en el primer render, así que la presentación mobile no
 * parpadea.
 */
export function useIsMobile(): boolean {
  const get = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') { return false }
    return window.matchMedia(QUERY).matches
  }
  const [isMobile, setIsMobile] = useState<boolean>(get)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') { return }
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mq.matches)
    if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', onChange) }
    else if (typeof mq.addListener === 'function') { mq.addListener(onChange) }
    return () => {
      if (typeof mq.removeEventListener === 'function') { mq.removeEventListener('change', onChange) }
      else if (typeof mq.removeListener === 'function') { mq.removeListener(onChange) }
    }
  }, [])

  return isMobile
}

export default useIsMobile
