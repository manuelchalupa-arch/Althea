# WGER ↔ Althea — Auditoría de Integración

**Fecha:** 2026-09-29
**URL base:** `https://wger.de/api/v2`
**Versión API:** 2.8.0-dev.0
**Estado actual:** Integración read-only de ejercicios (2 endpoints)

---

## 1. Estado Actual de la Integración

### 1.1 Componentes existentes

| Componente | Archivo | Estado |
|------------|---------|--------|
| `wgerClient` | `src/services/integrations/wger/wgerClient.ts` | Activo — 2 endpoints GET |
| `wgerAdapter` | `src/services/integrations/wger/wgerAdapter.ts` | Activo — importación a Dexie |
| `wgerMapper` | `src/services/integrations/wger/wgerMapper.ts` | Activo — mapeo de datos |
| `wgerTypes` | `src/services/integrations/wger/wgerTypes.ts` | Activo — tipos TypeScript |
| `wgerComparison` | `src/services/integrations/wger/wgerComparison.ts` | Activo — comparación de fuentes |

### 1.2 Endpoints utilizados actualmente

| Endpoint | Método | Uso |
|----------|--------|-----|
| `/exercise/` | GET | Lista de ejercicios (IDs) |
| `/exerciseinfo/{id}/` | GET | Detalle completo |

### 1.3 Autenticación

**No implementada.** La API es pública para GET. No se usan tokens.

### 1.4 Variables de entorno

**No existen.** URL base hardcodeada en `wgerClient.ts`.

### 1.5 Llamadas directas desde componentes

Solo `Biblioteca.tsx` llama a WGER directamente (a través del adapter).

---

## 2. Matriz Completa WGER ↔ Althea

### 2.1 Ejercicios y catálogo

| Recurso WGER | Endpoint | GET | POST | PATCH/PUT | DELETE | Auth | Correspondencia Althea | Dirección | Transformación | Riesgo |
|---------------|----------|-----|------|-----------|--------|------|------------------------|-----------|----------------|--------|
| Exercise | `/exercise/` | ✅ | ✅ | ✅ | ✅ | Write | `customExercises` (origin='WGER') | WGER→Althea | `wgerMapper.wgerToAltheaExercise()` | Bajo |
| ExerciseInfo | `/exerciseinfo/{id}/` | ✅ | ❌ | ❌ | ❌ | No | Datos anidados en ExerciseInfo | WGER→Althea | Ya incluido en exerciseinfo | Bajo |
| ExerciseImage | `/exerciseimage/{id}/` | ✅ | ❌ | ❌ | ❌ | No | `gifUrl` en Exercise | WGER→Althea | URL directa | Bajo |
| Muscle | `/muscle/` | ✅ | ❌ | ❌ | ❌ | No | `muscle` en Exercise | WGER→Althea | Mapeo anatómico (25 músculos) | Bajo |
| Equipment | `/equipment/` | ✅ | ❌ | ❌ | ❌ | No | `equipment` en Exercise | WGER→Althea | Minúsculas, default 'bodyweight' | Bajo |
| Category | `/exercisecategory/` | ✅ | ❌ | ❌ | ❌ | No | `category` en Exercise | WGER→Althea | Minúsculas | Bajo |

### 2.2 Rutinas y planificación

