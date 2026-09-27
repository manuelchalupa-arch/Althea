# FASE 2 — S3 · REPORTE DE CIERRE

**Estado:** CERRADO
**Alcance:** migración de lectores de ciclo a la fuente canónica (`cycleVersions`), sin refactor general.
**Fecha de cierre:** 2026-09-25
**Alcance temporal:** S1 y S2 cerrados previamente. Este documento cierra S3. No cubre S4+.

---

## 1. Fuente canónica

| Rol | Ubicación | Regla |
|---|---|---|
| **Persistencia canónica del plan** | tabla `cycleVersions` (`src/services/planning/cycleVersions.ts`) | Única fuente de verdad de la planificación |
| **Escritor canónico** | `savePlanning()` — `src/services/planning/cycleVersions.ts:73` | Único escritor de `cycleVersions` en producción |
| **Lector activo canónico** | `getActiveVersion(PROFILE_SCOPE)` — `cycleVersions.ts:43` | Estado vigente de la planificación |
| **Lector canónico con fallback** | `getCanonicalCycle()` — `cycleVersions.ts:131` | Versión activa si existe; si no, snapshot |
| **Lector histórico canónico** | `getVersionForSession()` — `cycleVersions.ts:123` | Versión congelada de la sesión |
| **Snapshot legacy de compatibilidad** | `userProfile.cycle` | Solo lectura, solo fallback. No es fuente de verdad |

Regla de precedencia aplicada en todos los lectores: **activa → `getVersionForSession(session)` → fallback legacy explícito**.

---

## 2. Defecto real encontrado en esta auditoría final

### 2.1 `src/components/recovery/PeriodizationEditor.tsx:49` — CASO A (corregido)

El editor de periodización es la UI que **escribe** el plan canónico vía `savePlanning()`, pero sembraba su estado con el snapshot legacy:

```
antes:  const cycle = getCycleFromProfile(profile ?? null)   // snapshot
        setCycle(cycle)
        setActiveVersion(await getActiveVersion(...))        // activeVersion.cycle NO se usaba
```

**Impacto funcional:** si el usuario abría el editor y guardaba, se persistía el snapshot viejo, revirtiendo silenciosamente el plan canónico y creando una versión espuria. El plan canónico y lo que la UI mostraba/editable divergían.

**Corrección mínima (líneas 45-54):**
```
const pv = await getActiveVersion(PROFILE_SCOPE).catch(() => null)
setCycle(pv?.cycle ?? getCycleFromProfile(profile ?? null))
setActiveVersion(pv)
```
Canónico-primero, sin nueva abstracción, sin tocar `savePlanning` ni su contrato.

### 2.2 `src/services/ai/contextBuilder.ts:287` — CASO D→resuelto (método canónico)

`ctx.userProfile?.cycle?.methodId` leía el snapshot para armar el prompt, mientras `buildTrainingContext()` ya tenía el ciclo canónico resuelto en `contextBuilder.ts:24`.

**Cambio mínimo en `AIContext`:** un único campo **opcional** `cycleMethodId?: string` (`src/services/ai/aiProvider.ts:40`), poblado desde el ciclo canónico ya resuelto (`contextBuilder.ts:251`) y consumido canónico-primero en el prompt builder (`contextBuilder.ts:287`).

Justificación de minimalidad: un solo escalar opcional; **no se introduce una segunda fuente de verdad** (el valor procede del mismo `cycle` ya resuelto); ningún consumer se rompe (`fallbackAIProvider`, `qwenProvider`, `chatLocalFallback`, `coachBehavior.test`); no se agrega ningún campo a `CycleConfig`.

**Descartado:** exponer `nutritionMethodId` desde `AIContext`. `CycleConfig` **no modela** `nutritionMethodId`, así que el campo habría sido siempre `undefined` (mayor ambigüedad, no menos). Se clasifica como C — ver §4.

### 2.3 `src/services/ai/coachCore.ts:130` — CASO D migrado

