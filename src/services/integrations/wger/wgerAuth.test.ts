// Tests de autenticación WGER (contractuales).
// Verifica: login real/contract, expiración, refresh, logout, no exposición de credenciales.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/services/storage/db'
import {
  getWgerAuthState,
  isWgerAuthenticated,
  getWgerAuthStatus,
  checkWgerLinkStatus,
  authenticateWger,
  deauthenticateWger,
  resetWgerAuth,
  type WgerAuthState,
} from './wgerAuth'
import {
  getWgerLinkStatus,
  linkWgerAccount,
  unlinkWgerAccount,
} from './wgerServerAuth'

vi.mock('./wgerServerAuth', () => ({
  getWgerLinkStatus: vi.fn(),
  linkWgerAccount: vi.fn(),
  unlinkWgerAccount: vi.fn(),
}))

vi.mock('@/services/firebase/config', () => ({
  firebaseDb: vi.fn(() => ({})),
  isFirebaseConfigured: vi.fn(() => true),
}))

vi.mock('@/services/firebase/auth', () => ({
  currentUser: vi.fn(() => ({ uid: 'test-user-123' })),
}))

describe('WGER Auth — Estado inicial', () => {
  beforeEach(() => {
    resetWgerAuth()
  })

  it('estado inicial es public-only', () => {
    const state = getWgerAuthState()
    expect(state.status).toBe('public-only')
    expect(state.isAuthenticated).toBe(false)
    expect(state.canWrite).toBe(false)
    expect(state.isLinked).toBe(false)
    expect(state.wgerUsername).toBeUndefined()
  })

  it('isWgerAuthenticated retorna false inicialmente', () => {
    expect(isWgerAuthenticated()).toBe(false)
  })

  it('getWgerAuthStatus retorna public-only inicialmente', () => {
    expect(getWgerAuthStatus()).toBe('public-only')
  })
})

describe('WGER Auth — Login real/contract', () => {
  beforeEach(() => {
    resetWgerAuth()
    vi.clearAllMocks()
  })

  it('authenticateWger vincula cuenta y actualiza estado', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    })
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'testuser',
      linkedAt: new Date().toISOString(),
    })

    await authenticateWger('testuser', 'password123')

    expect(linkWgerAccount).toHaveBeenCalledWith({
      username: 'testuser',
      password: 'password123',
    })

    const state = getWgerAuthState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.isLinked).toBe(true)
    expect(state.canWrite).toBe(true)
    expect(state.status).toBe('authenticated')
    expect(state.wgerUsername).toBe('testuser')
  })

  it('authenticateWger lanza error si credenciales son inválidas', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: false,
      message: 'Las credenciales de WGER no son válidas.',
    })

    await expect(authenticateWger('wrong', 'wrong')).rejects.toThrow(
      'Las credenciales de WGER no son válidas.'
    )

    const state = getWgerAuthState()
    expect(state.isAuthenticated).toBe(false)
  })

  it('authenticateWger lanza error si no hay usuario Firebase', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: false,
      message: 'Debes iniciar sesión para vincular tu cuenta de WGER.',
    })

    await expect(authenticateWger('user', 'pass')).rejects.toThrow(
      'Debes iniciar sesión para vincular tu cuenta de WGER.'
    )
  })

  it('checkWgerLinkStatus actualiza estado desde el servidor', async () => {
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'linkeduser',
      linkedAt: new Date().toISOString(),
    })

    const state = await checkWgerLinkStatus()

    expect(state.isLinked).toBe(true)
    expect(state.isAuthenticated).toBe(true)
    expect(state.wgerUsername).toBe('linkeduser')
  })

  it('checkWgerLinkStatus retorna public-only si no está vinculado', async () => {
    vi.mocked(getWgerLinkStatus).mockResolvedValue({ isLinked: false })

    const state = await checkWgerLinkStatus()

    expect(state.isLinked).toBe(false)
    expect(state.isAuthenticated).toBe(false)
    expect(state.status).toBe('public-only')
  })
})

describe('WGER Auth — Expiración', () => {
  beforeEach(() => {
    resetWgerAuth()
    vi.clearAllMocks()
  })

  it('estado autenticado expira si el servidor desvincula', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    })
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'testuser',
    })
    await authenticateWger('testuser', 'pass')
    expect(isWgerAuthenticated()).toBe(true)

    vi.mocked(getWgerLinkStatus).mockResolvedValue({ isLinked: false })
    const state = await checkWgerLinkStatus()

    expect(state.isAuthenticated).toBe(false)
    expect(state.status).toBe('public-only')
  })

  it('resetWgerAuth limpia el estado completamente', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    })
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'testuser',
    })
    await authenticateWger('testuser', 'pass')
    expect(isWgerAuthenticated()).toBe(true)

    resetWgerAuth()

    const state = getWgerAuthState()
    expect(state).toEqual({
      status: 'public-only',
      isAuthenticated: false,
      canWrite: false,
      isLinked: false,
    })
  })
})

