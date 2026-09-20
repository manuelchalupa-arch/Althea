# Política de Manejo de Errores - Althea

## Niveles de Error

### 1. Error Recuperable (Recoverable)
**Definición**: Error que no compromete la integridad de los datos y permite que la operación continúe o se reintente.

**Ejemplos**:
- Fallo de red temporal en petición a API externa
- Error de validación de entrada de usuario
- Timeout de petición no crítica
- Error de caché (fallback a datos locales)

**Manejo**:
1. Registrar con `logger.warn()` con contexto completo
2. Mostrar mensaje amigable al usuario
3. Permitir reintento o continuar con funcionalidad degradada
4. No perder datos persistidos en Dexie

```typescript
try {
  await apiCall()
} catch (error) {
  logger.warn('Operación fallida, reintentando...', { operation: 'sync', error })
  // Permitir reintento o fallback
}
```

---

### 2. Error Crítico de Operación (Critical Operation)
**Definición**: Error que impide completar una operación específica pero no corrompe los datos existentes.

**Ejemplos**:
- Fallo al guardar una sesión de entrenamiento nueva
- Error al crear un ejercicio personalizado
- Fallo en migración de un registro específico
- Error de constraint único en Dexie (duplicado)

**Manejo**:
1. Registrar con `logger.error()` con contexto completo (operación, entidad, tabla)
2. Detener la operación actual
3. Mantener datos existentes intactos en Dexie
4. Mostrar error específico al usuario con acción sugerida
5. Permitir que el usuario reintente o cancele

```typescript
try {
  await db.trainingSessions.put(session)
} catch (error) {
  const classified = DexieErrorHandler.classifyError(error)
  if (classified.type === 'constraint') {
    logger.error('Sesión duplicada', { sessionId: session.id, error })
    throw new UserError('Esta sesión ya existe', 'DUPLICATE_SESSION')
  }
  logger.error('Error guardando sesión', { sessionId: session.id }, error)
  throw error
}
```

---

### 3. Error Crítico de Integridad/Persistencia (Critical Integrity)
**Definición**: Error que compromete la integridad de los datos o la disponibilidad de la base de datos.

**Ejemplos**:
- Error de cuota de almacenamiento excedida (QuotaExceededError)
- Base de datos corrupta o no accesible
- Error de migración de esquema (versionado)
- Base de datos cerrada inesperadamente

**Manejo**:
1. Registrar con `logger.error()` con contexto completo
2. **Detener inmediatamente** la operación
3. **NO eliminar** datos legacy de localStorage
4. Informar al usuario que se requiere intervención
5. No permitir continuar hasta resolver

```typescript
try {
  await db.open()
} catch (error) {
  if (DexieErrorHandler.isStorageError(error)) {
    logger.error('Almacenamiento lleno', { error }, error)
    throw new CriticalError('Almacenamiento insuficiente. Libera espacio e intenta de nuevo.', 'STORAGE_FULL')
  }
  if (DexieErrorHandler.isDatabaseClosedError(error)) {
    logger.error('Base de datos no accesible', { error }, error)
    throw new CriticalError('Base de datos no disponible. Reinicia la app.', 'DB_UNAVAILABLE')
  }
  throw error
}
```

---

## Clasificación Automática de Errores Dexie

Usar `DexieErrorHandler.classifyError(error)` que devuelve:

```typescript
{
  type: 'constraint' | 'transaction' | 'storage' | 'database' | 'version' | 'unknown',
  recoverable: boolean,
  message: string
}
```

---

## Regla de Oro: No Eliminar Datos Legacy Hasta Verificar

**REGLA ABSOLUTA**: Nunca eliminar claves de `localStorage` legacy hasta:
1. Migrar → verificar → confirmar integridad
2. Solo entonces ejecutar `cleanupLegacyLocalStorage()`
3. Mantener ventana de seguridad de al menos 7 días

```typescript
// INCORRECTO - Elimina antes de verificar
await migrateAllLocalStorageToDexie()
cleanupLegacyLocalStorage() // ❌ PELIGROSO

// CORRECTO - Verifica primero
const report = await migrateAllLocalStorageToDexie()
const verified = await verifyMigration()
if (verified.verified) {
  await cleanupLegacyLocalStorage() // ✅ SEGURO
}
```

---

## Integración con Logger Centralizado

Usar métodos específicos del logger para migración:

```typescript
logger.migration.start('exstate', keys.length)
logger.migration.recordFound('exstate', key)
logger.migration.recordMigrated('exstate', key)
logger.migration.recordSkipped('exstate', key, reason)
logger.migration.recordExisting('exstate', key)
logger.migration.error('exstate', key, error)
logger.migration.verify('exstate', { report })
logger.migration.complete(totalMigrated, totalErrors)
```

Para Dexie:
```typescript
logger.dexie.error('put:session', error, { table: 'trainingSessions', entityId })
logger.dexie.transactionStart(['trainingSessions'])
logger.dexie.transactionCommit(['trainingSessions'])
logger.dexie.transactionAbort(['trainingSessions'], error)
```

Para UI:
```typescript
logger.ui.error('Entrenar', error, { componentStack })
logger.ui.renderError('ExerciseHeader', error)
logger.ui.lifecycleError('Entrenar', 'mount', error)
```

---

## Convención de Niveles de Log

| Nivel | Uso | Ejemplo |
|-------|-----|---------|
| `debug` | Diagnóstico detallado, solo desarrollo | `logger.debug('Cache hit', { key })` |
| `info` | Eventos importantes normales | `logger.info('Sesión iniciada', { sessionId })` |
| `warn` | Recuperable, atención necesaria | `logger.warn('Reintento 2/3', { attempt: 2 })` |
| `error` | Fallo que requiere atención | `logger.error('Fallo guardado', { sessionId }, error)` |

---

## Reglas de Oro

1. **Nunca** usar `console.log/error/warn` directamente en código nuevo
2. **Siempre** incluir contexto: `operation`, `entityId`, `table`, `userId`
3. **Nunca** loggear datos sensibles completos (tokens, passwords, PII)
4. **Siempre** usar `logger.migration.*` para migración
5. **Siempre** usar `logger.dexie.*` para operaciones Dexie
6. **Siempre** usar `logger.ui.*` para errores de UI
7. **Nunca** tragar errores silenciosamente (`catch {}` sin log)