`userProfile?.cycle?.methodId || methodRecommendation?.primary` era un lector legacy del snapshot, **no auditado en los lotes 1–4** y detectado por el barrido final. Elegía el método nutricional desde el snapshot obsoleto mientras el entrenamiento venía de la versión canónica.

```
ahora:  pv?.methodId || pv?.cycle?.methodId || userProfile?.cycle?.methodId || methodRecommendation?.primary
```
Mismo patrón (import dinámico de `cycleVersions`) que el resto del pipeline IA. Bajo riesgo, sin contrato nuevo.

---

## 3. Lectores migrados (canónico-primero)

| Archivo | Línea | Contexto |
|---|---|---|
| `src/App.tsx` | 85-86 | `pv?.cycle ?? active?.cycle` |
| `src/pages/Mas.tsx` | 51, 105, 118 | `weekMap` + `startDate` |
| `src/pages/Calendario.tsx` | 61-65 | calendario + cadena de fallbacks |
| `src/pages/Nutricion.tsx` | 149 | `getActiveVersion(PROFILE_SCOPE) ?? p?.cycle` |
| `src/hooks/useTrainingSession.ts` | 101-102, 151-152 | histórico + activo |
| `src/pages/Entrenar.tsx` | 270, 331, 380, 1349 | sesión activa, plan pendiente, semana, cambio de día |
| `src/pages/Rutina.tsx` | 115-116 | bootstrap `DEFAULT_CYCLE` |
| `src/components/recovery/PeriodizationEditor.tsx` | 52-53 | **editor de periodización (nuevo en el cierre)** |
| `src/services/ai/contextBuilder.ts` | 24, 170-171 | contexto principal + metadatos de versión |
| `src/services/ai/chatContext.ts` | 67-69, 87 | método vigente |
| `src/services/ai/coachInsights.ts` | 295-299 | adherencia + `perWeek` |
| `src/services/ai/globalScore.ts` | 80-84 | adherencia |
| `src/services/ai/routineBuilderIA.ts` | 141-145 | método vigente |
| `src/services/ai/coachCore.ts` | 128-130 | **método para selección nutricional (nuevo en el cierre)** |

### Lector histórico (CASO B)
Único punto de lectura histórica: `src/hooks/useTrainingSession.ts:101`
(`getVersionForSession(sess).catch(() => null)`), con fallback `getCycleFromProfile` en `:102`.
Las sesiones quedan congeladas contra la versión con la que se crearon;Changing la planificación no altera el pasado (test `D` del cierre + escenario obligatorio preexistente).

---

## 4. Clasificación de cada resto del snapshot legacy

**No queda ningún caso A ni B sin resolver.**

### C — Fallback legacy intencional
| Ubicación | Justificación |
|---|---|
| `src/services/ai/contextBuilder.ts:287` | `ctx.cycleMethodId ?? ctx.userProfile?.cycle?.methodId` — el canónico ya está resuelto; el snapshot solo cubre datos pre-migración sin versión |
| `src/services/ai/chatContext.ts:87` | `p.coachMethodView \|\| cycleMethodId \|\| p.cycle?.methodId` — misma razón; `coachMethodView` es la vista explícita del usuario |
| `src/services/ai/coachCore.ts:130` | `... \|\| userProfile?.cycle?.methodId \|\| methodRecommendation?.primary` — idem + degradación_method recommendation |
| `src/services/ai/coachInsights.ts:299` | `pv?.cycle ?? p?.cycle` |
| `src/services/ai/globalScore.ts:84` | `pv?.cycle ?? p?.cycle` |
| `src/services/ai/routineBuilderIA.ts:145` | `canonicalMethodId \|\| profile?.cycle?.methodId \|\| 'hypertrophy'` |
| `src/pages/Calendario.tsx:65` | `setCycle(p?.cycle)` — último eslabón de la cadena |
| `src/pages/Mas.tsx:105,118` | `(pv?.cycle ?? p?.cycle)` en ambas lecturas |
| `src/hooks/useTrainingSession.ts:102,152` | fallback tras versión histórica / activa |
| `src/pages/Entrenar.tsx:332` | `(pv?.cycle ?? routine.cycle ?? getCycleFromProfile(...))` |
| `src/utils/cycle.ts:131-133` | `getCycleFromProfile` — implementación del fallback, usada por `getCanonicalCycle` |
| `src/services/ai/contextBuilder.ts:294` | `profile.activeNutritionMethod \|\| profile.cycle.nutritionMethodId` — la fuente canónica del método nutricional es `activeNutritionMethod` (ya priorizada). `CycleConfig` no modela `nutritionMethodId`, así que **no existe equivalente canónico**: se clasifica C con origen de datos distinto, no como lector de planificación |