| Recurso WGER | Endpoint | GET | POST | PATCH/PUT | DELETE | Auth | Correspondencia Althea | Dirección | Transformación | Riesgo |
|---------------|----------|-----|------|-----------|--------|------|------------------------|-----------|----------------|--------|
| Routine | `/routine/` | ✅ | ✅ | ✅ | ✅ | Write | `routines` (como versión) | Bidireccional | `mapWgerRoutineToAlthea()` | Medio |
| Day | `/day/` | ✅ | ✅ | ✅ | ✅ | Write | `RoutineDay` | Bidireccional | `mapWgerDayToAlthea()` | Medio |
| Slot | `/slot/` | ✅ | ✅ | ✅ | ✅ | Write | `RoutineExercise` | Bidireccional | `mapWgerSlotToAlthea()` | Medio |
| SlotEntry | `/slot-entry/` | ✅ | ✅ | ✅ | ✅ | Write | Configuración de slot | Bidireccional | `mapWgerSlotEntryToAlthea()` | Medio |
| WeightConfig | `/weight-config/` | ✅ | ✅ | ✅ | ✅ | Write | Progresión de peso | WGER→Althea | `mapWgerProgressionToAlthea()` | Medio |
| RepetitionsConfig | `/repetitions-config/` | ✅ | ✅ | ✅ | ✅ | Write | Progresión de reps | WGER→Althea | `mapWgerProgressionToAlthea()` | Medio |
| SetsConfig | `/sets-config/` | ✅ | ✅ | ✅ | ✅ | Write | Progresión de series | WGER→Althea | `mapWgerProgressionToAlthea()` | Medio |
| RIRConfig | `/rir-config/` | ✅ | ✅ | ✅ | ✅ | Write | RIR en Exercise | WGER→Althea | Valor directo | Bajo |
| RestConfig | `/rest-config/` | ✅ | ✅ | ✅ | ✅ | Write | Descanso entre series | WGER→Althea | Valor directo | Bajo |

### 2.3 Entrenamiento real

| Recurso WGER | Endpoint | GET | POST | PATCH/PUT | DELETE | Auth | Correspondencia Althea | Dirección | Transformación | Riesgo |
|---------------|----------|-----|------|-----------|--------|------|------------------------|-----------|----------------|--------|
| WorkoutSession | `/workoutsession/` | ✅ | ✅ | ✅ | ✅ | Write | `TrainingSession` | Bidireccional | `mapWgerSessionToAlthea()` | Alto |
| WorkoutLog | `/workoutlog/` | ✅ | ✅ | ✅ | ✅ | Write | `SetRecord` | Bidireccional | `mapWgerLogToAlthea()` | Alto |

### 2.4 Nutrición

| Recurso WGER | Endpoint | GET | POST | PATCH/PUT | DELETE | Auth | Correspondencia Althea | Dirección | Transformación | Riesgo |
|---------------|----------|-----|------|-----------|--------|------|------------------------|-----------|----------------|--------|
| Ingredient | `/ingredient/` | ✅ | ✅ | ✅ | ✅ | Write | `foodComposition` (alimentos) | WGER→Althea | Normalización de valores | Medio |
| IngredientInfo | `/ingredientinfo/{id}/` | ✅ | ❌ | ❌ | ❌ | No | Valores nutricionales | WGER→Althea | Ya incluido en ingredientinfo | Bajo |
| IngredientWeightUnit | `/ingredientweightunit/` | ✅ | ❌ | ❌ | ❌ | No | Unidades de peso | WGER→Althea | Mapeo de unidades | Bajo |
| NutritionPlan | `/nutritionplan/` | ✅ | ✅ | ✅ | ✅ | Write | `nutritionPlans` | Bidireccional | `mapWgerPlanToAlthea()` | Alto |
| NutritionPlanInfo | `/nutritionplaninfo/{id}/` | ✅ | ❌ | ❌ | ❌ | No | Datos anidados | WGER→Althea | Ya incluido | Bajo |
| Meal | `/meal/` | ✅ | ✅ | ✅ | ✅ | Write | `DiaryEntry` | Bidireccional | `mapWgerMealToAlthea()` | Alto |
| MealItem | `/mealitem/` | ✅ | ✅ | ✅ | ✅ | Write | `DiaryIngredient` | Bidireccional | `mapWgerItemToAlthea()` | Alto |
| NutritionDiary | `/nutritiondiary/` | ✅ | ✅ | ✅ | ✅ | Write | Registro de nutrición | Bidireccional | `mapWgerDiaryToAlthea()` | Alto |

### 2.5 Mediciones corporales

| Recurso WGER | Endpoint | GET | POST | PATCH/PUT | DELETE | Auth | Correspondencia Althea | Dirección | Transformación | Riesgo |
|---------------|----------|-----|------|-----------|--------|------|------------------------|-----------|----------------|--------|
| MeasurementCategory | `/measurement-category/` | ✅ | ✅ | ✅ | ✅ | Write | Categoría de medición | WGER→Althea | Mapeo de categorías | Medio |
| Measurement | `/measurement/` | ✅ | ✅ | ✅ | ✅ | Write | `bodyMeasurements` | Bidireccional | `mapWgerMeasurementToAlthea()` | Medio |

