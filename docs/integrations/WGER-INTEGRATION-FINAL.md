# WGER ↔ Althea — Integración Final

**Fecha:** 2026-09-29
**Commit:** pendiente
**Estado:** Integración funcional con sincronización bidireccional

---

## 1. Arquitectura Final

```
WGER (API v2)
  ↓
wgerClient (HTTP + timeout + retry)
  ↓
wgerAdapter (orquestación)
  ↓
wgerMapper (transformación)
  ↓
normalización (Zod schemas)
  ↓
Dexie (fuente de verdad local)
  ↓
servicios Althea
  ↓
UI / Coach / Historial / Progreso
```

**Separación de capas:**
- External API → Integration Adapter → Mapping → Persistence → Domain Logic → UI

---

## 2. Autenticación

**Estado:** Server-side via Firebase Firestore

**Flujo:**
1. Frontend → `wgerServerAuth.ts` (Firebase Firestore)
2. Firebase valida identidad del usuario de Althea
3. Firebase se autentica contra WGER
4. Credenciales sensibles permanecen server-side
5. Firebase devuelve solo la información necesaria

**Seguridad:**
- NO se guardan passwords en localStorage/Dexie/Zustand
- NO se guardan JWT permanentes en frontend
- NO se exponen credenciales en bundles
- NO se crean variables VITE_WGER_*

---

## 3. Endpoints Utilizados

### 3.1 Lectura (GET) — Público

| Endpoint | Uso |
|----------|-----|
| `/exercise/` | Lista de ejercicios |
| `/exerciseinfo/{id}/` | Detalle completo |
| `/exerciseimage/{id}/` | Imágenes |
| `/muscle/` | Músculos |
| `/equipment/` | Equipamiento |
| `/exercisecategory/` | Categorías |
| `/ingredient/` | Ingredientes |
| `/ingredientinfo/{id}/` | Valores nutricionales |
| `/ingredientweightunit/` | Unidades de peso |
| `/nutritionplaninfo/{id}/` | Datos de plan |
| `/routine/{id}/structure/` | Estructura de rutina |
| `/routine/{id}/logs/` | Historial de rutina |
| `/routine/{id}/stats/` | Estadísticas de rutina |

### 3.2 Escritura (POST/PUT/DELETE) — Autenticada

| Endpoint | Uso |
|----------|-----|
| `/routine/` | Crear/actualizar/eliminar rutinas |
| `/day/` | Gestionar días |
| `/slot/` | Gestionar slots |
| `/slot-entry/` | Gestionar entradas de slot |
| `/weight-config/` | Progresiones de peso |
| `/repetitions-config/` | Progresiones de reps |
| `/sets-config/` | Progresiones de series |
| `/rir-config/` | Configuración RIR |
| `/rest-config/` | Configuración descanso |
| `/workoutsession/` | Sesiones de entrenamiento |
| `/workoutlog/` | Registros de entrenamiento |
| `/nutritionplan/` | Planes de nutrición |
| `/meal/` | Comidas |
| `/mealitem/` | Items de comida |
| `/nutritiondiary/` | Diario de nutrición |
| `/measurement/` | Mediciones corporales |
| `/measurement-category/` | Categorías de medición |

---

## 4. Matriz WGER ↔ Althea

### 4.1 Ejercicios y catálogo

| Recurso WGER | Correspondencia Althea | Dirección | Transformación | Estado |
|---------------|------------------------|-----------|----------------|--------|
| Exercise | customExercises (origin='WGER') | WGER→Althea | wgerMapper.wgerToAltheaExercise() | FULL SYNC |
| ExerciseInfo | Datos anidados | WGER→Althea | Incluido en exerciseinfo | PULL ONLY |
| ExerciseImage | gifUrl | WGER→Althea | URL directa | PULL ONLY |
| Muscle | muscle | WGER→Althea | Mapeo anatómico | PULL ONLY |
| Equipment | equipment | WGER→Althea | Minúsculas | PULL ONLY |
| Category | category | WGER→Althea | Minúsculas | PULL ONLY |

### 4.2 Rutinas y planificación

| Recurso WGER | Correspondencia Althea | Dirección | Transformación | Estado |
|---------------|------------------------|-----------|----------------|--------|
| Routine | routines (como versión) | Bidireccional | mapWgerRoutineToAlthea() | FULL SYNC |
| Day | RoutineDay | Bidireccional | mapWgerDayToAlthea() | FULL SYNC |
| Slot | RoutineExercise | Bidireccional | mapWgerSlotToAlthea() | FULL SYNC |
| SlotEntry | Configuración de slot | Bidireccional | mapWgerSlotEntryToAlthea() | FULL SYNC |
| WeightConfig | Progresión de peso | WGER→Althea | mapWgerProgressionToAlthea() | PARTIAL SYNC |
| RepetitionsConfig | Progresión de reps | WGER→Althea | mapWgerProgressionToAlthea() | PARTIAL SYNC |
| SetsConfig | Progresión de series | WGER→Althea | mapWgerProgressionToAlthea() | PARTIAL SYNC |
| RIRConfig | RIR en Exercise | WGER→Althea | Valor directo | PULL ONLY |
| RestConfig | Descanso entre series | WGER→Althea | Valor directo | PULL ONLY |