describe('WGER Auth — Refresh', () => {
  beforeEach(() => {
    resetWgerAuth()
    vi.clearAllMocks()
  })

  it('checkWgerLinkStatus puede refrescar el estado', async () => {
    // Estado inicial: no vinculado
    vi.mocked(getWgerLinkStatus).mockResolvedValue({ isLinked: false })
    let state = await checkWgerLinkStatus()
    expect(state.isAuthenticated).toBe(false)

    // Vincular
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'refreshed',
    })
    state = await checkWgerLinkStatus()
    expect(state.isAuthenticated).toBe(true)
    expect(state.wgerUsername).toBe('refreshed')
  })
})

describe('WGER Auth — Logout', () => {
  beforeEach(() => {
    resetWgerAuth()
    vi.clearAllMocks()
  })

  it('deauthenticateWger desvincula y limpia estado', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    })
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'testuser',
    })
    await authenticateWger('testuser', 'pass')
    expect(isWgerAuthenticated()).toBe(true)

    vi.mocked(unlinkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER desvinculada correctamente.',
    })
    await deauthenticateWger()

    expect(unlinkWgerAccount).toHaveBeenCalled()
    expect(isWgerAuthenticated()).toBe(false)
    expect(getWgerAuthStatus()).toBe('public-only')
  })

  it('deauthenticateWger lanza error si falla la desvinculación', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    })
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'testuser',
    })
    await authenticateWger('testuser', 'pass')

    vi.mocked(unlinkWgerAccount).mockResolvedValue({
      success: false,
      message: 'Error al desvincular la cuenta.',
    })

    await expect(deauthenticateWger()).rejects.toThrow(
      'Error al desvincular la cuenta.'
    )
  })
})

describe('WGER Auth — No exposición de credenciales', () => {
  beforeEach(() => {
    resetWgerAuth()
    vi.clearAllMocks()
  })

  it('getWgerAuthState NO incluye password', async () => {
    vi.mocked(linkWgerAccount).mockResolvedValue({
      success: true,
      message: 'Cuenta de WGER vinculada correctamente.',
    })
    vi.mocked(getWgerLinkStatus).mockResolvedValue({
      isLinked: true,
      wgerUsername: 'testuser',
    })
    await authenticateWger('testuser', 'secret-password')

    const state = getWgerAuthState()
    const stateStr = JSON.stringify(state)

    expect(stateStr).not.toContain('secret-password')
    expect(stateStr).not.toContain('password')
    expect(stateStr).not.toContain('token')
    expect(stateStr).not.toContain('secret')
  })

  it('estado NO incluye tokens de acceso', () => {
    const state = getWgerAuthState()
    const stateStr = JSON.stringify(state)

    expect(stateStr).not.toMatch(/token/i)
    expect(stateStr).not.toMatch(/bearer/i)
    expect(stateStr).not.toMatch(/jwt/i)
  })

  it('WgerAuthState no tiene campos de credenciales', () => {
    const state: WgerAuthState = getWgerAuthState()
    const keys = Object.keys(state)

    expect(keys).not.toContain('password')
    expect(keys).not.toContain('accessToken')
    expect(keys).not.toContain('refreshToken')
    expect(keys).not.toContain('apiKey')
  })

  it('Dexie NO almacena credenciales WGER', async () => {
    // Verificar que no hay tabla de credenciales en Dexie
    const tableNames = db.tables.map((t) => t.name)

    expect(tableNames).not.toContain('wger_credentials')
    expect(tableNames).not.toContain('credentials')
    expect(tableNames).not.toContain('tokens')
    expect(tableNames).not.toContain('secrets')
  })

  it('externalAccountLinks NO almacena credenciales', async () => {
    // La tabla externalAccountLinks solo debe tener IDs, no credenciales
    const table = db.externalAccountLinks
    const schema = table.schema

    // Verificar que no hay índices de credenciales
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).not.toContain('password')
    expect(indexNames).not.toContain('token')
    expect(indexNames).not.toContain('secret')
  })
})