### 2.6 Estadísticas (solo lectura)

| Recurso WGER | Endpoint | GET | POST | PATCH/PUT | DELETE | Auth | Correspondencia Althea | Dirección | Transformación | Riesgo |
|---------------|----------|-----|------|-----------|--------|------|------------------------|-----------|----------------|--------|
| RoutineStructure | `/routine/{id}/structure/` | ✅ | ❌ | ❌ | ❌ | No | Estructura de rutina | WGER→Althea | Solo validación | Bajo |
| RoutineLogs | `/routine/{id}/logs/` | ✅ | ❌ | ❌ | ❌ | No | Historial de rutina | WGER→Althea | Solo comparación | Bajo |
| RoutineStats | `/routine/{id}/stats/` | ✅ | ❌ | ❌ | ❌ | No | Estadísticas de rutina | WGER→Althea | Solo enriquecimiento | Bajo |

---

## 3. Clasificación de Datos

### 3.1 Sincronizables 1:1 (bajo riesgo)

- Exercise → CustomExercise (con provenance)
- Muscle → campo `muscle` en Exercise
- Equipment → campo `equipment` en Exercise
- Category → campo `category` en Exercise
- RIRConfig → RIR en Exercise
- RestConfig → descanso entre series

### 3.2 Requieren transformación (riesgo medio)

- Routine → Routine (como versión de Althea)
- Day → RoutineDay
- Slot → RoutineExercise
- SlotEntry → Configuración de slot
- WeightConfig/RepetitionsConfig/SetsConfig → Progresiones
- Ingredient → foodComposition (alimentos)
- Measurement → bodyMeasurements

### 3.3 Importación solo desde WGER (riesgo medio-alto)

- ExerciseImage → gifUrl
- IngredientInfo → valores nutricionales
- NutritionPlanInfo → datos anidados de plan

### 3.4 Exclusivos de Althea (NO sincronizar)

- TrainingSession (ejecución real)
- SessionExercise (ejercicios de sesión)
- SetRecord (series reales)
- ExerciseHistory (historial)
- Recovery (recuperación)
- Hydration (hidratación)
- Sleep (sueño)
- Coach (memoria y decisiones)
- CustomExercises (origin='USER_CREATED')
- Sustituciones
- Versionado y periodización

### 3.5 Sin equivalente seguro (NO sincronizar)

- WorkoutSession → TrainingSession (estructura diferente)
- WorkoutLog → SetRecord (estructura diferente)
- NutritionPlan → nutritionPlans (estructura diferente)
- Meal/MealItem → DiaryEntry/DiaryIngredient (estructura diferente)
- NutritionDiary → registro de nutrición (estructura diferente)

---

## 4. Autenticación

### 4.1 Estado actual

- **No implementada.** La API es pública para GET.
- No se usan tokens, API keys ni sesiones.

### 4.2 Recomendación

- **Datos públicos (GET):** Acceso directo seguro.
- **Operaciones autenticadas (POST/PATCH/DELETE):** Requieren capa server-side/proxy.
- **Preferencia:** Mi Althea → Firebase Function / backend seguro → WGER.
- **Credencial sensible:** Mantener server-side, nunca en frontend.

### 4.3 Limitación actual

Si la arquitectura actual no permite implementar correctamente operaciones autenticadas desde frontend:
- Implementar primero sincronización pública/read-only
- Documentar la limitación
- Dejar preparado el contrato para la sincronización autenticada
- NO simular una sincronización bidireccional inexistente

---

## 5. Endpoints Reales Verificados

### 5.1 Disponibles y verificados

