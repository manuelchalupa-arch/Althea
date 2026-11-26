import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { verifyFirebaseIdToken, resetJwksCache } from '../src/firebase-auth.js'

const encoder = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let keys: any

async function makeToken(claims: Record<string, unknown>, kid = 'test-kid') {
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })))
  const payload = b64url(encoder.encode(JSON.stringify(claims)))
  const sig = await webcrypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keys.privateKey,
    encoder.encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`
}

const now = () => Math.floor(Date.now() / 1000)

const validClaims = () => ({
  aud: 'althea-stg',
  iss: 'https://securetoken.google.com/althea-stg',
  sub: 'user-1',
  iat: now() - 10,
  exp: now() + 3600,
})

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto)
  keys = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const jwk = await webcrypto.subtle.exportKey('jwk', keys.publicKey)
  Object.assign(jwk, { kid: 'test-kid', alg: 'RS256', use: 'sig' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })))
})

beforeEach(() => {
  resetJwksCache()
  vi.clearAllMocks()
})

describe('verificación de ID token de Firebase', () => {
  it('acepta un token válido y devuelve el uid', async () => {
    expect(await verifyFirebaseIdToken(await makeToken(validClaims()), 'althea-stg')).toBe('user-1')
  })

  it('rechaza aud incorrecto', async () => {
    expect(await verifyFirebaseIdToken(await makeToken({ ...validClaims(), aud: 'otro-proyecto' }), 'althea-stg')).toBeNull()
  })

  it('rechaza issuer incorrecto', async () => {
    expect(await verifyFirebaseIdToken(await makeToken({ ...validClaims(), iss: 'https://evil.example' }), 'althea-stg')).toBeNull()
  })

  it('rechaza token expirado', async () => {
    expect(await verifyFirebaseIdToken(await makeToken({ ...validClaims(), exp: now() - 1 }), 'althea-stg')).toBeNull()
  })

  it('rechaza kid desconocido y firma manipulada', async () => {
    expect(await verifyFirebaseIdToken(await makeToken(validClaims(), 'otro-kid'), 'althea-stg')).toBeNull()
    const token = await makeToken(validClaims())
    expect(await verifyFirebaseIdToken(`${token.slice(0, -2)}xx`, 'althea-stg')).toBeNull()
  })

  it('rechaza entradas malformadas y projectId vacío', async () => {
    expect(await verifyFirebaseIdToken('not-a-jwt', 'althea-stg')).toBeNull()
    expect(await verifyFirebaseIdToken(await makeToken(validClaims()), '')).toBeNull()
  })
})
