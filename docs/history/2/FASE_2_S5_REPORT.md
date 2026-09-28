# FASE 2 — S5 · REPORTE DE AUDITORÍA DE ESTADO (DEXIE / ZUSTAND / LOCALSTORAGE)

**Estado:** CERRADA
**Alcance:** auditoría de fuentes de verdad del estado de la app y eliminación de los espejos persistentes peligrosos. Sin dependencias nuevas, sin migraciones destructivas y sin reescribir lo que ya era correcto.
**Fecha de cierre:** 2026-09-25
**Prerrequisitos:** S1, S2, S3 y S4 cerradas. Este documento no reabre ninguna.

---

## 1. Objetivo

Determinar si el estado de la app tiene **una sola fuente de verdad por dato persistente** o si existen copias que pueden divergir en silencio, y corregir solo las divergentes.

La regla de diseño aplicada:

- **Una fuente canónica por dato.** La segunda copia persistente de un dato canónico es el defecto, no el store que la contiene.
- **Un store no es un problema por ser un store.** Zustand es legítimo cuando guarda estado runtime, de UI o una caché que se revalida contra Dexie.
- **El riesgo es la divergencia silenciosa**, no la mera existencia de un estado en memoria.

---

## 2. Estado inicial (evidencia de la auditoría)

### 2.1 Inventario de dependencias de estado

| Fuente | Hallazgo |
|---|---|
| `package.json` | Únicas dependencias de estado: `dexie` y `zustand`. **No existe `dexie-react-hooks` ni `useLiveQuery`.** |
| `src/stores/` | **Un solo store Zustand en todo el repo:** `src/stores/profile.ts`. `src/stores/profile.test.ts` es su test. |
| `createContext` en `src/` | **Cero resultados.** No hay estado global duplicado por React Context. |
| Barras de estado en bundle | Ninguna librería de gestión de estado adicional. |

### 2.2 Inventario completo de `localStorage` en producción

Extracción de todos los `localStorage.setItem(<literal>)` en `src/` excluyendo tests, más las claves escritas mediante constantes:

| Clave | Escrita en | Estado |
|---|---|---|
| `trainpwa-profile` | `src/stores/profile.ts:23` (persist de Zustand) | **Espejo — eliminado en S5** |
| `althea:session:activeId` | `src/services/training/sessionStore.ts:20-23` | Puntero revalidado contra Dexie |
| `rutinas:list`, `rutina:activeId`, `rutina:meta`, `rutina:ex` | `src/services/storage/routineStore.ts:178-181, 194-199` | Migración que borra + write-through muerto |
| `session:override|changed|observation:<fecha>` | (nadie ya) | Legacy; migración con flag `done` |
| `session:active:<fecha>` | (nadie ya) | Legacy; import autodestructivo en `Entrenar` |
| `exstate:<fecha>:<ejercicio>` | (nadie ya) | Legacy; ya migrado a `db.exerciseState` |
| `groq:usage` | `src/services/ai/groqUsage.ts:26` | Telemetría local de cuota |
| `exgym:<clave>`, `gym:partmap:v1` | `src/services/exerciseGym.ts:69, 88` | Caché HTTP para offline |
| `althea:theme`, `althea:textscale` | `src/utils/appearance.ts` | Preferencia de appearance |
| `althea:nav-collapsed` | `src/components/**/AppNav.tsx` | Preferencia de UI |
| `codulia_api_key` | `src/services/codulia.ts:73` | Credencial de LLM local |
| `qwen:status`, `qwen:progress` | `src/services/ai/qwenProvider.ts` | Estado del modelo local |
| `althea:migration:v5`, `althea:migration:sessionOverrides`, `seed:done` | `src/services/training/migrate.ts`, `sessionOverrideStore.ts`, `seeder.ts` | Flags de migración |
| `nutri:diario*`, `nutrition:adherence`, `coachMemory`, `hydrat*`, `rec:*`, `obs:*`, `post:*`, `neg:*` | — | Claves consumidas por fases de `migrateLocalStorage.ts` y borradas por `seeder.ts:136` |

### 2.3 Los dos hallazgos reales (E)

**E1 — `profile` en el store Zustand: espejo muerto de `userProfile`**

