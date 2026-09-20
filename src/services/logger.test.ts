import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '@/services/logger'

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('debe loguear debug', () => {
    logger.debug('test message', { key: 'value' })
    expect(console.debug).toHaveBeenCalled()
  })

  it('debe loguear info', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info')
    logger.info('test message', { key: 'value' })
    expect(consoleInfoSpy).toHaveBeenCalled()
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
    const consoleInfoSpy = vi.spyOn(console, 'info')
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
    
    expect(consoleInfoSpy).toHaveBeenCalled()
    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

it('dexie helpers deben loguear correctamente', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info')
    const consoleDebugSpy = vi.spyOn(console, 'debug')
    const consoleErrorSpy = vi.spyOn(console, 'error')
    
    logger.dexie.error('put:session', new Error('fail'), { table: 'sessions' })
    logger.dexie.transactionStart(['sessions'])
    logger.dexie.transactionCommit(['sessions'])
    logger.dexie.transactionAbort(['sessions'], new Error('abort'))

    expect(consoleErrorSpy).toHaveBeenCalled()
    expect(consoleDebugSpy).toHaveBeenCalled()
    expect(consoleInfoSpy).toHaveBeenCalled()
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
    
    expect(console.debug).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })
})