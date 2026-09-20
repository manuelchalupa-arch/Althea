// Migración de localStorage restante → Dexie
// Ejecutar una vez para migrar datos legacy que aún están en localStorage
import { db } from '@/services/storage/db'
import { logger } from '@/services/logger'

export interface MigrationReport {
  startedAt: string
  completedAt?: string
  phases: MigrationPhaseReport[]
  summary: {
    totalRecordsFound: number
    totalRecordsMigrated: number
    totalRecordsSkipped: number
    totalRecordsExisting: number
    totalErrors: number
  }
  errors: MigrationError[]
}

export interface MigrationPhaseReport {
  phase: string
  startedAt: string
  completedAt?: string
  recordsFound: number
  recordsMigrated: number
  recordsSkipped: number
  recordsExisting: number
  errors: MigrationError[]
}

export interface MigrationError {
  phase: string
  key: string
  error: string
  timestamp: string
  severity: 'error' | 'warn'
}

export interface MigrationOptions {
  dryRun?: boolean
  deleteLegacyAfterVerify?: boolean
  verifyOnly?: boolean
  storage?: Storage
}

async function checkExistingRecord(db: any, tableName: string, id: string): Promise<boolean> {
  try {
    const table = (db as any)[tableName]
    if (!table) {return false}
    const record = await table.get(id)
    return !!record
  } catch {
    return false
  }
}

async function safePut(table: any, record: any, dryRun: boolean): Promise<boolean> {
  if (dryRun) {return true}
  try {
    await (table as any).put(record)
    return true
  } catch (e) {
    throw e
  }
}

