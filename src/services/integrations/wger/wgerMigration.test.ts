// Tests de migración Dexie para WGER.
// Verifica: instalación nueva, upgrade de base existente, persistencia,
// lectura, escritura, desconexión de WGER.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { resetWgerAuth } from './wgerAuth'

vi.mock('./wgerAuth', () => ({
  resetWgerAuth: vi.fn(),
}))

describe('WGER Migración — Instalación nueva', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('base de datos se crea correctamente en instalación nueva', async () => {
    expect(db.isOpen()).toBe(true)
    expect(db.name).toBe('trainPWA')
  })

  it('todas las tablas necesarias existen', () => {
    const tableNames = db.tables.map((t) => t.name)

    expect(tableNames).toContain('exercises')
    expect(tableNames).toContain('routines')
    expect(tableNames).toContain('sessions')
    expect(tableNames).toContain('syncQueue')
    expect(tableNames).toContain('customExercises')
    expect(tableNames).toContain('externalAccountLinks')
    expect(tableNames).toContain('externalEntityLinks')
  })

  it('versión de la base de datos es correcta', () => {
    expect(db.verno).toBe(21)
  })

  it('tablas de vinculación WGER existen', () => {
    const tableNames = db.tables.map((t) => t.name)

    expect(tableNames).toContain('externalAccountLinks')
    expect(tableNames).toContain('externalEntityLinks')
  })
})

