import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReadableStream } from 'node:stream/web'
import { fetchWithRetry } from '../apiUtils'
import { streamChat } from './chatService'

vi.mock('../apiUtils', () => ({ fetchWithRetry: vi.fn() }))
vi.mock('./groqUsage', () => ({
  canMakeRequest: () => ({ ok: true }),
  recordRequest: vi.fn(),
}))

const mockFetch = vi.mocked(fetchWithRetry)

function sseResponse(chunks: string[], contentType = 'text/event-stream') {
  return {
    ok: true,
    headers: { get: () => contentType },
    body: new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        for (const c of chunks) { controller.enqueue(enc.encode(c)) }
        controller.close()
      },
    }),
  } as unknown as Response
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => payload,
  } as unknown as Response
}

function collectors() {
  const tokens: string[] = []
  return {
    tokens,
    callbacks: {
      onToken: (t: string) => { tokens.push(t) },
      onDone: vi.fn(),
      onError: vi.fn(),
    },
  }
}

describe('streamChat', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('ensambla SSE partido en trozos y acepta "data:" sin espacio', async () => {
    const sse =
      'data:{"choices":[{"delta":{"content":"Hola"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n' +
      'data: [DONE]\n\n'
    // Cortes arbitrarios: una línea SSE queda partida en dos chunks.
    mockFetch.mockResolvedValue(sseResponse([sse.slice(0, 18), sse.slice(18, 40), sse.slice(40)]))

    const { tokens, callbacks } = collectors()
    await streamChat([{ role: 'user', content: 'hola' }], callbacks)

    expect(callbacks.onError).not.toHaveBeenCalled()
    expect(tokens.join('')).toBe('Hola mundo')
    expect(callbacks.onDone).toHaveBeenCalledWith('Hola mundo')
  })

  it('si el proxy responde JSON completo lo entrega como respuesta', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'Respuesta completa' } }],
    }))

    const { callbacks } = collectors()
    await streamChat([{ role: 'user', content: 'hola' }], callbacks)

    expect(callbacks.onDone).toHaveBeenCalledWith('Respuesta completa')
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('sin texto útil llama onError en vez de guardar una respuesta vacía', async () => {
    mockFetch.mockResolvedValue(sseResponse(['data: [DONE]\n\n']))

    const { callbacks } = collectors()
    await streamChat([{ role: 'user', content: 'hola' }], callbacks)

    expect(callbacks.onError).toHaveBeenCalled()
    expect(callbacks.onDone).not.toHaveBeenCalled()
  })

  it('JSON sin contenido también cae en onError', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ choices: [{ message: { content: '  ' } }] }))

    const { callbacks } = collectors()
    await streamChat([{ role: 'user', content: 'hola' }], callbacks)

    expect(callbacks.onError).toHaveBeenCalled()
    expect(callbacks.onDone).not.toHaveBeenCalled()
  })
})