### D — Snapshot / writer legacy intencional
| Ubicación | Justificación |
|---|---|
| `src/pages/Rutina.tsx:166` | `db.userProfile.put({ ...base, cycle: r.cycle, ... })` — ver §6 |
| `src/pages/Onboarding.tsx:205,237` | escribe el snapshot inicial en el onboarding; única fuente de bootstrap para usuarios sin versión canónica |
| `src/pages/Perfil.tsx:266,278,284,291,299` | `put({ ...profile, campo })` — preserva `cycle` por spread; **no muta** planificación |
| `src/components/recovery/PeriodizationEditor.tsx:88` | `userProfile.update(profile.id, { updatedAt })` — **no escribe `cycle`** (comentario explícito en `:85`) |
| `src/pages/Biblioteca.tsx:44`, `src/services/recovery/recoveryService.ts:82`, `src/pages/Coach.tsx:189` | updates de otros campos; no tocan `cycle` |

### E — Metadato de método (fuera de alcance por prohibición de vocabulario)
| Ubicación | Justificación |
|---|---|
| `src/services/ai/methodSelector.ts:147` | `profile.cycle?.weekMap` — `getAvailableDays` es **síncrono** y puro. `selectMethods` se consume desde `buildCycleFromProfile` (`src/utils/cycle.ts:85`, export sync) y desde 7 asserts de `methodSelector.test.ts`. Resolverlo exigiría un `await` de Dexie → romper contrato público + tests |
| `src/services/ai/methodSelector.ts:147` (resto del archivo) | selección de método: E por definición |
| `src/pages/Perfil.tsx:377,378,502,546` | `profile.cycle?.methodId` para mostrar el método y derivar el tono del coach. Es **etiqueta de método**, no planificación. Migrarlo exigiría pasar la versión activa al perfil y volver el perfil asíncrono en render |
| `src/pages/Rutina.tsx:631` | `p?.cycle` para el hint de método al elegir ejercicios — E |
| `src/pages/Coach.tsx:34` | `profile?.cycle?.trainingDays?.length \|\| 3` dentro de helper puro y síncrono (`generateRoutineTips`); misma limitación contractual que `methodSelector` |
| `src/pages/Coach.tsx:154` | `pv?.cycle?.methodId` ya canónico; `profile?.cycle?.methodId` como cola E |

### F — Objeto transitorio / draft
| Ubicación | Justificación |
|---|---|
| `src/services/ai/routineBuilderIA.ts:363` | `parsed.cycle` — salida de parseo de IA en memoria, nunca persistida como planificación |
| `src/services/ai/chatContext.ts:104-105` | `ctx.activeRoutine.cycle` — rutina activa del modelo de datos, F |
| `src/pages/Entrenar.tsx:271,1350`, `src/App.tsx:86`, `src/pages/Calendario.tsx:63` | `routine.cycle` como segundo eslabón tras el canónico |
| `src/pages/Inicio.tsx:38` | `useState(getCycleFromProfile(null))` = `DEFAULT_CYCLE` como estado inicial antes del fetch canónico (`:163`); placeholder inicial, no fuente |
| `src/pages/Rutina.tsx:135,318-537,848-910` | editor de la rutina activa (`active.cycle`): objeto de trabajo F; se persiste vía `savePlanning`, no por `profile.cycle` |
| `src/services/storage/routineStore.ts:46` `saveRoutineVersioned` | escribe en `db.routineStore` (tabla distinta). **No es** un segundo escritor canónico de planificación |

