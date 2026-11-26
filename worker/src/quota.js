/**
 * ALTHEA — Presupuesto diario de neuronas de la cuota gratuita.
 *
 * Cloudflare Workers AI (plan Free) regala 10.000 neuronas/día y reinicia a
 * las 00:00 UTC. @cf/google/gemma-4-26b-a4b-it consume 9.091 neuronas por
 * millón de tokens de entrada y 27.273 por millón de salida. Reservamos una
 * estimación conservadora ANTES de llamar al modelo para que un usuario no
 * pueda agotar la cuota de todos. El contador vive en KV con clave UTC.
 */

export const DEFAULT_DAILY_NEURON_BUDGET = 9000

const INPUT_NEURONS_PER_TOKEN = 9091 / 1_000_000
const OUTPUT_NEURONS_PER_TOKEN = 27273 / 1_000_000

/** Caracteres por token en español: 3 es conservador (el modelo da ~4). */
export function estimateNeurons(messages, maxCompletionTokens) {
  const chars = messages.reduce((sum, m) => sum + m.content.length, 0)
  const inputTokens = Math.ceil(chars / 3)
  return Math.ceil(inputTokens * INPUT_NEURONS_PER_TOKEN + maxCompletionTokens * OUTPUT_NEURONS_PER_TOKEN)
}

export function utcDayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10)
}

export function secondsUntilUtcMidnight(nowMs = Date.now()) {
  const next = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1,
  )
  return Math.max(1, Math.ceil((next - nowMs) / 1000))
}

/**
 * Reserva `cost` neuronas del presupuesto del día.
 *
 * Orden de capas: Durable Object (atómico, entre isolates) → KV (eventual,
 * best-effort) → fail-open marcado `degraded`. El resultado indica qué capa
 * se usó en `mode`; sólo `durable-object` es un techo real.
 */
export async function reserveDailyNeurons(env, cost, nowMs = Date.now()) {
  const configured = Number(env && env.AI_DAILY_NEURON_BUDGET)
  const budget = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_NEURON_BUDGET
  const resetSeconds = secondsUntilUtcMidnight(nowMs)
  const base = { limit: budget, resetSeconds, degraded: false, mode: 'durable-object' }

  const viaDo = await reserveViaDurableObject(env, cost, budget, utcDayKey(nowMs))
  if (viaDo) return { ...base, ...viaDo }

  const kv = env && env.RATE_LIMIT
  if (!kv || typeof kv.get !== 'function') {
    return { ...base, ok: true, remaining: budget, degraded: true, mode: 'unavailable' }
  }

  const key = `ai:neurons:${utcDayKey(nowMs)}`
  try {
    const raw = await kv.get(key)
    const used = Number.parseInt(raw === null ? '0' : raw, 10) || 0
    if (used + cost > budget) {
      return { ...base, ok: false, remaining: Math.max(0, budget - used), degraded: true, mode: 'kv' }
    }
    await kv.put(key, String(used + cost), { expirationTtl: 60 * 60 * 26 })
    return { ...base, ok: true, remaining: Math.max(0, budget - used - cost), degraded: true, mode: 'kv' }
  } catch {
    return { ...base, ok: true, remaining: budget, degraded: true, mode: 'unavailable' }
  }
}

/** Devuelve `null` si no hay DO o falla, para degradar a la capa siguiente. */
async function reserveViaDurableObject(env, cost, budget, day) {
  const namespace = env && env.RATE_LIMITER
  if (!namespace || typeof namespace.getByName !== 'function') return null
  try {
    const stub = namespace.getByName(`budget|${day}`)
    const res = await stub.fetch('https://rate-limit.internal/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, cost, budget }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data.allowed !== 'boolean' || !Number.isFinite(data.remaining)) return null
    return { ok: data.allowed, remaining: data.remaining }
  } catch {
    return null
  }
}