`src/stores/profile.ts` declaraba `profile: UserProfile | null` + `setProfile`, y `persist` lo escribía entero en `localStorage['trainpwa-profile']`.

- **Escritores:** ninguno.
- **Lectores:** ninguno. El único consumidor del store en producción es `src/components/recovery/HydrationWidget.tsx:12`, que desestructura únicamente `hydrationToday`, `addWater` y `setHydrationToday`.
- Los matches de `setProfile` en `src/pages/Perfil.tsx` son el `useState` local de la página (`const [profile, setProfile] = useState<any>(null)`), **otra cosa distinta**.
- La fuente canónica del perfil es `db.userProfile` (`'me'`), leída directamente por Perfil, Onboarding, Nutrición, Inicio y el Coach.
- Clasificación previa: **E (espejo duplicado peligroso)**, aggravada por estar muerta: una copia obsoleta del perfil del usuario permanecendo indefinidamente en localStorage, lista para ser leída por error en el futuro.

**E2 — `hydrationToday` persistido: segunda copia de un agregado de Dexie**

El store persistía en localStorage el total de ml de hidratación del día, cuyo canónico es el agregado `db.hydrationLogs` (vía `getTodayHydration()`).

- La caché se resincroniza al montar el consumidor (`HydrationWidget.tsx:16-29`), por lo que el dato no era *diverge* por sí solo.
- Pero persistirla crea una segunda copia persistente de un agregado canónico   que puede quedar desfasada frente a escrituras de otras superficies (`recoveryService.ts:22`, `hydrationBottles.ts:118`, seeder, fases de migración) y mostrarse como valor aparentemente válido antes de la resincronización.
- Clasificación previa: **E (regla violada: doble fuente persistente) → D (caché runtime legítima)**.

### 2.4 Candidatos suspiciously → descartados con evidencia

| Candidato | Por qué NO es un espejo peligroso |
|---|---|
| `althea:session:activeId` (`sessionStore.ts:14`) | Guarda **solo un puntero**, no una copia. `getActiveSession()` (`:35-42`) revalida contra Dexie en **cada** lectura y borra el puntero si la sesión no existe o está en estado final. No puede divergir en silencio. → **D** |
| `exstate:*` (`ExerciseSeriesTable.tsx:22,28,30`) | Espejo legacy ya migrado a `db.exerciseState`; el componente solo lo lee y lo borra (remove-on-read). Ya no hay escritor. → **F/C** |
| `session:active:<fecha>` (`Entrenar.tsx:308-321`) | Import legacy autodestructivo: convierte un snapshot de versión antigua en "plan pendiente" y lo borra (`:1025,1028`). Sin escritor actual. → **F** |
| Claves `nutri:diario*`, `nutrition:adherence` | `diaryStore.ts:50-89` las migra a Dexie y **borra** el origen. → **F** |
| `syncToLocalStorage()` (`routineStore.ts:189-203`) | Write-through que duplicaría rutinas enteras en localStorage, pero **no tiene ningún llamador**: no puede divergir porque no se ejecuta. → **G** (riesgo latente) |
| Copias `useState` de entidades Dexie en páginas | Patrón universal del repo (`Perfil`, `Nutricion`, `Rutina`, `Calendario`, `Inicio`, `Recuperacion`, `Progreso`, `Entrenar`, `PeriodizationEditor`, `useTrainingSession`, `useExerciseState`): copia de trabajo de la propia vista, re-cargada al montar y refrescada tras sus propias escrituras. No hay un segundo escritor global. → **D** |
| Estado a nivel de módulo (`knowledgeBase.ts:28-29`, `qwenProvider.ts:11-14`, `config.ts:30-32`, `routineStore.ts:149`, `adherenceTracker.ts:46`) | Caches en memoria, singletons de Firebase, flags y contadores. Sin persistencia salvo `qwen:status`. → **B/D** |
| `althea:theme`, `althea:textscale`, `althea:nav-collapsed` | Preferencias de appearance/UI que **no existen en Dexie**: no hay duplicación. → **B** |
| `althea:migration:*`, `seed:done` | Flags de migración de un solo uso. → **B** |
| `groq:usage` | Contador local de cuota consumida; es la única copia y no es un espejo de Dexie (la fuente real es la respuesta del proveedor). → **C** |
| `exgym:*`, `gym:partmap:v1` | Caché HTTP para offline de datos remotos. → **D** |

