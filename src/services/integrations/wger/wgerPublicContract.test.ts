// Contratos de endpoints PÚBLICOS de solo lectura de WGER.
//
// Estos tests NO requieren cuenta ni token: sólo conectividad con la instancia.
// Por eso viven separados del suite con credenciales (wgerIntegration.test.ts).
//
// NO corren en CI por defecto (una llamada de red inestable no puede fallar el
// build). Se habilitan de forma EXPLÍCITA:
//
//   WGER_PUBLIC_INTEGRATION=1 npx vitest run src/services/integrations/wger/wgerPublicContract.test.ts
//
// Opcional: WGER_TEST_BASE_URL para apuntar a otra instancia.
// Si la petición falla por red, el test FALLA — no se convierte el error en pase.
//
// RECLASIFICACIÓN respecto del original (2026-10-10, API real verificada):
//   - GET /routine/, GET /nutritionplan/, GET /workoutsession/ responden
//     403 "Authentication credentials were not provided." → dejaron de ser
//     públicos y pasan al suite CON credenciales.
//   - El rechazo anónimo de endpoints protegidos es 403, no 401.

import { describe, it, expect } from 'vitest'
import { WgerClient } from './wgerClient'
import { WGER_API_BASE } from './wgerHttp'
import type { WgerListResponse, WgerExerciseListItem } from './wgerTypes'

const RUN_PUBLIC = process.env.WGER_PUBLIC_INTEGRATION === '1'
const BASE_URL = process.env.WGER_TEST_BASE_URL || WGER_API_BASE

const client = new WgerClient(BASE_URL)

describe.skipIf(!RUN_PUBLIC)('WGER — Contrato de endpoints públicos (lectura, sin credenciales)', () => {
  describe('Endpoints públicos', () => {
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
  })

  describe('Filtros por fecha', () => {
    it('GET /ingredient/ soporta last_update__gte', async () => {
      const since = '2020-01-01T00:00:00Z'
      const response = await client.request<WgerListResponse<Record<string, unknown>>>(
        `/ingredient/?format=json&limit=5&last_update__gte=${encodeURIComponent(since)}`,
      )

      expect(response).toHaveProperty('count')
      expect(Array.isArray(response.results)).toBe(true)
    })
  })

  describe('Errores HTTP (sin autenticar)', () => {
    it('rechaza con 403 los endpoints protegidos cuando no hay token', async () => {
      try {
        await client.request('/routine/', { method: 'POST', body: '{}' })
        expect.unreachable('Debería haber lanzado error 403')
      } catch (err) {
        const status = (err as Error & { status?: number }).status
        // wger.de responde 403 con body "Authentication credentials were not provided."
        expect(status).toBe(403)
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

    it('retorna 404 para un formato no soportado', async () => {
      try {
        await client.request('/exercise/?format=xml')
        expect.unreachable('Debería haber lanzado error 404')
      } catch (err) {
        expect((err as Error & { status?: number }).status).toBe(404)
      }
    })

    // Comportamiento verificado contra la API real (2026-10-10): DRF IGNORA un
    // limit no numérico y responde 200 con la página por defecto. Se deja
    // fijado para que nadie vuelva a escribir un "400" que nunca existió.
    it('ignora un limit no numérico y responde 200 con una página válida', async () => {
      const response = await client.request<WgerListResponse<WgerExerciseListItem>>(
        '/exercise/?format=json&limit=invalid',
      )

      expect(Array.isArray(response.results)).toBe(true)
    })
  })
})