### G — Falso positivo / no representa planificación
| Ubicación | Justificación |
|---|---|
| `src/pages/Rutina.tsx:12` | import de `getCycleFromProfile` no usado tras la migración del bootstrap. Inerte; no afecta comportamiento. No se toca para evitar refactor cosmético en el cierre |
| `src/services/ai/aiProvider.ts:37` y comentarios de S3 | coincidencias en comentarios/documentación, no lecturas |
| `src/services/planning/cycleVersions.ts:92,134` | `sameCycle` y `getCanonicalCycle`: implementación de la fuente canónica |

---

## 5. Escritores restantes

| Escritor | Tabla | Rol |
|---|---|---|
| `savePlanning()` — `cycleVersions.ts:73` | `cycleVersions` | **ÚNICO escritor canónico** |
| `PeriodizationEditor.tsx:79` | — | **Único caller de producción** de `savePlanning` |
| `Rutina.tsx:166` | `userProfile` | Writer legacy de compatibilidad (ver §6) |
| `Onboarding.tsx:205,237` | `userProfile` | Writer legacy de bootstrap |

**No existen dos escritores canónicos.** Verificado por barrido de `db.cycleVersions.put|update`: los únicos escritores de esa tabla están en `cycleVersions.ts:89,96,109,118`, todos dentro de `savePlanning`. El resto de coincidencias son un test (`coachIntegration.test.ts:32`) y los propios tests de la API.

---

## 6. Decisión explícita sobre `Rutina.tsx:166`

**SE CONSERVA. No se elimina.**

Búsqueda completa de consumidores reales del snapshot:

| Consumidor | Estado | Depende del snapshot |
|---|---|---|
| `getCycleFromProfile` (`utils/cycle.ts:131`) | activo | Sí — es el fallback de toda la cadena `getCanonicalCycle` |
| `Calendario.tsx:65` | activo | Sí (último eslabón) |
| `Mas.tsx:105,118` | activo | Sí (fallback) |
| `Entrenar.tsx:332` | activo | Sí (fallback) |
| `useTrainingSession.ts:102,152` | activo | Sí (fallback) |
| `contextBuilder.ts:287`, `chatContext.ts:87`, `coachCore.ts:130`, `routineBuilderIA.ts:145` | activos | Sí (fallback) |
| `Coach.tsx:154` | activo | Sí (cola) |

Como **existen consumidores reales vivos**, eliminar el writer rompería el fallback para cualquier usuario cuyo snapshot no se haya reconstruido desde `cycleVersions`. Se mantiene como **writer de compatibilidad deliberado**, nunca como fuente de verdad. Además, `periodizationEditor.tsx:88` confirma la dirección del sistema: el editor canónico **no** escribe `profile.cycle`.

**Condición futura para eliminarlo:** cuando (a) ningún lector Use el snapshot como fallback, y (b) exista una migración de datos que reconstruya `profile.cycle` desde la versión activa para todos los perfiles. Ese trabajo es de migración de datos, no de S3.

---

## 7. Tests agregados (solo donde faltaba evidencia)

`src/services/planning/cycleVersions.test.ts` — nuevo bloque `FASE 2 S3 — contrato de lectura canónica y fallback legacy` (línea 165):

| Test | Categoría de evidencia cubierta |
|---|---|
| `A. la versión activa gana sobre el snapshot legacy profile.cycle` (:172) | **1. lectura canónica activa** — el canónico pisa al snapshot (3 días / 2026-10-01, no los 2 del snapshot) |
| `B. sin versión activa cae al snapshot legacy` (:187) | **3. fallback legacy** |
| `C. sin versión ni ciclo no rompe: devuelve DEFAULT_CYCLE, nunca undefined` (:198) | **4. ausencia de ciclo sin crash/undefined** — con `null` y con perfil sin ciclo |
| `D. la versión histórica de una sesión no cambia al crear una nueva activa` (:210) | **2. lectura histórica** explícita (v1 queda `historic`, la activa es v2) |
| `E. savePlanning es el único escritor canónico: misma planificación no duplica versiones` (:231) | **5. ausencia de doble escritura canónica** — 3 guardados idénticos → 1 fila, 1 activa, 0 históricas |

