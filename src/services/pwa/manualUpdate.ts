/**
 * Única vía de actualización de la app: activa el Service Worker en espera
 * (registerType 'prompt') y recarga. Los datos viven en IndexedDB y las
 * preferencias/borradores simples en localStorage, así que sobreviven.
 */
export async function applyUpdate(reload: () => void = () => window.location.reload()): Promise<void> {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await reg.update().catch(() => {})
        const waiting = reg.waiting
        if (waiting) {
          await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
            waiting.postMessage({ type: 'SKIP_WAITING' })
            setTimeout(resolve, 3000)
          })
        }
      }
    } catch { /* sin SW o sin red: recargar igual sirve lo cacheado */ }
  }
  reload()
}

/** Confirmación única para el botón ⟳: evita perder un formulario abierto. */
export function confirmAndUpdate(): void {
  if (!window.confirm('¿Actualizar Althea? La app se reiniciará. Tus datos están seguros.')) { return }
  void applyUpdate()
}