---

## 3. Correcciones al plan de diseño

| El plan suponía | Lo que encontró la auditoría |
|---|---|
| `useLiveQuery` disponible para leer `userProfile` | La dependencia no existe en el repo y el store no leía Dexie para el perfil: lo **cacheaba en localStorage** sin resincronizar. |
| `src/stores/profile.ts` refleja `userProfile` | El campo existía pero estaba **muerto** (cero escritores, cero lectores). El problema era peor que la hipótesis: una copia inútil y obsoleta. |
| `Rutina.tsx:138` escribe en `routineStore` | `Rutina.tsx` ya usa Dexie; la escritura es a `db.routineStore` y el write-through a localStorage es código muerto sin llamadores. |
| `Calendario.tsx` tiene estado de hidratación divergente | No existe: `Calendario` lee de Dexie directamente. |
| `Nutricion.tsx`/`nutriStore.ts` keeps `nutritionDiary` en localStorage | El diario ya es canónico en `db.nutritionDiary`; el localStorage es solo entrada de migración que se borra. |

---

## 4. Clasificaciones (leyenda)

| Código | Significado |
|---|---|
| **A** | Duplicación exacta: dos copias de lo mismo, una sin propósito |
| **B** | Estado legítimo persistente sin equivalente en Dexie (preferencias, flags) |
| **C** | Estado de UI efímero (no debería sobrevivir a la sesión, y no lo hace) |
| **D** | Caché o puntero derivado, cuya lectura se revalida contra la fuente canónica |
| **E** | **Espejo duplicado peligroso**: persiste y puede divergir en silencio |
| **F** | Legacy/fallback con migración ya implementada |
| **G** | Falso positivo: sin lectores, código muerto o inalcanzable |

## 5. Inventario por store / estado (tabla de cierre)

| Estado | Qué guarda | Persiste | Fuente canónica | Quién escribe | Quién lee | Clasificación |
|---|---|---|---|---|---|---|
| `useProfileStore.profile` (**eliminado**) | copia completa de `UserProfile` | sí, `trainpwa-profile` | `db.userProfile` | nadie | nadie | **E → eliminada** |
| `useProfileStore.hydrationToday` (sin `persist`) | total ml de hoy | **no** (solo memoria) | `db.hydrationLogs` vía `getTodayHydration()` | `HydrationWidget` (optimista) y `setHydrationToday` al montar | `HydrationWidget:12` | **E → D** |
| `useProfileStore.addWater` / `setHydrationToday` | acciones del store | no | — | — | `HydrationWidget`, `recoveryService.test.ts` | **B** (se conservan) |
| `althea:session:activeId` | puntero a sesión activa | sí | `db.trainingSessions` | `createReadySession` (`:113`), transiciones a estado final (`:202`) | `getActiveSession()` (`:35-42`, revalida) | **D** |
| `rutinas:*` | lista de rutinas y día activo | sí | `db.routineStore` | `migrateRoutinesFromLocalStorage()` (luego borra) y `syncToLocalStorage()` (**sin llamadores**) | la migración, una vez | **F** + **G** |
| `session:override:*` etc. | override de día de sesión | sí | tabla de `sessionOverrideStore` | nadie actual | `migrateSessionOverridesFromLocalStorage()` (flag `done`) | **F** |
| `exstate:<fecha>:<ej>` | estado de serie del día | sí | `db.exerciseState` | nadie actual | `ExerciseSeriesTable:28` (y borra) | **F/C** |
| `session:active:<fecha>` | snapshot de sesión antigua | sí | `db.trainingSessions` | nadie actual | `Entrenar.tsx:310` (y borra en `:1025,1028`) | **F** |
| `nutri:diario*`, `nutrition:adherence` | diario y adherencia antiguos | sí | `db.nutritionDiary`, `db.nutritionAdherence` | nadie actual | `migrateDiaryFromLocalStorage()` (y borra) | **F** |
| `groq:usage` | cuota Groq consumida | sí | respuesta del proveedor | `chatService.recordRequest` | `ChatWidget`, `Coach` | **C** |
| `exgym:*`, `gym:partmap:v1` | datos remotos de ejercicios | sí | GymDB (remoto) | `fetchExercises` | lectores de ejercicios | **D** |
| `althea:theme`, `althea:textscale`, `althea:nav-collapsed` | preferencias de appearance/UI | sí | no existe en Dexie | `utils/appearance.ts`, `AppNav` | toda la app | **B** |
| `codulia_api_key` | clave del LLM local | sí | no aplica (credencial) | `setCoduliaKey` | `src/services/codulia.ts:71` | **B** (observación de seguridad) |
| `qwen:status`, `qwen:progress` | estado del modelo local | `qwen:status` sí | WebLLM en runtime | `qwenProvider` | UI de proveedor | **B/C** |
| `althea:migration:*`, `seed:done` | flags de migración | sí | no aplica | migraciones, seeder | migraciones, seeder | **B** |
| Estado a nivel de módulo | caches/singletons/flags | no | Dexie / FS / PWA | varios | varios | **B/D** |
| `useState` de entidades Dexie en páginas | copia de trabajo de la vista | no | la tabla Dexie correspondiente | la propia vista tras su escritura | la propia vista | **D** |
| `db.onboardingDraft` | borrador de onboarding | sí (Dexie) | `db.onboardingDraft` | `saveOnboardingDraft` (cada paso) | `Onboarding.tsx:79` | **B** (ya canónico) |