Cobertura histórica preexistente que se mantiene: tests 1, 2, 3, 7, 8 y el escenario obligatorio v1→sesión→v2→sesión.
Ningún test fue eliminado ni reducido.

---

## 8. Gates

| Gate | Baseline | Resultado cierre |
|---|---|---|
| `npx tsc --noEmit` | 0 errores | **PASS** (exit 0) |
| `npm test -- --run` | 565/565 · 69 archivos | **PASS** — 570/570 · 69 archivos (+5) |
| `npm run build` | PASS | **PASS** — `✓ built in 19.11s` |
| `npm run lint` | 0 errores / 213 warnings | **Igual al baseline** — 213 problems, **0 errores**, 213 warnings |

`npm run lint` retorna exit 1 por `--max-warnings 0` contra el baseline preexistente de 213 warnings. **Los 5 archivos tocados en este cierre no aportan ni un warning** (verificado archivo por archivo). 0 errores de lint.

---

## 9. Deuda residual real (NO resuelta, por decisión de alcance)

| # | Deuda | Categoría | Fase destino |
|---|---|---|---|
| 1 | `methodSelector.getAvailableDays` lee `profile.cycle.weekMap` (`:147`) y no la versión activa | E/C — contrato público síncrono. **Condición futura:** que `selectMethods` reciba `daysPerWeek` como parámetro, o que sus consumidores (`buildCycleFromProfile` en `utils/cycle.ts:85` y los 7 asserts de `methodSelector.test.ts`) se vuelvan asíncronos. Bajo riesgo cuando ocurra | S4+ |
| 2 | `generateRoutineTips` (`Coach.tsx:34`) usa `profile.cycle.trainingDays.length` en helper puro y síncrono | E/C — misma limitación que #1 | S4+ |
| 3 | `Perfil.tsx:377,378,502,546` y `Rutina.tsx:631` leen `methodId`/`methodId` del snapshot para etiquetas | E — prohibido tocar vocabulario de métodos en S3 | S4+ |
| 4 | `profile.cycle` sigue siendo un snapshot mutable que puede quedar viejo frente a la versión canónica | D — deliberado. Reconstrucción requiere migración de datos | S5+ (migración de datos) |
| 5 | `useTrainingSession.loadSession` usa la versión histórica **también** para calcular el día semanal planificado | B — decisión semántica pendiente: el "día de la semana" de una sesión histórica podría depender de la planificación vigente. Comportamiento actual preserva coherencia histórica | S6+ |
| 6 | 213 warnings de lint preexistentes en el repo | Deuda técnica general, no S3 | S8/S9 |
| 7 | `Rutina.tsx:12` import sin usar de `getCycleFromProfile` | G — inerte | S9 (limpieza) |

Nada de esto produce hoy una inconsistencia funcional con la fuente canónica: son fallbacks, metadatos o casos bloqueados por contrato síncrono.

---

## 10. Criterios de cierre

| Criterio | Estado |
|---|---|
| `cycleVersions` es inequívocamente la fuente canónica | **Cumplido** — único escritor `savePlanning`, único caller `PeriodizationEditor:79` |
| Ningún lector activo/histórico usa el snapshot incorrectamente | **Cumplido** — 0 casos A, 0 casos B pendientes |
| Lectores históricos usan versión histórica | **Cumplido** — `getVersionForSession` en `useTrainingSession:101`, con test |
| Fallbacks legacy justificados | **Cumplido** — §4 C, cada uno con razón |
| Writers legacy son compatibilidad deliberada | **Cumplido** — §5, §6 |
| No existen dos writers canónicos | **Cumplido** — verificado por barrido de la tabla |
| Sin comportamiento funcional roto | **Cumplido** — el defecto encontrado en §2.1 está corregido; 570 tests, tsc y build en verde |
| Sin código ambiguo sin clasificación | **Cumplido** — §4 clasifica A a G sin huecos |

**S3 CERRADO.** No se inicia S4.
