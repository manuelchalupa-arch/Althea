/**
 * ALTHEA — Concurrencia global de inferencias.
 *
 * El límite vive en un Durable Object para que valga entre todos los isolates
 * del edge, no sólo dentro de uno. Cada slot expira solo (TTL) para que una
 * petición que muera sin liberar no bloquee el límite para siempre.
 *
 * Si el DO no está disponible se degrada a memoria del isolate y se marca
 * `mode: 'memory-degraded'`: en ese modo NO hay garantía global.
 */

let memoryInFlight = 0

/** Sólo para tests. */
export function resetConcurrency() {
  memoryInFlight = 0
}

/** @returns {Promise<{ ok: boolean, id: string | null, mode: string }>} */
export async function acquireSlot(env, max, ttlMs) {
  const id = crypto.randomUUID()
  const namespace = env && env.RATE_LIMITER
  if (namespace && typeof namespace.getByName === 'function') {
    try {
      const stub = namespace.getByName('concurrency|all')
      const res = await stub.fetch('https://rate-limit.internal/concurrency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, max, ttlMs }),
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.allowed === 'boolean') {
          return { ok: data.allowed, id: data.allowed ? id : null, mode: 'durable-object' }
        }
      }
    } catch {
      // Se degrada abajo; nunca se propaga al cliente.
    }
  }

  if (memoryInFlight >= max) return { ok: false, id: null, mode: 'memory-degraded' }
  memoryInFlight += 1
  return { ok: true, id: null, mode: 'memory-degraded' }
}

export async function releaseSlot(env, slot) {
  if (!slot) return
  if (slot.id) {
    const namespace = env && env.RATE_LIMITER
    try {
      const stub = namespace.getByName('concurrency|all')
      await stub.fetch('https://rate-limit.internal/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slot.id }),
      })
    } catch {
      // El slot expira por TTL; no hay nada que recuperar aquí.
    }
    return
  }
  if (memoryInFlight > 0) memoryInFlight -= 1
}
