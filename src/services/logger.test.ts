import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { logger, type LogEntry } from '@/services/logger'

// Contrato estructural del logger: warn/error se escriben a consola (política
// no-console de src); debug/info llegan al pipeline de listeners estructurados.
const captured: LogEntry[] = []
const listener = (entry: LogEntry) => { captured.push(entry) }
logger.addListener(listener)

const levels = () => captured.map(e => e.level)
const hasLevel = (level: LogEntry['level']) => captured.some(e => e.level === level)
const hasEvent = (event: string) => captured.some(e => e.context?.event === event)

describe('Logger', () => {
  beforeEach(() => {
    captured.length = 0
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterAll(() => {
    logger.removeListener(listener)
  })

  it('debe loguear debug por el pipeline de listeners (no a consola)', () => {
    logger.debug('test message', { key: 'value' })
    expect(hasLevel('debug')).toBe(true)
    expect(captured[captured.length - 1]?.message).toBe('test message')
    expect(captured[captured.length - 1]?.context).toEqual({ key: 'value' })
    expect(console.debug).not.toHaveBeenCalled()
  })

  it('debe loguear info por el pipeline de listeners (no a consola)', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info')
    logger.info('test message', { key: 'value' })
    expect(hasLevel('info')).toBe(true)
    expect(captured[captured.length - 1]?.message).toBe('test message')
    expect(consoleInfoSpy).not.toHaveBeenCalled()
  })

  it('debe loguear warn', () => {
    logger.warn('test message', { key: 'value' })
    expect(console.warn).toHaveBeenCalled()
  })

  it('debe loguear error con Error object', () => {
    const error = new Error('test error')
    logger.error('test message', { key: 'value' }, error)
    expect(console.error).toHaveBeenCalled()
  })

  it('debe loguear error con string', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error')
    logger.error('test message', { key: 'value' }, new Error('string error'))
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('debe manejar operación completa', async () => {
    const operationId = logger.startOperation('test-op')
    
    await logger.endOperation(operationId, true)
    // No verificar stack interno - es privado
  })

  it('debe manejar operación fallida', async () => {
    const operationId = logger.startOperation('test-op')
    
    await expect(logger.endOperation(operationId, false, new Error('fail'))).resolves.not.toThrow()
  })

  it('withOperation debe completar exitosamente', async () => {
    const result = await logger.withOperation('test-op', async () => 'success')
    expect(result).toBe('success')
  })

  it('withOperation debe propagar error', async () => {
    await expect(logger.withOperation('test-op', async () => {
      throw new Error('fail')
    })).rejects.toThrow('fail')
  })

  it('migration helpers deben loguear correctamente', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn')
    const consoleErrorSpy = vi.spyOn(console, 'error')
    
    logger.migration.start('test-phase', 5)
    logger.migration.recordFound('test-phase', 'key1')
    logger.migration.recordMigrated('test-phase', 'key1')
    logger.migration.recordSkipped('test-phase', 'key2', 'reason')
    logger.migration.recordExisting('test-phase', 'key3')
    logger.migration.error('test-phase', 'key1', 'error message')
    logger.migration.verify('test-phase', { test: true })
    logger.migration.complete(10, 0)
    
    expect(hasEvent('migration:start')).toBe(true)
    expect(hasEvent('migration:record-found')).toBe(true)
    expect(hasEvent('migration:record-migrated')).toBe(true)
    expect(hasEvent('migration:record-skipped')).toBe(true)
    expect(hasEvent('migration:record-existing')).toBe(true)
    expect(hasEvent('migration:error')).toBe(true)
    expect(hasEvent('migration:verify')).toBe(true)
    expect(hasEvent('migration:complete')).toBe(true)
    expect(levels().filter(l => l === 'info').length).toBeGreaterThan(0)
    expect(hasLevel('debug')).toBe(true)
    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

it('dexie helpers deben loguear correctamente', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error')
    
    logger.dexie.error('put:session', new Error('fail'), { table: 'sessions' })
    logger.dexie.transactionStart(['sessions'])
    logger.dexie.transactionCommit(['sessions'])
    logger.dexie.transactionAbort(['sessions'], new Error('abort'))

    expect(hasEvent('dexie:error')).toBe(true)
    expect(hasEvent('dexie:transaction:start')).toBe(true)
    expect(hasEvent('dexie:transaction:commit')).toBe(true)
    expect(hasEvent('dexie:transaction:abort')).toBe(true)
    expect(hasLevel('debug')).toBe(true)
    expect(hasLevel('info')).toBe(true)
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('ui helpers deben loguear correctamente', () => {
    logger.ui.error('Entrenar', new Error('fail'), { component: 'ExerciseHeader' })
    logger.ui.renderError('ExerciseHeader', new Error('render fail'))
    logger.ui.lifecycleError('Entrenar', 'mount', new Error('mount fail'))
    
    expect(console.error).toHaveBeenCalled()
  })

  it('performance helpers deben loguear', () => {
    logger.performance.measure('test-op', 100, { context: 'test' })
    logger.performance.slow('slow-op', 2000, 1000, { context: 'test' })
    
    expect(hasEvent('perf:measure')).toBe(true)
    expect(hasLevel('debug')).toBe(true)
    expect(console.warn).toHaveBeenCalled()
  })
})