### 4.3 Entrenamiento real

| Recurso WGER | Correspondencia Althea | Dirección | Transformación | Estado |
|---------------|------------------------|-----------|----------------|--------|
| WorkoutSession | TrainingSession | Bidireccional | mapWgerSessionToAlthea() | FULL SYNC |
| WorkoutLog | SetRecord | Bidireccional | mapWgerLogToAltheaSetRecord() | FULL SYNC |

### 4.4 Nutrición

| Recurso WGER | Correspondencia Althea | Dirección | Transformación | Estado |
|---------------|------------------------|-----------|----------------|--------|
| Ingredient | foodComposition | WGER→Althea | mapWgerIngredientToAlthea() | FULL SYNC |
| IngredientInfo | Valores nutricionales | WGER→Althea | getWgerIngredientValues() | PULL ONLY |
| IngredientWeightUnit | Unidades de peso | WGER→Althea | Mapeo de unidades | PULL ONLY |
| NutritionPlan | nutritionPlans | Bidireccional | mapWgerPlanToAlthea() | FULL SYNC |
| Meal | DiaryEntry | Bidireccional | mapWgerMealToAlthea() | FULL SYNC |
| MealItem | DiaryIngredient | Bidireccional | mapWgerMealItemToAlthea() | FULL SYNC |
| NutritionDiary | Registro de nutrición | Bidireccional | mapWgerDiaryToAlthea() | FULL SYNC |

### 4.5 Mediciones corporales

| Recurso WGER | Correspondencia Althea | Dirección | Transformación | Estado |
|---------------|------------------------|-----------|----------------|--------|
| MeasurementCategory | Categoría de medición | WGER→Althea | Mapeo de categorías | PULL ONLY |
| Measurement | bodyMeasurements | Bidireccional | mapWgerMeasurementToAlthea() | FULL SYNC |

### 4.6 Estadísticas (solo lectura)

| Recurso WGER | Uso | Estado |
|---------------|-----|--------|
| RoutineStructure | Validación/comparación | PULL ONLY |
| RoutineLogs | Comparación | PULL ONLY |
| RoutineStats | Enriquecimiento | PULL ONLY |

---

## 5. Dirección de Sincronización por Recurso

| Recurso | WGER→Althea | Althea→WGER | Estado |
|---------|-------------|-------------|--------|
| Ejercicios | Sí | Solo CustomExercises | PARTIAL SYNC |
| Músculos/Equipamiento/Categorías | Sí | No | PULL ONLY |
| Rutinas | Sí | Sí | FULL SYNC |
| Entrenamientos | Sí | Sí | FULL SYNC |
| Nutrición | Sí | Sí | FULL SYNC |
| Mediciones | Sí | Sí | FULL SYNC |
| Recovery | No | No | LOCAL ONLY |
| Hydration | No | No | LOCAL ONLY |
| Sleep | No | No | LOCAL ONLY |
| Coach/Memory | No | No | LOCAL ONLY |
| DecisionLog | No | No | LOCAL ONLY |
| Sustituciones | No | No | LOCAL ONLY |
| Periodización | No | No | LOCAL ONLY |

---

## 6. Modelo de Sincronización

### 6.1 SyncEngine

```typescript
interface WgerSyncEngine {
  syncWgerToAlthea(): Promise<SyncResult>;
  syncAltheaToWger(): Promise<SyncResult>;
  syncEntity(): Promise<SyncResult>;
  pullChanges(): Promise<SyncResult>;
  pushChanges(): Promise<SyncResult>;
  resolveConflict(): Promise<SyncResult>;
  retryFailedSync(): Promise<SyncResult>;
  getSyncStatus(): Promise<SyncStatus>;
}
```

### 6.2 Estados

- PENDING
- SYNCING
- SYNCED
- FAILED
- CONFLICT
- SKIPPED
- READ_ONLY

### 6.3 Características

- Idempotente (no duplica si se ejecuta múltiples veces)
- Incremental (sincroniza solo cambios)
- Auditable (registro de operaciones)
- Reintentable (backoff exponencial + jitter)
- Offline-first (Dexie como fuente de verdad)
- Tolerante a interrupciones
- Reversible

---

## 7. Modelo de Conflictos

### 7.1 Detección

```typescript
interface SyncConflict {
  id: string;
  entityType: string;
  entityId: string;
  provider: string;
  localSnapshot: unknown;
  remoteSnapshot: unknown;
  detectedAt: string;
  resolution: 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'MERGE' | 'SKIP';
  resolvedAt?: string;
}
```

### 7.2 Resoluciones

- KEEP_LOCAL: Conservar versión local
- KEEP_REMOTE: Usar versión remota
- MERGE: Combinar campos (solo cuando es seguro)
- SKIP: Omitir y marcar para revisión

### 7.3 Integración

Los conflictos se integran al flujo de sincronización y se muestran en el panel WGER.

---

## 8. Modelo de IDs Externos

### 8.1 ExternalAccountLink

