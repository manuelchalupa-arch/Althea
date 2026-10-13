// wgerHttp — helpers HTTP compartidos de los subclientes WGER (lectura pública).
//
// Consolidación justificada: `measurements/`, `nutrition/`, `stats/` y `training/`
// definían exactamente la misma copia de `getJSON` (mismo header Accept, mismo
// formato de error `Wger {status} {url}`, misma propagación de AbortSignal,
// SIN timeout). Al ser el contrato idéntico se extrae UNA sola definición.
//
// NO se mueve aquí el `getJSON` de `wgerClient.ts`: ese delega en
// `WgerClient.request`, que tiene timeout de 15 s, merge de headers, token
// Bearer, cuerpo de error truncado y `.status` en la excepción. Contratos
// DISTINTOS → se conserva separado a propósito.
//
// Se conserva también: métodos, endpoints, params y esquemas específicos de
// cada recurso en sus respectivos `client.ts`.

/** URL base de la API REST de Wger. */
export const WGER_API_BASE = 'https://wger.de/api/v2'

/**
 * GET JSON de solo lectura. Sin timeout (igual que las copias originales).
 * Propaga el `signal` del llamador tal cual para permitir cancelación.
 * Lanza `Error('Wger {status} {url}')` ante respuestas no-OK.
 */
export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) {throw new Error(`Wger ${res.status} ${url}`)}
  return res.json() as Promise<T>
}
