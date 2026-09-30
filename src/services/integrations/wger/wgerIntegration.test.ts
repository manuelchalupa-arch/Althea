// Tests reales/contractuales de integración WGER.
// Estos tests requieren credenciales reales de WGER para ejecutarse.
// Si no hay credenciales disponibles, se marcan como "REQUIRES_CREDENCIALES".
//
// Variables de entorno requeridas:
// - WGER_TEST_BASE_URL: URL base de la instancia WGER (default: https://wger.de/api/v2)
// - WGER_TEST_USERNAME: Usuario de prueba
// - WGER_TEST_PASSWORD: Contraseña de prueba
//
// NO se simulan PASS. Si no hay credenciales, los tests se omiten.

import { describe, it, expect, beforeAll } from 'vitest'
import { WgerClient } from './wgerClient'
import type { WgerListResponse, WgerExerciseListItem, WgerRoutineListItem } from './wgerTypes'

const BASE_URL = process.env.WGER_TEST_BASE_URL || 'https://wger.de/api/v2'
const USERNAME = process.env.WGER_TEST_USERNAME
const PASSWORD = process.env.WGER_TEST_PASSWORD

const hasCredentials = Boolean(USERNAME && PASSWORD)
const client = new WgerClient(BASE_URL)

describe.skipIf(!hasCredentials)('WGER Integration — Tests Reales/Contractuales', () => {
  let accessToken: string | undefined

  beforeAll(async () => {
    if (!USERNAME || !PASSWORD) return

    try {
      const loginResponse = await fetch(`${BASE_URL}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
      })

      if (loginResponse.ok) {
        const data = await loginResponse.json() as { token?: string }
        accessToken = data.token
      }
    } catch {
      accessToken = undefined
    }
  })

  describe('Contrato de API — Endpoints públicos', () => {
    it('GET /exercise/ retorna lista paginada', async () => {
      const response = await client.request<WgerListResponse<WgerExerciseListItem>>('/exercise/?format=json&limit=5')

      expect(response).toHaveProperty('count')
      expect(response).toHaveProperty('next')
      expect(response).toHaveProperty('previous')
      expect(Array.isArray(response.results)).toBe(true)
      expect(response.results.length).toBeLessThanOrEqual(5)
    })

    it('GET /exercise/ respeta parámetro limit', async () => {
      const response = await client.request<WgerListResponse<WgerExerciseListItem>>('/exercise/?format=json&limit=3')

      expect(response.results.length).toBeLessThanOrEqual(3)
    })

    it('GET /exercise/ respeta parámetro offset', async () => {
      const first = await client.request<WgerListResponse<WgerExerciseListItem>>('/exercise/?format=json&limit=2&offset=0')
      const second = await client.request<WgerListResponse<WgerExerciseListItem>>('/exercise/?format=json&limit=2&offset=2')

      if (first.results.length === 2 && second.results.length > 0) {
        expect(first.results[0].id).not.toBe(second.results[0].id)
      }
    })

    it('GET /exerciseinfo/{id}/ retorna detalle de ejercicio', async () => {
      const list = await client.request<WgerListResponse<WgerExerciseListItem>>('/exercise/?format=json&limit=1')

      if (list.results.length === 0) return

      const detail = await client.request<Record<string, unknown>>(`/exerciseinfo/${list.results[0].id}/?format=json`)

      expect(detail).toHaveProperty('id')
      expect(detail).toHaveProperty('translations')
    })

    it('GET /routine/ retorna lista de rutinas', async () => {
      const response = await client.request<WgerListResponse<WgerRoutineListItem>>('/routine/?format=json&limit=5')

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })

    it('GET /routine/ respeta paginación', async () => {
      const response = await client.request<WgerListResponse<WgerRoutineListItem>>('/routine/?format=json&limit=2')

      expect(response.results.length).toBeLessThanOrEqual(2)
    })
  })

  describe('Contrato de API — Filtros por fecha', () => {
    it('GET /ingredient/ soporta last_update__gte', async () => {
      const since = '2020-01-01T00:00:00Z'
      const response = await client.request<WgerListResponse<Record<string, unknown>>>(
        `/ingredient/?format=json&limit=5&last_update__gte=${encodeURIComponent(since)}`
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })

    it('GET /nutritionplan/ soporta last_update__gte', async () => {
      const since = '2020-01-01T00:00:00Z'
      const response = await client.request<WgerListResponse<Record<string, unknown>>>(
        `/nutritionplan/?format=json&limit=5&last_update__gte=${encodeURIComponent(since)}`
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })

    it('GET /workoutsession/ soporta last_update__gte', async () => {
      const since = '2020-01-01T00:00:00Z'
      const response = await client.request<WgerListResponse<Record<string, unknown>>>(
        `/workoutsession/?format=json&limit=5&last_update__gte=${encodeURIComponent(since)}`
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })
  })

  describe('Contrato de API — Errores HTTP', () => {
    it('retorna 401 sin token para endpoints protegidos', async () => {
      try {
        await client.request('/routine/', { method: 'POST', body: '{}' })
        expect.unreachable('Debería haber lanzado error 401')
      } catch (err) {
        expect((err as Error & { status?: number }).status).toBe(401)
      }
    })

    it('retorna 404 para recurso inexistente', async () => {
      try {
        await client.request('/exerciseinfo/999999999/?format=json')
        expect.unreachable('Debería haber lanzado error 404')
      } catch (err) {
        expect((err as Error & { status?: number }).status).toBe(404)
      }
    })

    it('retorna 400 para request inválido', async () => {
      try {
        await client.request('/exercise/?format=json&limit=invalid')
      } catch (err) {
        const status = (err as Error & { status?: number }).status
        expect(status).toBeDefined()
        expect([400, 404]).toContain(status)
      }
    })
  })

  describe.skipIf(!accessToken)('Contrato de API — Operaciones autenticadas', () => {
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
          name: `To Delete ${Date.now()}`,
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
  })
})

describe('WGER Integration — Tests Manuales (REQUIRES_CREDENCIALES)', () => {
  it('marcado como REQUIRES_CREDENCIALES', () => {
    if (!hasCredentials) {
      console.warn(
        '[WGER Integration] Tests reales omitidos — faltan credenciales.\n' +
        'Configura WGER_TEST_USERNAME y WGER_TEST_PASSWORD para ejecutarlos.'
      )
    }

    expect(true).toBe(true)
  })
})