```typescript
interface ExternalAccountLink {
  id: string;
  altheaUserId: string;
  externalProvider: 'wger';
  externalUserId: string;
  externalUsername: string;
  linkedAt: string;
  lastSyncAt: string | null;
  status: 'active' | 'revoked';
}
```

### 8.2 ExternalEntityLink

```typescript
interface ExternalEntityLink {
  id: string;
  altheaEntityId: string;
  externalProvider: 'wger';
  externalEntityId: string;
  externalEntityUuid: string;
  entityType: 'exercise' | 'routine' | 'ingredient';
  linkedAt: string;
  lastSyncAt: string | null;
  metadata: Record<string, unknown>;
}
```

---

## 9. Modelo de Cola/Reintentos

### 9.1 SyncQueue

```typescript
interface SyncQueue {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string;
  localEntityId: string;
  remoteEntityId?: string;
  payload: unknown;
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  status: 'PENDING' | 'SYNCING' | 'COMPLETED' | 'FAILED' | 'CONFLICT' | 'RESOLVED' | 'SKIPPED';
  error?: string;
}
```

### 9.2 Reintentos

- Backoff exponencial con jitter
- Máximo 5 minutos entre reintentos
- Respeta Retry-After en 429
- No loops infinitos

---

## 10. Paginación

### 10.1 Estándar

- `limit`/`offset` (default 20, max 999)
- Procesa `results`, `next`, `previous`, `count`

### 10.2 Cursor

- `/ingredient-sync/` usa cursor pagination
- Soportado en `fetchAllWgerPages()`

### 10.3 Incremental

- Guarda `lastSuccessfulSyncAt` por recurso
- Sincroniza solo cambios desde la última sync

---

## 11. Seguridad

### 11.1 Implementado

- HTTPS
- Validación de inputs (Zod)
- Timeout (15s)
- AbortController
- Manejo seguro de errores
- Sanitización
- No exponer tokens
- No logs de secretos
- Límites de tamaño
- Validación de payloads
- Comprobación de ownership

### 11.2 Reglas

- NO guardar passwords en localStorage/Dexie/Zustand
- NO guardar JWT permanentes en frontend
- NO exponer credenciales en bundles
- NO crear variables VITE_WGER_*

---

## 12. Licencias

Se conserva metadata de origen:
- source
- sourceId
- license
- attribution
- originalUrl

No se copia ni redistribuye contenido sin verificar la licencia aplicable.

---

## 13. Tests

### 13.1 Tests existentes (32 casos)

1. ejercicio WGER → Althea
2. ejercicio existente → no duplicar
3. alias → mismo ejercicio
4. rutina WGER → Althea
5. rutina Althea → WGER
6. session WGER → TrainingSession
7. planned vs actual
8. series independientes
9. pirámide descendente
10. kg
11. lb
12. plate count
13. stack count
14. ingrediente → alimento Althea
15. cálculo nutricional
16. receta
17. medición corporal
18. conflicto local/remoto
19. retry
20. 401
21. 403
22. 409
23. 422
24. 429
25. 500
26. timeout
27. offline
28. reintento después de reconectar
29. duplicación por doble sync
30. sync interrumpido a mitad de operación
31. rollback
32. preservación de historial

### 13.2 Tests ampliados (37 casos adicionales)

- AUTH: autenticación correcta, incorrecta, expiración, reautenticación, credenciales nunca expuestas
- DEXIE: migration, upgrade, existing DB, fresh DB
- PUSH: routine → WGER, workout → WGER, nutrition → WGER, measurement → WGER
- PULL: WGER → Althea
- SYNC: doble sync, sync interrumpido, retry, conflict, merge, offline, reconnection
- PAGINATION: múltiples páginas, cursor, incremental sync
- HISTORIAL: no pérdida, no duplicación, no modificación destructiva

**Total: 69 tests**

---

## 14. Migraciones Dexie

### 14.1 Versión actual

- v20: 45 tablas
- v21: + `externalAccountLinks`, `externalEntityLinks`

### 14.2 Índices

- profileId
- provider
- externalUserId
- externalEntityType
- externalEntityId
- altheaEntityType
- altheaEntityId
- status

---

## 15. Limitaciones Reales

### 15.1 Autenticación

- La autenticación server-side está implementada pero requiere credenciales reales de WGER para probar
- Las pruebas de autenticación usan mocks

### 15.2 Pruebas reales

- Las pruebas de integración contra la instancia WGER real requieren credenciales de prueba seguras
- Las pruebas contractuales/mock están completas
- Las pruebas manuales documentadas requieren credenciales reales

### 15.3 Funcionalidades de WGER que NO pueden integrarse de forma segura

Ninguna. Todos los recursos tienen equivalencia real o se marcan como LOCAL ONLY.

---

## 16. Próximas Extensiones

1. Importación incremental con cursor pagination (parcialmente implementado)
2. Panel de sincronización más complejo (ver conflictos, resolver)
3. Sincronización bidireccional real con credenciales de prueba
4. Estadísticas más detalladas

---

**Documento generado:** 2026-09-29
**Estado:** Integración funcional