| Endpoint | Métodos | Auth | Notas |
|----------|---------|------|-------|
| `/exercise/` | GET, POST, PUT, PATCH, DELETE | Write | Rate limit en POST |
| `/exerciseinfo/{id}/` | GET | No | Datos anidados completos |
| `/exerciseimage/{id}/` | GET | No | Imágenes |
| `/muscle/` | GET | No | Músculos |
| `/equipment/` | GET | No | Equipamiento |
| `/exercisecategory/` | GET | No | Categorías |
| `/ingredient/` | GET, POST, PUT, PATCH, DELETE | Write | Rate limit |
| `/ingredientinfo/{id}/` | GET | No | Valores nutricionales |
| `/ingredientweightunit/` | GET | No | Unidades de peso |
| `/nutritionplaninfo/{id}/` | GET | No | UUID |
| `/routine/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/day/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/slot/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/slot-entry/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/weight-config/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/repetitions-config/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/sets-config/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/rir-config/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/rest-config/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/workoutsession/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/workoutlog/` | GET, POST, PUT, PATCH, DELETE | Write | CRUD completo |
| `/nutritionplan/` | GET, POST, PUT, PATCH, DELETE | Write | UUID |
| `/meal/` | GET, POST, PUT, PATCH, DELETE | Write | UUID |
| `/mealitem/` | GET, POST, PUT, PATCH, DELETE | Write | UUID |
| `/nutritiondiary/` | GET, POST, PUT, PATCH, DELETE | Write | UUID |
| `/measurement-category/` | GET, POST, PUT, PATCH, DELETE | Write | UUID |
| `/measurement/` | GET, POST, PUT, PATCH, DELETE | Write | UUID |

### 5.2 Paginación

- **Estándar:** `limit`/`offset` (default 20, max 999)
- **Cursor:** `/ingredient-sync/` usa cursor pagination

### 5.3 Tipos de ID

- **Integer:** La mayoría de endpoints
- **UUID (string):** NutritionPlan, Meal, MealItem, NutritionDiary, Measurement, MeasurementCategory

---

## 6. Riesgos y Limitaciones

### 6.1 Riesgos identificados

| Riesgo | Descripción | Mitigación |
|--------|-------------|------------|
| Duplicación | Importar el mismo ejercicio dos veces | Verificar por `sourceId` antes de importar |
| Pérdida de historial | Sobrescribir datos locales | Nunca sobrescribir sin política explícita |
| Credenciales expuestas | Almacenar tokens en frontend | No almacenar credenciales en frontend |
| Dependencia offline | Althea no funciona sin WGER | Dexie como fuente de verdad local |
| Rate limits | Demasiadas requests | Respetar Retry-After, backoff exponencial |
| IDs incompatibles | UUID vs Integer | Mapeo explícito de tipos |

### 6.2 Limitaciones actuales

1. **Sin autenticación:** Solo read-only de datos públicos
2. **Sin sincronización bidireccional:** No hay push a WGER
3. **Sin panel de sincronización:** No hay UI para ver estado de sync
4. **Sin manejo de conflictos:** No hay resolución de conflictos
5. **Sin cola de sincronización:** No hay outbox/inbox

### 6.3 Funcionalidades de WGER que NO pueden integrarse de forma segura

1. **WorkoutSession → TrainingSession:** Estructura diferente, no hay equivalencia directa
2. **WorkoutLog → SetRecord:** Estructura diferente, no hay equivalencia directa
3. **NutritionPlan → nutritionPlans:** Estructura diferente, no hay equivalencia directa
4. **Meal/MealItem → DiaryEntry/DiaryIngredient:** Estructura diferente, no hay equivalencia directa
5. **NutritionDiary → registro de nutrición:** Estructura diferente, no hay equivalencia directa

---

## 7. Próximos Pasos

1. **FASE 1-3:** Arquitectura, identidad/vínculos, autenticación segura
2. **FASE 4-5:** Catálogo de ejercicios y rutinas/planificación
3. **FASE 6-7:** Entrenamiento real y series individuales
4. **FASE 8-9:** Modelo de carga/unidades y progresiones
5. **FASE 10-14:** Estadísticas, nutrición, valores nutricionales, recetas, progreso corporal
6. **FASE 15-20:** Sincronización bidireccional, conflictos, outbox/inbox, retries, paginación, cache/offline
7. **FASE 21-24:** Licencias, seguridad, observabilidad, API interna estable
8. **FASE 25-27:** Estructura de archivos, cliente TypeScript, validación de respuestas
9. **FASE 28:** Tests obligatorios (32 casos)
10. **FASE 31:** Panel de sincronización
11. **FASE 33:** Check final

---

**Documento generado:** 2026-09-29
**Estado:** FASE 0 completada
