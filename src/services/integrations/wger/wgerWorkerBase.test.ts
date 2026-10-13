import { describe, expect, it, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getWgerWorkerBase, configuredWgerWorkerBase } from './wgerWorkerBase'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('getWgerWorkerBase', () => {
  it('deriva la base del proxy WGER desde la URL del Worker (staging)', () => {
    expect(getWgerWorkerBase('https://althea-proxy-staging.workers.dev')).toBe(
      'https://althea-proxy-staging.workers.dev/api/wger',
    )
  })

  it('deriva la base del proxy WGER desde la URL del Worker (production)', () => {
    expect(getWgerWorkerBase('https://althea-proxy-production.workers.dev')).toBe(
      'https://althea-proxy-production.workers.dev/api/wger',
    )
  })

  it('normaliza barras finales para no duplicar el separador', () => {
    expect(getWgerWorkerBase('https://worker.example.com///')).toBe('https://worker.example.com/api/wger')
  })

  it('recorta espacios alrededor de la URL', () => {
    expect(getWgerWorkerBase('  https://worker.example.com  ')).toBe('https://worker.example.com/api/wger')
  })

  it('devuelve null sin URL configurada (no inventa /api/wger)', () => {
    expect(getWgerWorkerBase('')).toBeNull()
    expect(getWgerWorkerBase('   ')).toBeNull()
    expect(getWgerWorkerBase(null)).toBeNull()
    expect(getWgerWorkerBase(undefined)).toBeNull()
  })

  it('nunca devuelve la ruta relativa histórica /api/wger', () => {
    expect(getWgerWorkerBase('')).not.toBe('/api/wger')
  })
})

describe('configuredWgerWorkerBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('usa VITE_GROQ_PROXY_URL del entorno de build', () => {
    vi.stubEnv('VITE_GROQ_PROXY_URL', 'https://althea-proxy-production.workers.dev')
    expect(configuredWgerWorkerBase()).toBe('https://althea-proxy-production.workers.dev/api/wger')
  })

  it('devuelve null cuando la variable está vacía', () => {
    vi.stubEnv('VITE_GROQ_PROXY_URL', '')
    expect(configuredWgerWorkerBase()).toBeNull()
  })
})

describe('CSP de hosting permite el Worker WGER', () => {
  it('connect-src incluye https://*.workers.dev', () => {
    const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'))
    const headers = firebaseJson?.hosting?.headers ?? []
    const cspHeader = headers
      .flatMap((h: { headers?: { key: string; value: string }[] }) => h.headers ?? [])
      .find((h: { key: string }) => h.key.toLowerCase() === 'content-security-policy')

    expect(cspHeader, 'firebase.json debe declarar Content-Security-Policy').toBeTruthy()
    expect(cspHeader.value).toContain('https://*.workers.dev')
    expect(cspHeader.value).toContain('connect-src')
  })
})
