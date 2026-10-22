// Captura beforeinstallprompt apenas arranca la app. El navegador lo dispara
// UNA sola vez (casi siempre al cargar, cuando el usuario todavía no llegó a
// Más): si nadie lo escucha se pierde y solo queda instalar a mano.
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installed = false

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
  })
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return installed ? null : deferred
}

export function isAppInstalled(): boolean {
  return installed
}

// Tras aceptar el prompt nativo (y en tests): limpia ambos flags.
export function clearInstallPrompt(): void {
  deferred = null
  installed = false
}
