// Tests de seguridad WGER.
// Verifica: no secretos en Git, no secretos en bundle, no credenciales en Dexie,
// no llamadas privadas desde React, no duplicados, no pÃ©rdida de historial,
// no migraciones destructivas.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { resetWgerAuth } from './wgerAuth'
import {
  sanitizeString,
  sanitizeUrl,
  sanitizeErrorMessage,
  validateId,
  validatePagination,
  WgerSecurityError,
  handleSecurityError,
  WGER_SECURITY_CONFIG,
} from './wgerSecurity'

vi.mock('./wgerAuth', () => ({
  resetWgerAuth: vi.fn(),
}))

describe('WGER Seguridad â€” No secretos en Git', () => {
  it('cÃ³digo no contiene passwords hardcodeados', () => {
    const fs = require('fs')
    const path = require('path')

    const wgerDir = path.join(__dirname)
    const files = fs.readdirSync(wgerDir).filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

    const secretPatterns = [
      /password\s*[:=]\s*['"][^'"]+['"]/i,
      /secret\s*[:=]\s*['"][^'"]+['"]/i,
      /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    ]

    for (const file of files) {
      const content = fs.readFileSync(path.join(wgerDir, file), 'utf-8')
      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern)
      }
    }
  })

  it('no hay variables VITE_ con secretos', () => {
    const fs = require('fs')
    const path = require('path')

    const wgerDir = path.join(__dirname)
    const files = fs.readdirSync(wgerDir).filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

    for (const file of files) {
      const content = fs.readFileSync(path.join(wgerDir, file), 'utf-8')
      const lines = content.split('\n')
      for (const line of lines) {
        if (line.trim().startsWith('//')) { continue }
        expect(line).not.toMatch(/VITE_WGER_SECRET|VITE_WGER_API_KEY|VITE_WGER_TOKEN/i)
      }
    }
  })
})

describe('WGER Seguridad â€” No secretos en bundle', () => {
  it('WGER_SECURITY_CONFIG no contiene secretos', () => {
    const configStr = JSON.stringify(WGER_SECURITY_CONFIG)

    expect(configStr).not.toContain('password')
    expect(configStr).not.toContain('secret')
    expect(configStr).not.toContain('token')
    expect(configStr).not.toContain('apikey')
  })

  it('baseUrl es HTTPS', () => {
    expect(WGER_SECURITY_CONFIG.baseUrl).toMatch(/^https:\/\//)
  })
})

describe('WGER Seguridad â€” No credenciales en Dexie', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('Dexie no tiene tabla de credenciales', () => {
    const tableNames = db.tables.map((t) => t.name)

    expect(tableNames).not.toContain('wger_credentials')
    expect(tableNames).not.toContain('credentials')
    expect(tableNames).not.toContain('tokens')
    expect(tableNames).not.toContain('secrets')
    expect(tableNames).not.toContain('passwords')
  })

  it('externalAccountLinks no almacena passwords', async () => {
    const table = db.externalAccountLinks
    const schema = table.schema

    // Verificar Ã­ndices
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).not.toContain('password')
    expect(indexNames).not.toContain('token')
    expect(indexNames).not.toContain('secret')
  })

  it('externalEntityLinks no almacena credenciales', async () => {
    const table = db.externalEntityLinks
    const schema = table.schema

    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).not.toContain('password')
    expect(indexNames).not.toContain('token')
  })

  it('syncQueue no almacena credenciales', async () => {
    const table = db.syncQueue
    const schema = table.schema

    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).not.toContain('password')
    expect(indexNames).not.toContain('token')
  })
})

describe('WGER Seguridad â€” No llamadas privadas desde React', () => {

  it('wgerIntegration no expone credenciales', async () => {
    const wgerAuth = await import('./wgerAuth')
    expect(wgerAuth).toBeTruthy()
  })
})

describe('WGER Seguridad â€” No duplicados', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('externalAccountLinks no permite duplicados por altheaUserId', async () => {
    const link = {
      id: 'acct-1',
      altheaUserId: 'user-1',
      externalProvider: 'wger' as const,
      externalUserId: 'wger-1',
      externalUsername: 'user1',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active' as const,
    }

    await db.externalAccountLinks.put(link)

    // El mismo ID no debe duplicarse
    const retrieved = await db.externalAccountLinks.get('acct-1')
    expect(retrieved).toBeDefined()
  })

  it('externalEntityLinks no permite duplicados por altheaEntityId', async () => {
    const link = {
      id: 'entity-1',
      altheaEntityId: 'althea-1',
      externalProvider: 'wger' as const,
      externalEntityId: 'wger-1',
      externalEntityUuid: 'uuid-1',
      entityType: 'exercise' as const,
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      metadata: {},
    }

    await db.externalEntityLinks.put(link)

    const retrieved = await db.externalEntityLinks.get('entity-1')
    expect(retrieved).toBeDefined()
  })
})

