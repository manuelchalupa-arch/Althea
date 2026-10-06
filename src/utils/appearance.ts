// Apariencia global: tema + tamaño de texto. Sin dependencias (evita ciclos App<->pages).
//
// Tema: 'system' sigue la preferencia del sistema operativo; 'light' y 'dark'
// sonelecciones explicitas. El valor persistido es la PREFERENCIA, y la clase
// .dark del <html> se deriva de ella.
export type Theme = 'system' | 'dark' | 'light'
export type TextScale = 's' | 'm' | 'l'
export type ResolvedTheme = 'dark' | 'light'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Devuelve el tema efectivo que se aplica, resolviendo 'system'. */
export function resolvedTheme(theme: Theme = getTheme()): ResolvedTheme {
  if (theme !== 'system') { return theme }
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem('althea:theme') as Theme | null
    return v === 'system' || v === 'dark' || v === 'light' ? v : 'light'
  } catch {
    return 'light'
  }
}

export function getTextScale(): TextScale {
  try {
    const v = localStorage.getItem('althea:textscale') as TextScale | null
    return v === 's' || v === 'm' || v === 'l' ? v : 'm'
  } catch {
    return 'm'
  }
}

function paint(theme: Theme, scale: TextScale): void {
  const resolved = resolvedTheme(theme)
  const root = document.documentElement
  // Identidad por defecto: mármol claro. La clase .dark activa el modo oscuro cálido.
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  // La preferencia queda disponible en CSS/data para inspeccion y tests.
  root.dataset.theme = theme
  root.dataset.themeResolved = resolved
  root.dataset.textscale = scale
}

/** Si el tema es 'system', sigue los cambios del SO en vivo. */
function watchSystem(): void {
  try {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = () => {
      if (getTheme() === 'system') { paint('system', getTextScale()) }
    }
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(onChange)
    }
  } catch {
    /* noop */
  }
}

export function applyAppearance(theme: Theme = getTheme(), scale: TextScale = getTextScale()) {
  try {
    paint(theme, scale)
    if (theme === 'system') { watchSystem() }
  } catch {
    /* noop */
  }
}

export function setAppearance(theme: Theme, scale: TextScale) {
  try {
    localStorage.setItem('althea:theme', theme)
    localStorage.setItem('althea:textscale', scale)
  } catch {
    /* noop */
  }
  applyAppearance(theme, scale)
}