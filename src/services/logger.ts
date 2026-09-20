// Centralized Logger for Althea
// Provides structured logging with levels, context, and operation tracking

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  operationId?: string
  operation?: string
  error?: {
    name: string
    message: string
    stack?: string
  }
}

type LogListener = (entry: LogEntry) => void

class Logger {
  private listeners: LogListener[] = []
  private minLevel: LogLevel = 'debug'
  private operationStack: string[] = []
  
  private levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  }

  setMinLevel(level: LogLevel) {
    this.minLevel = level
  }

  addListener(listener: LogListener) {
    this.listeners.push(listener)
  }

  removeListener(listener: LogListener) {
    const idx = this.listeners.indexOf(listener)
    if (idx >= 0) {this.listeners.splice(idx, 1)}
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel]
  }

  private createEntry(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      operationId: this.operationStack[this.operationStack.length - 1],
      operation: this.operationStack.length > 0 ? this.operationStack.join(' > ') : undefined,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    if (!this.shouldLog(level)) {return}
    
    const entry = this.createEntry(level, message, context, error)
    
    // Console output for development
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]${entry.operation ? ` [${entry.operation}]` : ''}`
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : level === 'info' ? console.info : console.log
    consoleMethod(prefix, message, context || '', error || '')
    
    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry)
      } catch { /* noop */ }
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, any>, error?: Error) {
    this.log('info', message, context, error)
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, any>, error?: Error) {
    this.log('error', message, context, error)
  }

  // Operation tracking
  startOperation(name: string): string {
    const operationId = `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    this.operationStack.push(operationId)
    this.info(`Operation started: ${name}`, { operationId })
    return operationId
  }

  endOperation(operationId: string, success: boolean = true, error?: Error): Promise<void> {
    const idx = this.operationStack.indexOf(operationId)
    if (idx >= 0) {
      this.operationStack.splice(idx, 1)
    }
    this.info(`Operation ${success ? 'completed' : 'failed'}: ${operationId}`, { success }, error)
    return Promise.resolve()
  }

  withOperation<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const operationId = this.startOperation(name)
    return fn()
      .then(result => {
        this.endOperation(operationId, true)
        return result
      })
      .catch(error => {
        this.endOperation(operationId, false, error)
        throw error
      })
  }

  // Convenience methods for common patterns
  migration = {
    start: (phase: string, keyCount: number) => 
      this.info(`Migration started: ${phase}`, { phase, keyCount, event: 'migration:start' }),
    scan: (phase: string, keyCount: number) => 
      this.info(`Scanning ${phase}`, { phase, keyCount, event: 'migration:scan' }),
    recordFound: (phase: string, key: string) => 
      this.debug(`Record found: ${key}`, { phase, key, event: 'migration:record-found' }),
    recordMigrated: (phase: string, key: string) => 
      this.info(`Record migrated: ${key}`, { phase, key, event: 'migration:record-migrated' }),
    recordSkipped: (phase: string, key: string, reason?: string) => 
      this.warn(`Record skipped: ${key}`, { phase, key, reason, event: 'migration:record-skipped' }),
    recordExisting: (phase: string, key: string) => 
      this.info(`Record already exists: ${key}`, { phase, key, event: 'migration:record-existing' }),
    error: (phase: string, key: string, error: Error | string) => 
      this.error(`Migration error in ${phase}: ${key}`, { phase, key, event: 'migration:error' }, error instanceof Error ? error : new Error(String(error))),
    verify: (phase: string, details: any) => 
      this.info(`Verifying ${phase}`, { phase, ...details, event: 'migration:verify' }),
    complete: (totalMigrated: number, totalErrors: number) => 
      this.info(`Migration complete`, { totalMigrated, totalErrors, event: 'migration:complete' })
  }

  dexie = {
    error: (operation: string, error: Error, context?: Record<string, any>) => 
      this.error(`Dexie error in ${operation}`, { operation, ...context, event: 'dexie:error' }, error),
    transactionStart: (tables: string[]) => 
      this.debug(`Transaction started`, { tables, event: 'dexie:transaction:start' }),
    transactionCommit: (tables: string[]) => 
      this.info(`Transaction committed`, { tables, event: 'dexie:transaction:commit' }),
    transactionAbort: (tables: string[], error: Error) => 
      this.error(`Transaction aborted`, { tables, event: 'dexie:transaction:abort' }, error)
  }

  ui = {
    error: (component: string, error: Error, context?: Record<string, any>) => 
      this.error(`UI error in ${component}`, { component, ...context, event: 'ui:error' }, error),
    renderError: (component: string, error: Error, context?: Record<string, any>) => 
      this.error(`Render error in ${component}`, { component, ...context, event: 'ui:render:error' }, error),
    lifecycleError: (component: string, phase: string, error: Error) => 
      this.error(`Lifecycle error in ${component}.${phase}`, { component, phase, event: 'ui:lifecycle:error' }, error)
  }

  performance = {
    measure: (name: string, duration: number, context?: Record<string, any>) => 
      this.debug(`Performance: ${name} took ${duration}ms`, { name, duration, ...context, event: 'perf:measure' }),
    slow: (name: string, duration: number, threshold: number, context?: Record<string, any>) => 
      this.warn(`Slow operation: ${name} took ${duration}ms (threshold: ${threshold}ms)`, { name, duration, threshold, ...context, event: 'perf:slow' })
  }

  // Get all logs (for debugging/export)
  getLogs(): LogEntry[] {
    // In a real implementation, this would return stored logs
    // For now, we just return empty as we don't persist logs by default
    return []
  }

  // Export logs as JSON
  exportLogs(): string {
    return JSON.stringify(this.getLogs(), null, 2)
  }
}

// Singleton instance
export const logger = new Logger()

// Convenience export for common usage
export const { debug, info, warn, error } = logger