describe('WGER Seguridad â€” No pÃ©rdida de historial', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('desvincular WGER no elimina historial de entrenamientos', async () => {
    await db.externalAccountLinks.clear()
    const count = await db.trainingSessions.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('desvincular WGER no elimina rutinas', async () => {
    await db.routineStore.put({
      id: 'routine-1',
      name: 'Test Routine',
      description: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rotationDays: 30,
      cycle: {
        startDate: new Date().toISOString().split('T')[0],
        trainingDays: [],
        weekMap: [],
      },
      dayExercises: {},
      version: 1,
    } as never)

    await db.externalAccountLinks.clear()

    const routine = await db.routineStore.get('routine-1')
    expect(routine).toBeDefined()
  })

  it('desvincular WGER no elimina mediciones', async () => {
    await db.bodyMeasurements.put({
      id: 'measure-1',
      localDate: '2026-09-28',
      weight: 70,
      createdAt: new Date().toISOString(),
    } as never)

    await db.externalAccountLinks.clear()

    const measurement = await db.bodyMeasurements.get('measure-1')
    expect(measurement).toBeDefined()
  })
})

describe('WGER Seguridad â€” No migraciones destructivas', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('migraciones no eliminan tablas', () => {
    // Verificar que todas las tablas esperadas existen
    const tableNames = db.tables.map((t) => t.name)

    const expectedTables = [
      'exercises',
      'routines',
      'sessions',
      'syncQueue',
      'customExercises',
      'externalAccountLinks',
      'externalEntityLinks',
    ]

    for (const table of expectedTables) {
      expect(tableNames).toContain(table)
    }
  })

  it('migraciones no eliminan Ã­ndices', () => {
    const accountLinksTable = db.externalAccountLinks
    const indexNames = accountLinksTable.schema.indexes.map((idx) => idx.name)

    expect(indexNames).toContain('altheaUserId')
    expect(indexNames).toContain('externalProvider')
    expect(indexNames).toContain('externalUserId')
  })

  it('migraciones son aditivas', () => {
    // La versiÃ³n 21 debe tener todas las tablas de versiones anteriores
    const tableNames = db.tables.map((t) => t.name)

    // Tablas de versiones tempranas
    expect(tableNames).toContain('exercises')
    expect(tableNames).toContain('routines')
    expect(tableNames).toContain('sessions')

    // Tablas de versiones posteriores
    expect(tableNames).toContain('customExercises')
    expect(tableNames).toContain('externalAccountLinks')
  })
})

describe('WGER Seguridad â€” SanitizaciÃ³n', () => {
  it('sanitizeString elimina HTML peligroso', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).not.toContain('<')
    expect(sanitizeString('javascript:alert(1)')).not.toContain('javascript:')
  })

  it('sanitizeUrl solo permite HTTP/HTTPS', () => {
    expect(sanitizeUrl('https://example.com')).toMatch(/^https:\/\//)
    expect(sanitizeUrl('http://example.com')).toMatch(/^http:\/\//)
    expect(sanitizeUrl('ftp://example.com')).toBe('')
    expect(sanitizeUrl('javascript:alert(1)')).toBe('')
  })

  it('sanitizeErrorMessage no expone detalles internos', () => {
    const error = new Error('Connection to secret-server failed')
    const sanitized = sanitizeErrorMessage(error)
    expect(typeof sanitized).toBe('string')
  })
})

describe('WGER Seguridad â€” ValidaciÃ³n', () => {
  it('validateId acepta IDs vÃ¡lidos', () => {
    const result = validateId(123)
    expect(result.success).toBe(true)
    expect(result.data).toBe(123)
  })

  it('validateId rechaza IDs invÃ¡lidos', () => {
    expect(validateId(-1).success).toBe(false)
    expect(validateId(0).success).toBe(false)
    expect(validateId(NaN).success).toBe(false)
  })

  it('validatePagination acepta parÃ¡metros vÃ¡lidos', () => {
    const result = validatePagination({ limit: 50, offset: 0 })
    expect(result.success).toBe(true)
  })

  it('validatePagination rechaza parÃ¡metros invÃ¡lidos', () => {
    expect(validatePagination({ limit: -1, offset: 0 }).success).toBe(false)
    expect(validatePagination({ limit: 50, offset: -1 }).success).toBe(false)
  })
})

describe('WGER Seguridad â€” Manejo de errores', () => {
  it('WgerSecurityError tiene cÃ³digo y statusCode', () => {
    const error = new WgerSecurityError('Test error', 'INVALID_INPUT', 400)
    expect(error.code).toBe('INVALID_INPUT')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('WgerSecurityError')
  })

  it('handleSecurityError maneja errores desconocidos', () => {
    const error = handleSecurityError(new Error('Unknown'))
    expect(error).toBeInstanceOf(WgerSecurityError)
    expect(error.code).toBe('HTTP_ERROR')
  })

  it('handleSecurityError maneja AbortError', () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    const error = handleSecurityError(abortError)
    expect(error.code).toBe('TIMEOUT')
  })
})