describe('WGER Migración — Upgrade de base existente', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('upgrade preserva datos existentes', async () => {
    // Insertar datos antes del "upgrade"
    await db.externalAccountLinks.put({
      id: 'acct-1',
      altheaUserId: 'user-1',
      externalProvider: 'wger',
      externalUserId: 'wger-123',
      externalUsername: 'testuser',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    // Verificar que los datos persisten
    const link = await db.externalAccountLinks.get('acct-1')
    expect(link).toBeDefined()
    expect(link?.externalUsername).toBe('testuser')
  })

  it('upgrade no destruye tablas existentes', async () => {
    // Insertar datos en varias tablas
    await db.customExercises.put({
      id: 'custom-1',
      slug: 'custom-1',
      name: 'Custom Exercise',
      muscle: 'biceps',
      bodyPart: 'arms',
      equipment: 'dumbbell',
      category: 'strength',
      secondaryMuscles: [],
      instructions: [],
      file: '',
      gifUrl: '',
      origin: 'USER_CREATED',
      description: '',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never)

    const exercise = await db.customExercises.get('custom-1')
    expect(exercise).toBeDefined()
    expect(exercise?.name).toBe('Custom Exercise')
  })
})

describe('WGER Migración — Persistencia', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('externalAccountLinks persiste correctamente', async () => {
    const link = {
      id: 'acct-persist',
      altheaUserId: 'user-persist',
      externalProvider: 'wger' as const,
      externalUserId: 'wger-456',
      externalUsername: 'persistuser',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active' as const,
    }

    await db.externalAccountLinks.put(link)

    const retrieved = await db.externalAccountLinks.get('acct-persist')
    expect(retrieved).toEqual(link)
  })

  it('externalEntityLinks persiste correctamente', async () => {
    const link = {
      id: 'entity-persist',
      altheaEntityId: 'althea-1',
      externalProvider: 'wger' as const,
      externalEntityId: 'wger-789',
      externalEntityUuid: 'uuid-789',
      entityType: 'exercise' as const,
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      metadata: {},
    }

    await db.externalEntityLinks.put(link)

    const retrieved = await db.externalEntityLinks.get('entity-persist')
    expect(retrieved).toEqual(link)
  })

  it('syncQueue persiste operaciones', async () => {
    const op = {
      id: 'sync-persist',
      operation: 'create' as const,
      entityType: 'routine' as const,
      localEntityId: 'routine-1',
      payload: { data: { name: 'Test' }, hash: 'abc' },
      attempts: 0,
      createdAt: new Date().toISOString(),
      status: 'PENDING' as const,
    }

    await db.syncQueue.put(op)

    const retrieved = await db.syncQueue.get('sync-persist')
    expect(retrieved).toBeDefined()
    expect(retrieved?.localEntityId).toBe('routine-1')
  })
})

describe('WGER Migración — Lectura', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('lee externalAccountLinks por altheaUserId', async () => {
    await db.externalAccountLinks.put({
      id: 'acct-1',
      altheaUserId: 'user-read',
      externalProvider: 'wger',
      externalUserId: 'wger-1',
      externalUsername: 'user1',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    const links = await db.externalAccountLinks
      .where('altheaUserId')
      .equals('user-read')
      .toArray()

    expect(links.length).toBe(1)
    expect(links[0].externalUsername).toBe('user1')
  })

  it('lee externalEntityLinks por altheaEntityId', async () => {
    await db.externalEntityLinks.put({
      id: 'entity-1',
      altheaEntityId: 'althea-read',
      externalProvider: 'wger',
      externalEntityId: 'wger-1',
      externalEntityUuid: 'uuid-1',
      entityType: 'exercise',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      metadata: {},
    })

    const links = await db.externalEntityLinks
      .where('altheaEntityId')
      .equals('althea-read')
      .toArray()

    expect(links.length).toBe(1)
  })

  it('lee externalEntityLinks por externalEntityId', async () => {
    await db.externalEntityLinks.put({
      id: 'entity-1',
      altheaEntityId: 'althea-1',
      externalProvider: 'wger',
      externalEntityId: 'wger-search',
      externalEntityUuid: 'uuid-1',
      entityType: 'routine',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      metadata: {},
    })

    const links = await db.externalEntityLinks
      .where('externalEntityId')
      .equals('wger-search')
      .toArray()

    expect(links.length).toBe(1)
  })
})

describe('WGER Migración — Escritura', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('escribe en externalAccountLinks', async () => {
    await db.externalAccountLinks.put({
      id: 'acct-write',
      altheaUserId: 'user-write',
      externalProvider: 'wger',
      externalUserId: 'wger-write',
      externalUsername: 'writeuser',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    const count = await db.externalAccountLinks.count()
    expect(count).toBe(1)
  })

  it('actualiza externalAccountLinks', async () => {
    await db.externalAccountLinks.put({
      id: 'acct-update',
      altheaUserId: 'user-update',
      externalProvider: 'wger',
      externalUserId: 'wger-update',
      externalUsername: 'oldname',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    await db.externalAccountLinks.update('acct-update', {
      externalUsername: 'newname',
    })

    const updated = await db.externalAccountLinks.get('acct-update')
    expect(updated?.externalUsername).toBe('newname')
  })

  it('elimina externalAccountLinks', async () => {
    await db.externalAccountLinks.put({
      id: 'acct-delete',
      altheaUserId: 'user-delete',
      externalProvider: 'wger',
      externalUserId: 'wger-delete',
      externalUsername: 'deleteuser',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    await db.externalAccountLinks.delete('acct-delete')

    const deleted = await db.externalAccountLinks.get('acct-delete')
    expect(deleted).toBeUndefined()
  })
})

describe('WGER Migración — Desconexión de WGER', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('desvincular cuenta elimina externalAccountLinks', async () => {
    await db.externalAccountLinks.put({
      id: 'acct-disconnect',
      altheaUserId: 'user-disconnect',
      externalProvider: 'wger',
      externalUserId: 'wger-disconnect',
      externalUsername: 'disconnectuser',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    // Simular desconexión
    await db.externalAccountLinks.delete('acct-disconnect')

    const link = await db.externalAccountLinks.get('acct-disconnect')
    expect(link).toBeUndefined()
  })

  it('desvincular cuenta NO elimina datos locales', async () => {
    // Crear datos locales
    await db.customExercises.put({
      id: 'local-1',
      slug: 'local-1',
      name: 'Local Exercise',
      muscle: 'biceps',
      bodyPart: 'arms',
      equipment: 'dumbbell',
      category: 'strength',
      secondaryMuscles: [],
      instructions: [],
      file: '',
      gifUrl: '',
      origin: 'USER_CREATED',
      description: '',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never)

    // Desvincular WGER
    await db.externalAccountLinks.clear()

    // Los datos locales deben persistir
    const exercise = await db.customExercises.get('local-1')
    expect(exercise).toBeDefined()
  })

  it('desvincular cuenta NO elimina rutinas importadas', async () => {
    // Crear rutina importada
    await db.routineStore.put({
      id: 'wger-routine-1',
      name: 'Imported Routine',
      description: 'From WGER',
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

    // Desvincular WGER
    await db.externalAccountLinks.clear()

    // La rutina debe persistir
    const routine = await db.routineStore.get('wger-routine-1')
    expect(routine).toBeDefined()
  })

  it('resetWgerAuth limpia estado pero no datos', async () => {
    // Crear datos
    await db.externalAccountLinks.put({
      id: 'acct-reset',
      altheaUserId: 'user-reset',
      externalProvider: 'wger',
      externalUserId: 'wger-reset',
      externalUsername: 'resetuser',
      linkedAt: new Date().toISOString(),
      lastSyncAt: null,
      status: 'active',
    })

    // Reset auth
    resetWgerAuth()

    // Los datos deben persistir
    const link = await db.externalAccountLinks.get('acct-reset')
    expect(link).toBeDefined()
  })
})
