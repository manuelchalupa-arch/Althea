// Tests UNITARIOS (sin red) del helper HTTP compartido de los subclientes WGER.
// Corren en CI: `fetch` se reemplaza por un stub, no hay llamada a wger.de.
//
// Cubren el contrato que se acaba de consolidar en wgerHttp.ts
// (Accept: application/json · error `Wger {status} {url}` · signal propagado ·
// SIN Authorization y SIN timeout), para que la fusión de las 4 copias no
// cambie comportamiento.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { getJSON, WGER_API_BASE } from './wgerHttp'

type FetchArgs = [string, RequestInit | undefined]

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: FetchArgs[] = []
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init])
    return impl(url, init)
  })
  vi.stubGlobal('fetch', spy)
  return { spy, calls }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('wgerHttp · getJSON', () => {
  it('usa la URL recibida y solo envía Accept: application/json', async () => {
    const { calls } = stubFetch(async () => jsonResponse({ results: [] }))

    await getJSON<{ results: unknown[] }>(`${WGER_API_BASE}/exercise/?format=json`)

    expect(calls).toHaveLength(1)
    const [url, init] = calls[0]
    expect(url).toBe(`${WGER_API_BASE}/exercise/?format=json`)
    const headers = new Headers(init?.headers)
    expect(headers.get('Accept')).toBe('application/json')
    // Lectura pública: jamás inyecta token por este helper.
    expect(headers.get('Authorization')).toBeNull()
    expect(init?.method ?? 'GET').toBe('GET')
  })

  it('retorna el JSON parseado cuando la respuesta es OK', async () => {
    stubFetch(async () => jsonResponse({ count: 3, results: [{ id: 1 }] }))

    const data = await getJSON<{ count: number; results: unknown[] }>(`${WGER_API_BASE}/routine/`)

    expect(data.count).toBe(3)
    expect(data.results).toHaveLength(1)
  })

  it('propaga el AbortSignal recibido a fetch', async () => {
    const { calls } = stubFetch(async () => jsonResponse({}))
    const controller = new AbortController()

    await getJSON(`${WGER_API_BASE}/measurement/`, controller.signal)

    expect(calls[0][1]?.signal).toBe(controller.signal)
  })

  it('rechaza con `Wger {status} {url}` ante una respuesta no-OK', async () => {
    stubFetch(async () => new Response('nope', { status: 404 }))

    await expect(getJSON(`${WGER_API_BASE}/exerciseinfo/1/`)).rejects.toThrow(
      `Wger 404 ${WGER_API_BASE}/exerciseinfo/1/`,
    )
  })

  it('un 401 sigue siendo error: no se convierte en resultado aprobado', async () => {
    stubFetch(async () => new Response('unauthorized', { status: 401 }))

    await expect(getJSON(`${WGER_API_BASE}/routine/`)).rejects.toThrow(/^Wger 401 /)
  })

  it('un error de red rechaza (no se silencia)', async () => {
    stubFetch(async () => { throw new TypeError('fetch failed') })

    await expect(getJSON(`${WGER_API_BASE}/exercise/`)).rejects.toBeInstanceOf(TypeError)
  })
})