---

## 6. Cambios aplicados

### `src/stores/profile.ts` (modificado)

1. **Eliminado `profile` y `setProfile`**: espejo de `userProfile` sin ningún escritor ni lector, que persistía una copia completa del perfil en localStorage.
2. **Eliminado el middleware `persist`**: `hydrationToday` deja de ser una segunda copia persistente del agregado `db.hydrationLogs` y pasa a ser caché de runtime, resincronizada con el total canónico al montar el consumidor.
3. **Documentado el contrato** en el propio módulo: qué es canónico, qué es caché y por qué ya no se persiste.

Conserva intacta la superficie que sí se usa: `hydrationToday`, `addWater`, `setHydrationToday`. No se cambió ningún otro store, no se añadió ninguna dependencia y no se tocó ningún lector.

### `src/stores/profile.test.ts` (nuevo, 4 tests)

Fija los invariantes de S5 para que la regresión sea visible:

1. El store no expone `profile`/`setProfile`.
2. Mutar el store **no** escribe en `localStorage`.
3. Un payload legacy persistido en `trainpwa-profile` no se rehidrata: manda el valor canónico.
4. La caché runtime acumula y se puede resincronizar con el valor canónico.

### Archivos deliberadamente NO modificados

- `src/services/storage/accountWipe.ts`: **conserva** `trainpwa-profile` en su lista de borrado. Instalaciones antiguas todavía tienen esa clave en localStorage y debe seguir eliminándose al borrar la cuenta. Su test (`accountWipe.test.ts`) sigue verde sin cambios.
- `src/components/recovery/HydrationWidget.tsx`: su contrato no cambia; la resincronización al montar ya cubría la caché.

---

## 7. Decisiones de no intervención (con justificación)

| Elemento | Decisión |
|---|---|
| `getActiveSessionId()` en localStorage | **Se conserva.** Es un puntero, no una copia, y se revalida contra Dexie en cada lectura. Eliminarlo sería reescribir un store correcto. |
| `syncToLocalStorage()` (`routineStore.ts:189`) | **Se conserva** pese a ser write-through muerto. Borrar un export sin llamadores no aporta valor funcional y S5 no reescribe stores; queda documentado como riesgo latente. |
| Claves legacy de `sessionOverrideStore` | **Se conservan.** La migración ya está marcada `done`; borrarlas sería una migración destructiva fuera de alcance. |
| Copias `useState` en páginas | **Se conservan.** Convertirlas a `useLiveQuery` exigiría una dependencia nueva para un patrón que hoy no diverge. |
| `hydrationToday` como caché runtime | **Se conserva** el store. Es la opción válida: caché en memoria revalidada al montar, en lugar de una copia persistente. |
| `codulia_api_key` en localStorage | **No se toca.** No es un espejo de Dexie; es una decisión de almacenamiento de credencial, ajena a S5. |