async function runPhase(
  phaseName: string,
  report: MigrationReport,
  keys: string[],
  processor: (key: string) => Promise<{ migrated: boolean; skipped: boolean; existing: boolean; error?: string }>,
  dryRun: boolean
): Promise<MigrationPhaseReport> {
  const phaseReport: MigrationPhaseReport = {
    phase: phaseName,
    startedAt: new Date().toISOString(),
    completedAt: '',
    recordsFound: 0,
    recordsMigrated: 0,
    recordsSkipped: 0,
    recordsExisting: 0,
    errors: []
  }

  logger.migration.start(phaseName, keys.length)

  for (const key of keys) {
    report.summary.totalRecordsFound++
    phaseReport.recordsFound++
    logger.migration.recordFound(phaseName, key)

    try {
      const result = await processor(key)
      if (result.migrated) {
        report.summary.totalRecordsMigrated++
        phaseReport.recordsMigrated++
        logger.migration.recordMigrated(phaseName, key)
      } else if (result.skipped) {
        report.summary.totalRecordsSkipped++
        phaseReport.recordsSkipped++
        logger.migration.recordSkipped(phaseName, key, result.error)
      } else if (result.existing) {
        report.summary.totalRecordsExisting++
        phaseReport.recordsExisting++
        logger.migration.recordExisting(phaseName, key)
      }
      if (result.error) {
        report.errors.push({
          phase: phaseName,
          key,
          error: result.error,
          timestamp: new Date().toISOString(),
          severity: 'warn'
        })
        phaseReport.errors.push({
          phase: phaseName,
          key,
          error: result.error,
          timestamp: new Date().toISOString(),
          severity: 'warn'
        })
        logger.migration.error(phaseName, key, result.error)
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      report.errors.push({
        phase: phaseName,
        key,
        error: errorMsg,
        timestamp: new Date().toISOString(),
        severity: 'error'
      })
      phaseReport.errors.push({
        phase: phaseName,
        key,
        error: errorMsg,
        timestamp: new Date().toISOString(),
        severity: 'error'
      })
      report.summary.totalRecordsSkipped++
      logger.migration.error(phaseName, key, errorMsg)
    }
  }

  phaseReport.completedAt = new Date().toISOString()
  logger.migration.verify(phaseName, { report })

  return phaseReport
}

export async function migrateAllLocalStorageToDexie(
  options: MigrationOptions = {}
): Promise<MigrationReport> {
  const { dryRun = false, deleteLegacyAfterVerify = false, verifyOnly = false, storage = globalThis.localStorage } = options
  const report: MigrationReport = {
    startedAt: new Date().toISOString(),
    phases: [],
    summary: {
      totalRecordsFound: 0,
      totalRecordsMigrated: 0,
      totalRecordsSkipped: 0,
      totalRecordsExisting: 0,
      totalErrors: 0
    },
    errors: []
  }

  logger.migration.start('migration', 0)

  if (verifyOnly) {
    logger.info('Running migration in verify-only mode')
  }

  // Phase 1: exstate (exercise state per day)
  const phase1 = await runPhase('exstate', report, Object.keys(storage).filter(k => k.startsWith('exstate:')), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '{}')
    const [, date, exId] = key.split(':')
    const id = `${date}:${exId}`
    
    const existing = await checkExistingRecord(db, 'exerciseState', id)
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.exerciseState, {
      id: `${date}:${exId}`,
      date,
      exerciseId: exId,
      ...JSON.parse(storage.getItem(key) || '{}'),
      migratedAt: new Date().toISOString()
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase1)

  // Phase 2: recovery (legacy recovery checks)
  const phase2 = await runPhase('recovery', report, Object.keys(storage).filter(k => k.startsWith('recovery:')), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '{}')
    const [, date] = key.split(':')
    
    const existing = await checkExistingRecord(db, 'recoveryChecks', date)
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.recoveryChecks, {
      id: date,
      localDate: date,
      ...JSON.parse(storage.getItem(key) || '{}'),
      migratedAt: new Date().toISOString()
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase2)

  // Phase 3: session:override:, session:changed:, session:observation:
  const phase3 = await runPhase('session', report, Object.keys(storage).filter(k => 
    k.startsWith('session:override:') || 
    k.startsWith('session:changed:') || 
    k.startsWith('session:observation:')
  ), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '{}')
    const parts = key.split(':')
    const type = parts[1]
    const date = parts[2]
    
    if (type === 'override') {
      const existing = await checkExistingRecord(db, 'sessionOverrides', date)
      if (existing) {return { migrated: false, skipped: false, existing: true }}
      
      await safePut(db.sessionOverrides, {
        date,
        overrideDay: data,
        changed: null,
        observation: null,
      }, false)
    } else if (type === 'changed') {
      const existing = await checkExistingRecord(db, 'sessionChanges', date)
      if (existing) {return { migrated: false, skipped: false, existing: true }}
      
      await safePut(db.sessionChanges, {
        id: date,
        date,
        changeReason: data.reason,
        changeComment: data.comment,
        migratedAt: new Date().toISOString()
      }, false)
    } else if (type === 'observation') {
      const existing = await checkExistingRecord(db, 'sessionObservations', date)
      if (existing) {return { migrated: false, skipped: false, existing: true }}
      
      await safePut(db.sessionObservations, {
        id: date,
        date,
        ...JSON.parse(storage.getItem(key) || '{}'),
        migratedAt: new Date().toISOString()
      }, false)
    }
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase3)

  // Phase 4: nutri:diario (nutrition diary)
  const phase4 = await runPhase('nutri:diario', report, Object.keys(storage).filter(k => k.startsWith('nutri:diario:')), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '[]')
    const [, , date] = key.split(':')
    let anyMigrated = false
    
    for (const entry of data) {
      const id = `${date}:${entry.id || Date.now()}`
      const existing = await checkExistingRecord(db, 'nutritionDiary', id)
      if (existing) {continue}
      
      await safePut(db.nutritionDiary, {
        id: `${date}:${entry.id || Date.now()}`,
        date,
        ...entry,
        migratedAt: new Date().toISOString()
      }, false)
      anyMigrated = true
    }
    return { migrated: anyMigrated, skipped: false, existing: !anyMigrated }
  }, false)
  report.phases.push(phase4)

  // Phase 5: nutrition:adherence
  const phase5 = await runPhase('nutrition:adherence', report, Object.keys(storage).filter(k => k.startsWith('nutrition:adherence')), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '{}')
    const existing = await checkExistingRecord(db, 'nutritionAdherence', key)
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.nutritionAdherence, {
      id: key,
      ...JSON.parse(storage.getItem(key) || '{}'),
      migratedAt: new Date().toISOString()
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase5)

  // Phase 6: coachMemory (decisions)
  const phase6 = await runPhase('coachMemory', report, ['coachMemory'], async () => {
    const decisions = JSON.parse(storage.getItem('coachMemory') || '[]')
    let anyMigrated = false
    
    for (const d of decisions) {
      const existing = await checkExistingRecord(db, 'coachMemory', d.id)
      if (!existing) {
        await safePut(db.coachMemory, { ...d, migratedAt: new Date().toISOString() }, false)
        anyMigrated = true
      }
    }
    return { migrated: anyMigrated, skipped: false, existing: !anyMigrated }
  }, false)
  report.phases.push(phase6)

  // Phase 7: coachQA
  const phase7 = await runPhase('coachQA', report, ['coachQA'], async () => {
    const qa = JSON.parse(storage.getItem('coachQA') || '{}')
    let anyMigrated = false
    
    for (const [key, value] of Object.entries(qa)) {
      const existing = await checkExistingRecord(db, 'coachMemory', `qa:${key}`)
      if (existing) {continue}
      
      await safePut(db.coachMemory, {
        id: `qa:${key}`,
        type: 'qa',
        date: key,
        key,
        question: (value as any).question || '',
        answer: (value as any).answer || '',
        createdAt: (value as any).createdAt || new Date().toISOString(),
      }, false)
      anyMigrated = true
    }
    return { migrated: anyMigrated, skipped: false, existing: !anyMigrated }
  }, false)
  report.phases.push(phase7)

  // Phase 8: coachPrefs
  const phase8 = await runPhase('coachPrefs', report, ['coachPrefs'], async () => {
    const prefs = JSON.parse(storage.getItem('coachPrefs') || '{}')
    const existing = await checkExistingRecord(db, 'coachMemory', 'prefs:global')
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.coachMemory, {
      id: 'prefs:global',
      type: 'observation',
      date: new Date().toISOString().slice(0, 10),
      sessionId: 'prefs',
      sessionStatus: 'prefs',
      routineName: 'prefs',
      data: prefs,
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase8)

  // Phase 9: seed:done
  const phase9 = await runPhase('seed:done', report, ['seed:done'], async () => {
    const seedDone = storage.getItem('seed:done')
    if (!seedDone) {return { migrated: false, skipped: true, existing: false }}
    
    const existing = await checkExistingRecord(db, 'migrationStatus', 'seed:done')
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.migrationStatus, {
      id: 'seed:done',
      status: 'completed',
      completedAt: seedDone,
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase9)

  // Phase 10: hydration
  const phase10 = await runPhase('hydration', report, Object.keys(storage).filter(k => k.startsWith('hydration:')), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '{}')
    const [, date] = key.split(':')
    const id = `h:${date}:${Date.now()}`
    
    const existing = await checkExistingRecord(db, 'hydrationLogs', id)
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.hydrationLogs, {
      id: `h:${date}:${Date.now()}`,
      localDate: date,
      ...JSON.parse(storage.getItem(key) || '{}'),
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase10)

  // Phase 11: sync queue
  const phase11 = await runPhase('sync:queue', report, ['sync:queue'], async () => {
    const queue = JSON.parse(storage.getItem('sync:queue') || '[]')
    let anyMigrated = false
    
    for (const item of queue) {
      const existing = await checkExistingRecord(db, 'syncQueue', item.id)
      if (existing) {continue}
      
      await safePut(db.syncQueue, {
        ...item,
      }, false)
      anyMigrated = true
    }
    return { migrated: anyMigrated, skipped: false, existing: !anyMigrated }
  }, false)
  report.phases.push(phase11)

  // Phase 12: ExerciseGym cache
  const phase12 = await runPhase('exgym:cache', report, Object.keys(storage).filter(k => k.startsWith('exgym:')), async (key) => {
    const data = JSON.parse(storage.getItem(key) || '{}')
    const [, cacheKey] = key.split(':')
    
    const existing = await checkExistingRecord(db, 'exerciseGymCache', cacheKey)
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.exerciseGymCache, {
      key: cacheKey,
      data: JSON.parse(storage.getItem(key) || '{}').data,
      timestamp: JSON.parse(storage.getItem(key) || '{}').t,
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase12)

  // Phase 13: gym:partmap:v1
  const phase13 = await runPhase('gym:partmap:v1', report, ['gym:partmap:v1'], async () => {
    const partmap = storage.getItem('gym:partmap:v1')
    if (!partmap) {return { migrated: false, skipped: true, existing: false }}
    
    const existing = await checkExistingRecord(db, 'exerciseGymCache', 'partmap:v1')
    if (existing) {return { migrated: false, skipped: false, existing: true }}
    
    await safePut(db.exerciseGymCache, {
      key: 'partmap:v1',
      data: JSON.parse(partmap),
      timestamp: Date.now(),
    }, false)
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase13)

  // Phase 14: rutinas legacy
  const phase14 = await runPhase('rutinas:legacy', report, ['rutinas:legacy'], async () => {
    let anyMigrated = false
    
    const rutinasList = storage.getItem('rutinas:list')
    if (rutinasList) {
      const list = JSON.parse(rutinasList)
      for (const r of list) {
        const existing = await checkExistingRecord(db, 'routineStore', r.id)
        if (!existing) {
          await safePut(db.routineStore, { ...r }, false)
          anyMigrated = true
        }
      }
    }

    const activeId = storage.getItem('rutina:activeId')
    if (activeId) {
      const now = new Date().toISOString()
      const existing = await checkExistingRecord(db, 'routineStore', 'meta:activeId')
      if (!existing) {
        await safePut(db.routineStore, {
          id: 'meta:activeId',
          activeId,
          createdAt: now,
          updatedAt: now,
        }, false)
        anyMigrated = true
      }
    }
    return { migrated: true, skipped: false, existing: false }
  }, false)
  report.phases.push(phase14)

  // Calculate summary
  for (const phase of report.phases) {
    report.summary.totalRecordsFound += phase.recordsFound
    report.summary.totalRecordsMigrated += phase.recordsMigrated
    report.summary.totalRecordsSkipped += phase.recordsSkipped
    report.summary.totalRecordsExisting += phase.recordsExisting
    report.summary.totalErrors += phase.errors.length
    report.errors.push(...phase.errors)
  }

  report.completedAt = new Date().toISOString()
  logger.migration.complete(report.summary.totalRecordsMigrated, report.summary.totalErrors)

  return report
}

export async function verifyMigration(): Promise<{ verified: boolean; issues: string[] }> {
  const issues: string[] = []
  
  // Verify each phase has data in Dexie
  const checks = [
    { table: 'exerciseState', name: 'exstate' },
    { table: 'recoveryChecks', name: 'recovery' },
    { table: 'sessionOverrides', name: 'session:override' },
    { table: 'sessionChanges', name: 'session:changed' },
    { table: 'sessionObservations', name: 'session:observation' },
    { table: 'nutritionDiary', name: 'nutri:diario' },
    { table: 'nutritionAdherence', name: 'nutrition:adherence' },
    { table: 'coachMemory', name: 'coachMemory' },
    { table: 'migrationStatus', name: 'seed:done' },
    { table: 'hydrationLogs', name: 'hydration' },
    { table: 'syncQueue', name: 'sync:queue' },
    { table: 'exerciseGymCache', name: 'exgym:cache' },
    { table: 'routineStore', name: 'rutinas:legacy' },
  ]

  for (const { table, name } of checks) {
    try {
      const count = await (db as any)[table].count()
      if (count === 0) {
        issues.push(`${name}: No records found in ${table}`)
      }
    } catch (e) {
      issues.push(`${name}: Error checking ${table} - ${e}`)
    }
  }

  return { verified: issues.length === 0, issues }
}

export async function cleanupLegacyLocalStorage(storage: Storage = globalThis.localStorage): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = []
  let deleted = 0

  const legacyKeys = Object.keys(storage).filter(k => 
    k.startsWith('exstate:') ||
    k.startsWith('recovery:') ||
    k.startsWith('session:override:') ||
    k.startsWith('session:changed:') ||
    k.startsWith('session:observation:') ||
    k.startsWith('nutri:diario:') ||
    k.startsWith('nutrition:adherence') ||
    k.startsWith('coachMemory') ||
    k.startsWith('coachQA') ||
    k.startsWith('coachPrefs') ||
    k.startsWith('seed:done') ||
    k.startsWith('hydration:') ||
    k.startsWith('sync:queue') ||
    k.startsWith('exgym:') ||
    k === 'gym:partmap:v1' ||
    k === 'rutinas:list' ||
    k === 'rutina:activeId' ||
    k === 'seed:done'
  )

  for (const key of legacyKeys) {
    try {
      storage.removeItem(key)
      deleted++
    } catch (e) {
      errors.push(`Failed to delete ${key}: ${e}`)
    }
  }

  return { deleted, errors }
}