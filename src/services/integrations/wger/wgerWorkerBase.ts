/**
 * Base del proxy WGER en el Cloudflare Worker.
 *
 * Contexto: el frontend NUNCA llama a `wger.de` para operaciones autenticadas;
 * esas pasan por el Worker (`worker/src/index.js`), que expone `/api/wger/*`
 * (token, user, refresh, proxy). Antes estas llamadas usaban la ruta RELATIVA
 * `/api/wger`, que asumía —sin que exista— un rewrite de Firebase Hosting hacia
 * el Worker. `firebase.json` sólo reescribe `**` → `/index.html`, así que esa
 * ruta terminaba sirviendo el HTML de la app.
 *
 * Solución: construir la URL absoluta a partir de la URL pública del Worker
 * (`VITE_GROQ_PROXY_URL`), la misma que ya usa el Coach. El Worker atiende
 * Groq y WGER en el mismo host.
 *
 * Las lecturas PÚBLICAS de WGER (catálogo) siguen yendo directo a `wger.de` y
 * no dependen de esto.
 */

/**
 * Deriva la base del proxy WGER desde la URL del Worker.
 * Devuelve `null` si no hay URL configurada (para NO enviar la petición a una
 * ruta equivocada y fallar de forma comprensible).
 */
export function getWgerWorkerBase(proxyBase: string | null | undefined): string | null {
  const base = String(proxyBase ?? '')
    .trim()
    .replace(/\/+$/, '')
  if (!base) {
    return null
  }
  return `${base}/api/wger`
}

/** Lee la URL pública del Worker configurada en build y deriva la base WGER. */
export function configuredWgerWorkerBase(): string | null {
  let proxy = ''
  try {
    proxy = import.meta.env.VITE_GROQ_PROXY_URL || ''
  } catch {
    proxy = ''
  }
  return getWgerWorkerBase(proxy)
}
