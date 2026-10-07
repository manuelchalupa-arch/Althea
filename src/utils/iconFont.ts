// Detecta si la fuente Material Symbols (que llega por CDN de Google Fonts)
// quedo disponible.
//
// IMPORTANTE: document.fonts.check() NO sirve para esto. Devuelve true si
// CUALQUIER fuente puede pintar ese texto, y como siempre hay una fuente de
// respaldo, devuelve true aunque Material Symbols no exista. Se verifico
// bloqueando el CDN: check() seguia diciendo true.
//
// La API correcta es document.fonts.load(), que resuelve con las FontFace
// realmente cargadas para esa familia. Si la lista viene vacia, no hay fuente.
//
// Si la fuente NO esta, las ligaduras dejan de ser glifos y el navegador pinta
// la palabra inglesa: "favorite", "schedule", "local_fire_department"...
// Eso es inaceptable en una app cuyo caso de uso principal es funcionar sin
// red. Este modulo marca el estado en <html data-ms-icons> y el CSS se
// encarga de que el literal NUNCA sea visible.
//
// Politica: fail-safe. El atributo no existe hasta que se confirma, y el CSS
// usa :not([data-ms-icons='ready']) para que el estado inicial sea "oculto".

const FAMILY = 'Material Symbols Outlined'

/**
 * true si hay al menos una FontFace de Material Symbols efectivamente cargada.
 * Resuelve en false ante cualquier error: preferimos ocultar de mas que exponer
 * el literal.
 */
export function iconFontReady(): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) {
    return Promise.resolve(false)
  }
  return document.fonts
    .load(`18px "${FAMILY}"`)
    .then((faces) => Array.isArray(faces) && faces.length > 0)
    .catch(() => false)
}

function set(state: 'ready' | 'missing') {
  try {
    document.documentElement.setAttribute('data-ms-icons', state)
  } catch {
    /* noop */
  }
}

let started = false

/**
 * Vigila la carga de la fuente y mantiene el atributo actualizado.
 * Idempotente.
 */
export function ensureIconFont(): void {
  if (typeof document === 'undefined' || started) {return}
  started = true

  // Estado inicial: oculto. Antes de confirmar nada, no se muestra el literal.
  set('missing')

  const check = () => {
    iconFontReady().then((ok) => set(ok ? 'ready' : 'missing'))
  }

  try {
    // La fuente puede llegar despues del primer render.
    document.fonts?.ready?.then(check).catch(() => {})
    document.fonts?.addEventListener?.('loadingdone', check)
    document.fonts?.addEventListener?.('loadingerror', check)
  } catch {
    /* noop */
  }

  // Respaldo: una comprobacion tardia por si ready ya habia resuelto antes.
  setTimeout(check, 2500)
}