/**
 * Acento → apartado de cada ruta (vocabulario propio, distinto del de temple:
 * `TempleSection` son los signos del sello; esto es el color).
 * El shell y el menú lo publican como `data-section`; los tokens de color lo
 * resuelven. Sin entrada, rojo de la app.
 */

export const ACCENT_SECTION_BY_PATH: Record<string, string> = {
  '/entrenar': 'entrenar',
  '/biblioteca': 'biblioteca',
  '/rutina': 'rutina',
  '/rutinas': 'rutina',
  '/actividad': 'actividad',
  '/progreso': 'progreso',
  '/progresos': 'progreso',
  '/calendario': 'calendario',
  '/recuperacion': 'calendario',
  '/nutricion': 'nutricion',
  '/coach': 'coach',
  '/perfil': 'perfil',
}

export function accentSectionForPath(pathname: string): string {
  return ACCENT_SECTION_BY_PATH[pathname] ?? 'app'
}
