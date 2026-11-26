import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { User } from '@/services/firebase/auth'
import { currentUser } from '@/services/firebase/auth'
import {
  getAiAuthHeaders,
  aiLimitMessage,
  isLimitError,
  stripLimitPrefix,
} from './aiAuth'

vi.mock('@/services/firebase/auth', () => ({
  currentUser: vi.fn(() => null),
}))

const mockedCurrentUser = vi.mocked(currentUser)

/** Sesión simulada sólo como base de las pruebas: cada caso define su token. */
function userWithClaims(claims: Record<string, unknown>, token = 'id-token-stg') {
  return {
    getIdTokenResult: vi.fn(async () => ({ token, claims })),
  } as unknown as User
}

function failingUser() {
  return {
    getIdTokenResult: vi.fn(async () => {
      throw new Error('network error')
    }),
  } as unknown as User
}

describe('aiAuth — la IA nunca viaja sin sesión válida', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'althea-stg')
    mockedCurrentUser.mockReset()
    mockedCurrentUser.mockReturnValue(null)
    vi.spyOn(globalThis, 'fetch').mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sin usuario Firebase no se emite ninguna cabecera: se pide iniciar sesión', async () => {
    mockedCurrentUser.mockReturnValue(null)

    await expect(getAiAuthHeaders()).rejects.toThrow(/Iniciá sesión/)
  })

  it('con sesión de althea-stg devuelve Authorization: Bearer <token>', async () => {
    mockedCurrentUser.mockReturnValue(userWithClaims({ aud: 'althea-stg' }))

    await expect(getAiAuthHeaders()).resolves.toEqual({
      Authorization: 'Bearer id-token-stg',
    })
  })

  it('rechaza un token de otro proyecto antes de llamar al Worker', async () => {
    mockedCurrentUser.mockReturnValue(userWithClaims({ aud: 'althea-4b1d0' }))

    await expect(getAiAuthHeaders()).rejects.toThrow(/otro proyecto Firebase/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('informa cuando Firebase no puede obtener el token y no continúa', async () => {
    mockedCurrentUser.mockReturnValue(failingUser())

    await expect(getAiAuthHeaders()).rejects.toThrow(/no pudo validar tu sesión/)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('un 401 del Worker indica que la sesión fue rechazada', () => {
    const message = aiLimitMessage(401) || ''

    expect(message).not.toBe('')
    expect(isLimitError(message)).toBe(true)
    expect(stripLimitPrefix(message)).toMatch(/rechazó el token de sesión/)
  })
})