---

## 8. Deudas detectadas (NO resueltas en S5)

| # | Deuda | Ubicación | Riesgo |
|---|---|---|---|
| D1 | `syncToLocalStorage()` duplicaría rutinas enteras en localStorage si alguien lo conecta | `routineStore.ts:189-203` | Latente; hoy inerte por no tener llamadores |
| D2 | La migración de overrides no borra las claves legacy que migra (a diferencia de rutinas y diario) | `sessionOverrideStore.ts:89-90` | Datos obsoletos inofensivos en localStorage |
| D3 | `handleAddWater` actualiza la caché antes del `db.put`: si la escritura Dexie falla, el número mostrado queda desfasado hasta el siguiente montaje | `HydrationWidget.tsx:35-46` | Divergencia visual transitoria; corregirla exigiría un bus de eventos o capa nueva |
| D4 | `cacheGet` de `exgym:*` guarda un timestamp `t` que nunca compara: la caché no vence | `exerciseGym.ts:69-70` | Caché efectivamente permanente hasta sobrescritura |
| D5 | `groq:usage` es contable local y puede desfasarse del proveedor | `groqUsage.ts` | Telemetría, no fuente canónica |
| D6 | Clave del LLM local en localStorage | `codulia.ts:71-73` | Exposition de credencial; revisar en fase de seguridad |

---

## 9. Resultado de gates

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx vitest run` | **583/583 tests, 71 archivos** (baseline 579/70 → +4 tests nuevos, +1 archivo) |
| `npm run build` | **PASS** (9.66s, PWA `generateSW`, 91 entradas precacheadas) |
| `npm run lint` | **0 errores, 213 warnings** — idéntico al baseline, sin warnings nuevos. Exit 1 por `--max-warnings 0`, comportamiento conocido y aceptado |

Ningún test existente fue eliminado ni relajado. El test de sincronización caché↔Dexie de `recoveryService.test.ts` sigue pasando sin modification: confirma que la caché runtime sigue cumpliendo su contrato.

---

## 10. Criterios de cierre

| Criterio | Estado | Evidencia |
|---|---|---|
| Cada dato persistente relevante tiene una fuente canónica identificable | **CUMPLIDO** | Tabla de la sección 5: `db.userProfile`, `db.hydrationLogs`, `db.trainingSessions`, `db.routineStore`, `db.nutritionDiary`, `db.exerciseState` |
| No quedan espejos persistentes peligrosos sin justificación | **CUMPLIDO** | E1 y E2 eliminados; el resto de candidatos está revalidado, migrado o clasificado como preferencias/flags |
| Los stores legítimos se conservan (no se eliminan por intuición) | **CUMPLIDO** | `useProfileStore` (caché), puntero de sesión activa, `useState` de páginas y estado a nivel de módulo intactos |
| Sin dependencias nuevas ni capa de abstracción | **CUMPLIDO** | `package.json` sin cambios; no se introdujo `useLiveQuery` ni bus de eventos |
| Sin migraciones destructivas | **CUMPLIDO** | No se borró ninguna clave de datos del usuario; la limpieza histórica sigue en `accountWipe` y en las migraciones existentes |
| Los tests de regresión de S1–S4 siguen verdes | **CUMPLIDO** | 583/583, sin teste eliminado ni relajado |
| S6–S9 no iniciadas | **CUMPLIDO** | Fuera de alcance |

---

## 11. Conclusión

El estado de la app **no estaba duplicado en el grado que suponía el plan**. El riesgo real estaba concentrado y era pequeño: dos campos de un único store Zustand que persistían en localStorage un perfil del usuario que nadie leía y un total de hidratación cuyo canónico ya estaba en Dexie.

Se eliminaron ambos, conservando la caché de hidratación como estado runtime revalidado al montar. El resto del estado es correcto según la auditoría: punteros que se revalidan contra Dexie, migraciones que limpian sus claves de origen, preferencias locales que no existen en Dexie, y copias de trabajo por vista que se recargan al montar. Se documentaron seis deudas latentes, ninguna de ellas introducida por S5.
