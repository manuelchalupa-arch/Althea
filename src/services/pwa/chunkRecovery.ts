/**
 * Recuperación de módulos diferidos tras un despliegue.
 *
 * Una pestaña abierta antes de un deploy puede conservar referencias a chunks
 * con hash de la versión anterior. Vite emite vite:preloadError en ese caso.
 * Se recarga una sola vez por ventana de 30 s; si vuelve a fallar, el error
 * queda visible para el ErrorBoundary y no se entra en un bucle de recargas.
 */
const RECOVERY_KEY = 'althea:dynamic-import-recovery'
const RECOVERY_WINDOW_MS = 30_000

type RecoveryWindow = Pick<Window, 'addEventListener' | 'location' | 'sessionStorage'>

export function installDynamicImportRecovery(target: RecoveryWindow): void {
  target.addEventListener('vite:preloadError', (event: Event) => {
    let storage: Storage
    try {
      storage = target.sessionStorage
    } catch {
      // Si el navegador bloquea el almacenamiento de sesión, no recargar:
      // es preferible conservar el ErrorBoundary a arriesgar un bucle infinito.
      return
    }

    const now = Date.now()
    let previousAttempt = 0
    try {
      previousAttempt = Number(storage.getItem(RECOVERY_KEY)) || 0
    } catch {
      return
    }

    if (previousAttempt > 0 && now - previousAttempt < RECOVERY_WINDOW_MS) {
      // Segunda falla consecutiva: dejar que React la muestre normalmente.
      return
    }

    try {
      storage.setItem(RECOVERY_KEY, String(now))
    } catch {
      return
    }

    event.preventDefault()
    target.location.reload()
  })
}
