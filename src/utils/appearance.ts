// Apariencia global: tema + tamaño de texto. Sin dependencias (evita ciclos App<->pages).
export type Theme = 'dark' | 'light'
export type TextScale = 's' | 'm' | 'l'

export function getTheme(): Theme {
  try { return (localStorage.getItem('althea:theme') as Theme) || 'light' } catch { return 'light' }
}
export function getTextScale(): TextScale {
  try { return (localStorage.getItem('althea:textscale') as TextScale) || 'm' } catch { return 'm' }
}
export function applyAppearance(theme: Theme = getTheme(), scale: TextScale = getTextScale()) {
  try {
    // Identidad por defecto: mármol claro. La clase .dark activa el modo oscuro cálido.
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.dataset.textscale = scale
  } catch { /* noop */ }
}
export function setAppearance(theme: Theme, scale: TextScale) {
  try {
    localStorage.setItem('althea:theme', theme)
    localStorage.setItem('althea:textscale', scale)
  } catch { /* noop */ }
  applyAppearance(theme, scale)
}