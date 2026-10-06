import { useEffect, useState } from 'react'
import { getTheme, getTextScale, setAppearance, resolvedTheme, type Theme } from '@/utils/appearance'
import { IconSun, IconMoon } from './FitnessIcons'

const ORDEN: Theme[] = ['light', 'dark', 'system']

const ETIQUETA: Record<Theme, string> = {
  light: 'Modo claro',
  dark: 'Modo oscuro',
  system: 'Modo del sistema',
}

/**
 * Alterna claro -> oscuro -> del sistema. Antes forzaba la escala de texto a
 * 'm' en cada cambio, borrando la preferencia del usuario: ahora la conserva.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme)
  // Necesario para que el icono refleje el tema RESUELTO cuando es 'system'.
  const [resuelto, setResuelto] = useState(() => resolvedTheme(getTheme()))

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) { return }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResuelto(resolvedTheme(getTheme()))
    if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', onChange) }
    else if (typeof mq.addListener === 'function') {mq.addListener(onChange)}
    return () => {
      if (typeof mq.removeEventListener === 'function') { mq.removeEventListener('change', onChange) }
      else if (typeof mq.removeListener === 'function') {mq.removeListener(onChange)}
    }
  }, [])

  const toggle = () => {
    const next = ORDEN[(ORDEN.indexOf(theme) + 1) % ORDEN.length]
    setTheme(next)
    setResuelto(resolvedTheme(next))
    // Conserva la escala de texto elegida por el usuario.
    setAppearance(next, getTextScale())
  }

  const accion =
    theme === 'system'
      ? ETIQUETA[theme]
      : `${resuelto === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} (actual: ${ETIQUETA[theme]})`

  return (
    <button
      onClick={toggle}
      className="theme-toggle-btn group flex items-center justify-center w-11 h-11 rounded-lg hover:bg-surface-container-high/50 transition-colors"
      aria-label={accion}
      title={accion}
      type="button"
    >
      {resuelto === 'dark' ? (
        <IconSun className="w-5 h-5 text-secondary" aria-hidden="true" />
      ) : (
        <IconMoon className="w-5 h-5 text-primary" aria-hidden="true" />
      )}
    </button>
  )
}