// Tests WGER que REQUIEREN una cuenta real (token de usuario).
//
// Variables de entorno:
// - WGER_TEST_BASE_URL: instancia (default: https://wger.de/api/v2)
// - WGER_TEST_USERNAME / WGER_TEST_PASSWORD: credenciales de prueba
//
// Sin credenciales el suite entero queda omitido. Con credenciales, el login
// real DEBE funcionar: si no lo hace, el suite FALLA (no se simula un pase ni
// se convierte un error de red en resultado aprobado).
//
// Los endpoints públicos de lectura NO están acá: ver wgerPublicContract.test.ts
// (habilitados con WGER_PUBLIC_INTEGRATION=1, sin cuenta).

import { describe, it, expect, beforeAll } from 'vitest'
import { WgerClient } from './wgerClient'
import { WGER_API_BASE } from './wgerHttp'
import type { WgerListResponse, WgerRoutineListItem } from './wgerTypes'

const BASE_URL = process.env.WGER_TEST_BASE_URL || WGER_API_BASE
const USERNAME = process.env.WGER_TEST_USERNAME
const PASSWORD = process.env.WGER_TEST_PASSWORD

const hasCredentials = Boolean(USERNAME && PASSWORD)

if (!hasCredentials) {
  console.warn(
    '[WGER Integration] Operaciones autenticadas OMITIDAS — faltan credenciales.\n' +
    'Configura WGER_TEST_USERNAME y WGER_TEST_PASSWORD para ejecutarlas.\n' +
    'Los endpoints públicos se habilitan con WGER_PUBLIC_INTEGRATION=1 (sin cuenta).',
  )
}

const client = new WgerClient(BASE_URL)

describe.skipIf(!hasCredentials)('WGER Integration — Operaciones autenticadas (requiere cuenta)', () => {
  let accessToken: string

  beforeAll(async () => {
    const loginResponse = await fetch(`${BASE_URL}/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    })

    // Si el login no devuelve OK, el suite falla acá y nada se ejecuta.
    // No se omite en silencio ni se pisa el error.
    expect(loginResponse.ok, `login/ respondió ${loginResponse.status}`).toBe(true)

    const data = await loginResponse.json() as { token?: string }
    accessToken = data.token as string
    expect(accessToken, 'login/ no devolvió token').toBeTruthy()
  })

  it('POST /routine/ crea rutina con token válido', async () => {
    const response = await client.request<Record<string, unknown>>('/routine/', {
      method: 'POST',
      body: JSON.stringify({
        name: `Test Routine ${Date.now()}`,
        description: 'Test',
      }),
    }, accessToken)

    expect(response).toHaveProperty('id')
  })

  it('PUT /routine/{id}/ actualiza rutina', async () => {
    const createResponse = await client.request<Record<string, unknown>>('/routine/', {
      method: 'POST',
      body: JSON.stringify({
        name: `Test Routine ${Date.now()}`,
        description: 'Test',
      }),
    }, accessToken)

    const routineId = createResponse.id as number

    const updateResponse = await client.request<Record<string, unknown>>(`/routine/${routineId}/`, {
      method: 'PUT',
      body: JSON.stringify({
        name: `Updated ${Date.now()}`,
        description: 'Updated',
      }),
    }, accessToken)

    expect(updateResponse).toHaveProperty('id', routineId)
  })

  it('DELETE /routine/{id}/ elimina rutina', async () => {
    const createResponse = await client.request<Record<string, unknown>>('/routine/', {
      method: 'POST',
      body: JSON.stringify({
        name: `Test Routine ${Date.now()}`,
        description: 'Delete me',
      }),
    }, accessToken)

    const routineId = createResponse.id as number

    await client.request<void>(`/routine/${routineId}/`, {
      method: 'DELETE',
    }, accessToken)

    try {
      await client.request(`/routine/${routineId}/?format=json`)
      expect.unreachable('Debería haber lanzado error 404')
    } catch (err) {
      expect((err as Error & { status?: number }).status).toBe(404)
    }
  })

  // Reclasificados desde la suite pública: desde la auditoría de 2026-10-10
  // wger.de responde 403 "Authentication credentials were not provided." para
  // /routine/, /nutritionplan/ y /workoutsession/ → requieren permisos de usuario.
  describe('Endpoints con permisos de usuario', () => {
    it('GET /routine/ retorna lista de rutinas', async () => {
      const response = await client.request<WgerListResponse<WgerRoutineListItem>>(
        '/routine/?format=json&limit=5',
        {},
        accessToken,
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })

    it('GET /routine/ respeta paginación', async () => {
      const response = await client.request<WgerListResponse<WgerRoutineListItem>>(
        '/routine/?format=json&limit=2',
        {},
        accessToken,
      )

      expect(response.results.length).toBeLessThanOrEqual(2)
    })

    it('GET /nutritionplan/ soporta last_update__gte', async () => {
      const since = '2020-01-01T00:00:00Z'
      const response = await client.request<WgerListResponse<Record<string, unknown>>>(
        `/nutritionplan/?format=json&limit=5&last_update__gte=${encodeURIComponent(since)}`,
        {},
        accessToken,
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })

    it('GET /workoutsession/ soporta last_update__gte', async () => {
      const since = '2020-01-01T00:00:00Z'
      const response = await client.request<WgerListResponse<Record<string, unknown>>>(
        `/workoutsession/?format=json&limit=5&last_update__gte=${encodeURIComponent(since)}`,
        {},
        accessToken,
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })
  })
})
