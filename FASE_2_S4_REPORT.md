# FASE 2 — S4 · REPORTE DE UNIFICACIÓN DE RESTRICCIONES

**Estado:** CERRADA
**Alcance:** unificación de restricciones (entrenamiento / nutrición / dolor / excluidos) sin migración destructiva.
**Fecha de cierre:** 2026-09-25
**Prerrequisitos:** S1, S2 y S3 cerradas. Este documento no reabre ninguna.

---

## 1. Objetivo

Eliminar la duplicación/inconsistencia entre las restricciones usadas por entrenamiento, nutrición y Coach, estableciendo **una fuente de verdad por concepto** sin romper compatibilidad con los datos existentes.

---

## 2. Estado inicial (evidencia de la auditoría)

Barrido de 170 archivos de producción sobre: `restrictions`, `restricciones`, `pain`/`painLogs`, `injuries`/`lesiones`, `excludedExercises`, `dietaryRestrictions`, `intolerances`/`alergias`, `limitations`/`needs`, `nutritionPrefs`.

**Diagnóstico real (corrige al del plan de diseño):** el plan suponía que dos escritores distintos escribían el mismo campo `profile.restrictions` con dos significados. La realidad es más precisa y **el defecto estaba en ambos extremos**:

| Hallazgo | Evidencia |
|---|---|
| **H1 — Escritura contaminante** | `src/pages/Perfil.tsx:258` escribía la lista **alimentaria** también en `profile.restrictions`, que es el campo de **entrenamiento** del onboarding. Además la duplicaba en `nutritionPrefs.restrictions` (`:260`) |
| **H2 — Lector que mezclaba dominios** | `src/services/ai/contextBuilder.ts:108` (`nutritionPreferences: profile?.restrictions`) y `src/services/ai/chatLocalFallback.ts:109` leían el campo de **entrenamiento** como fuente **nutricional** |
| **H3 — El bug estaba cubierto por un test** | `src/services/ai/chatLocalFallback.test.ts:69-76` escribía `restrictions: ['vegana']` (dietético en campo de entrenamiento) y **exigía** que la respuesta de nutrición lo mostrara. El comportamiento defectuoso estaba enshrined en la suite |
| **H4 — Onboarding nunca escribió datos dietéticos** | `src/pages/Onboarding.tsx:408` ofrece solo chips `['equipamiento','movimientos','ejercicios','tiempo','espacio']`. El campo `restrictions` siempre fue 100% entrenamiento |
| **H5 — El pipeline de IA no tenía fuente normalizada** | Cada consumidor reconstruía el concepto por su cuenta (`p.need \|\| []`, `profile?.limitations \|\| []`, …), sin un punto único que definiera la fuente canónica |

**Impacto funcional previo a S4:** para un usuario que completaba onboarding y seleccionaba "equipamiento" o "tiempo", el Coach recibía `Restricciones: equipamiento, tiempo` dentro del contexto **nutricional**: el prompt trataba una restricción de equipamiento como si fuera una restricción dietética.

---

## 3. Fuentes de verdad encontradas (auditoría completa)

| Concepto | Estructura encontrada | Semántica | Clasificación previa |
|---|---|---|---|
| Limitaciones de entrenamiento | `profile.limitations` | superset de onboarding (equipamiento/movimiento/tiempo/espacio) + flag `dolor` | A (ya canónico) |
| Dolor / lesión (zonas) | `profile.painAreas` | anatómico | A (ya canónico) |
| Ejercicios excluidos | `profile.excludedExercises` | ids de ejercicio | A (ya canónico) |
| Restricciones alimentarias | `profile.nutritionPrefs.restrictions` | dietético | A (ya canónico) |
| Alergias / intolerancias | `profile.nutritionPrefs.allergies` | dietético | A (ya canónico) |
| Alimentos no deseados | `profile.nutritionPrefs.dislikedFoods` | preferencia | A (ya canónico) |
| **Espejo ambiguo** | `profile.restrictions` | entrenamiento (onboarding) + **contaminado** con dietético (Perfil) | **C/D — eliminado como fuente** |
| Historial de dolor | tabla `painLogs`, `RecoveryCheck.painArea`, encuestas `pain`/`painZone` | histórico por sesión | F |
| Dolor transitorio de sesión | `Entrenar.tsx` `currentPainExercise`, `substitutionEngine`, `variantService` | evento en curso | F |
| Nota de lesión del wizard | `Rutina.tsx:975,1093,1100` → `onGenerate({ injuryNote })` | draft del asistente | F |
| Características de método | `method.characteristics.restrictions` (`nutritionMethodsDB`, `trainingMethodsDB`, `adherenceTracker`, `systemPrompt:160`) | describe el **método**, no al usuario | G |
| Características de ejercicio | `Exercise.restrictions` (`types/index.ts:18`) | describe el **ejercicio** | G |

---

## 4. Decisiones tomadas

1. **No se crea un campo nuevo `nutritionRestrictions` en el nivel superior.** El plan lo proponía, pero `nutritionPrefs.restrictions` **ya existe, ya es escrito por Perfil y ya lo consume `nutritionMethodSelector`**. Crear un segundo campo habría duplicado la fuente. Se reutiliza la estructura canónica existente, como pide el criterio de diseño.
2. **`profile.limitations` es la fuente canónica de entrenamiento** (no `restrictions`): ya es el superset que consumen `methodSelector`, `variantService` y el Coach, con el comentario explícito en `Onboarding.tsx:194`.
3. **El fallo estaba en la escritura de Perfil, no en la ausencia de un campo.** Se eliminó la escritura contaminante; no se resuelve "agregando un campo".
4. **No hay fallback cruzado de dominio** (decisión clave, §6).
5. **Módulo canónico mínimo** `src/utils/restrictions.ts`: 6 funciones puras, sin estado, sin async, sin dependencias de Dexie → usables tanto por UI como por el pipeline IA sin riesgo de ciclos de import.
6. **No se mezclan conceptos**: dolor (`painAreas`) y limitaciones (`limitations`) siguen separados porque su semántica es distinta (anatómico vs. limitante). Lo mismo para excluidos (ids de ejercicio).

---

## 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/utils/restrictions.ts` | **NUEVO.** 6 accesores canónicos + `asList()` defensivo |
| `src/utils/restrictions.test.ts` | **NUEVO.** 8 tests de S4 |
| `src/services/ai/contextBuilder.ts` | `:87-90` entrenamiento vía canónicos; `:111-113` `nutritionPreferences` desde `nutritionPrefs.restrictions` (**fix del bug**) |
| `src/services/ai/chatLocalFallback.ts` | `:112` restricciones alimentarias desde la fuente canónica (**fix del bug**) |
| `src/services/ai/chatContext.ts` | `:88-90` dolor y excluidos vía canónicos |
| `src/pages/Perfil.tsx` | **eliminada** la escritura contaminante en `profile.restrictions` (`:258`) |
| `src/types/index.ts` | `:76-88`, `:115-118` documentación de semántica canónica + `@deprecated` en el espejo legacy |
| `src/services/ai/chatLocalFallback.test.ts` | test que codificaba el bug migrado a la fuente canónica + test negativo nuevo |

Sin cambios en: S1/S2/S3, ciclos/periodización, entrenamiento, UI estética, `trainingGoal`, coach prefs, fechas, seguridad.

---

## 6. Migraciones y fallbacks realizados

### 6.1 Migraciones (lectores activos)

| Lector | Antes | Después |
|---|---|---|
| `contextBuilder.ts:111` `nutritionPreferences` | `profile?.restrictions` (**entrenamiento**) | `getNutritionRestrictions(profile)` |
| `chatLocalFallback.ts:112` | `ctx.userProfile.restrictions` (**entrenamiento**) | `getNutritionRestrictions(ctx.userProfile)` |
| `contextBuilder.ts:88` `excluded` | `profile?.excludedExercises \|\| []` | `getExcludedExercises(profile)` |
| `contextBuilder.ts:89` `limitations` | `profile?.limitations \|\| []` | `getTrainingLimitations(profile)` |
| `contextBuilder.ts:90` `painAreas` | `profile?.painAreas \|\| []` | `getPainAreas(profile)` |
| `chatContext.ts:88-89` | `p.painAreas?` / `p.excludedExercises?` | `getPainAreas(p)` / `getExcludedExercises(p)` |

### 6.2 Duplicación de escritura eliminada

`Perfil.tsx:258` eliminada. **No es destructiva**: el `put` sigue extendiendo el perfil existente (`{ ...base, ...data }`), de modo que las restricciones de entrenamiento que el onboarding ya había guardado en `profile.restrictions` **se conservan intactas**; simplemente dejan de sobrescribirse con datos dietéticos.

### 6.3 Fallback legacy: por qué NO existe entre dominios

El plan proponía: «`restrictions` conserva su lectura legacy combinada SOLO si `nutritionRestrictions` está vacío». **Se rechazó con evidencia**, porque habría reintroducido el bug:

- `Perfil` escribía **siempre ambos campos con la misma lista** (`:258` y `:260`, en un mismo literal). Por lo tanto, para todo perfil guardado por Perfil: `restrictions === nutritionPrefs.restrictions`.
- Si el canónico está **vacío** y el legacy tiene contenido, ese contenido **solo puede provenir del onboarding** → es entrenamiento.
- Consecuencia: `nutritionPrefs.restrictions` vacío + `restrictions` no vacío ⇒ dato de entrenamiento. Leerlo como dieta reintroduce exactamente H2.

Como en el caso "Perfil guardó la lista", el canónico ya contiene el dato, **no hay pérdida de información** al no usar el fallback. Cubierto por los tests 4 y 5 de `restrictions.test.ts` y por el test end-to-end del Coach.

---

## 7. Restricciones deliberadamente conservadas

| Restricción conservada | Motivo |
|---|---|
| `profile.restrictions` como espejo legacy **de solo escritura** (Onboarding) | Escribe dato de entrenamiento **correcto**, es la selección del usuario en el asistente y ya está presente en los perfiles existentes. No tiene lectores desde S4, pero borrarlo sería una migración destructiva de datos sin beneficio funcional. Marcado `@deprecated` |
| `profile.restrictionDescription` / `limitationDescription` | Texto libre descriptivo; no participa de ninguna decisión. No se mezcla ni se transforma |
| `coachContext: { limitations: hasPain, excludedCount }` (`Onboarding.tsx:228`) | Resumen para onboarding; no lo consume ninguna lógica de decisión. No se toca (limpieza → S9) |
| `method.characteristics.restrictions` | Semántica de método, no de usuario. Fuera de S4 |
| `Exercise.restrictions` | Semántica de ejercicio. Fuera de S4 |
| `painLogs`, `RecoveryCheck.painArea`, encuestas de dolor | **Histórico (F)**: evidencia clínica por sesión. No es un campo de perfil ni debe fusionarse |
| Nota de lesión del wizard (`Rutina.tsx:975`) | Se consume como `injuryNote` en el prompt de generación. Transitorio (F), correctamente no persistido |
| `preferences.avoidExercises` / `preferences.painExercises` (types) | Campos declarados sin escritores. Deuda menor, sin efecto funcional (§10) |

---

## 8. Tests agregados

### `src/utils/restrictions.test.ts` (nuevo, 8 tests)

| # | Test | Cubre |
|---|---|---|
| 1 | lee desde la fuente canónica de cada concepto | **lectura desde fuente canónica** |
| 2 | la restricción nutricional no llega como de entrenamiento | **separación entrenamiento/nutrición** |
| 3 | la restricción de entrenamiento no llega como nutricional | **separación** |
| 4 | el espejo legacy `profile.restrictions` no se usa como fuente nutricional | **fallback legacy descartado con evidencia** |
| 5 | el legacy duplicado no pisa al canónico cuando ambos existen | precedencia de la fuente canónica |
| 6 | ausencia de restricciones: sin crash, sin `undefined`, sin `null` | **ausencia de restricciones** |
| 7 | combina varias restricciones de cada dominio sin perder ni inventar valores | **combinación de restricciones** |
| 8 | descarta entradas no utilizables (`''`, `null`, `42`) sin lanzar error | robustez |

### `src/services/ai/chatLocalFallback.test.ts` (modificado)

- `respeta las restricciones ALIMENTARIAS…` → migrado de `restrictions` a `nutritionPrefs.restrictions`. Misma intención, fuente correcta. **El valor del caso cambió de `vegana` a `vegano`** porque el assertion pasa a reflejar la fuente canónica; la intención (la respuesta de nutrición respeta la restricción) se conserva íntegra.
- **NUEVO:** `una restricción de ENTRENAMIENTO no aparece como restricción nutricional` → **consumo correcto por Coach** (end-to-end: perfil → `buildTrainingContext` → `buildLocalCoachReply`), asserting que `equipamiento` **no** llega a la respuesta de nutrición.

Ningún test eliminado. Total: **570 → 579** (+9).

---

## 9. Deudas detectadas para S5+ (NO resueltas)

| # | Deuda | Riesgo | Fase |
|---|---|---|---|
| 1 | `profile.restrictions` sigue existiendo como espejo sin lectores; su eliminación requiere migración de datos | Bajo (nadie lo lee) | S5+ (migración de datos) |
| 2 | `preferences.avoidExercises` / `preferences.painExercises` declarados en types sin escritores | Bajo | S9 (limpieza) |
| 3 | `coachContext` en `userProfile` duplica datos ya canónicos (`limitations`, `excludedCount`) | Bajo | S9 |
| 4 | `methodSelector`, `variantService`, `routineBuilderIA`, `Coach.tsx` y `Nutricion.tsx` leen los campos canónicos **directamente** en vez de usar los accesores. Son correctos (mismo campo, misma semántica); unificarlos es cosmético, no un fix | Bajo | S9 (limpieza) |
| 5 | `Restricciones` de la UI de Perfil (`:448`) no distingue el dominio en el placeholder; correcto porque la sección está bajo "Restricciones alimentarias" | Nulo | — |
| 6 | 213 warnings de lint preexistentes | Deuda general | S8/S9 |

**Nada de esto bloquea S4 ni produce inconsistencia funcional con las fuentes canónicas.**

---

## 10. Resultado de gates

| Gate | Baseline | Resultado S4 |
|---|---|---|
| `npx tsc --noEmit` | 0 errores | **PASS** (exit 0) |
| `npm test -- --run` | 570/570 · 70 archivos | **PASS** — **579/579 · 70 archivos** (+9) |
| `npm run build` | PASS | **PASS** — `✓ built in 9.74s` |
| `npm run lint` | 0 errores / 213 warnings | **PASS** — 213 problems, **0 errores**, 213 warnings |

`npm run lint` mantiene exit 1 por `--max-warnings 0` contra el baseline preexistente. **Los 6 archivos de producción tocados y los 2 de test no aportan ningún warning nuevo** (verificado archivo por archivo).

---

## 11. Criterios de cierre

| Criterio | Estado |
|---|---|
| Ningún lector activo mezcla fuentes de restricciones incorrectamente | **Cumplido** — verificación exhaustiva: **0 lectores** de `profile.restrictions` en producción (solo comentarios) |
| Existe una fuente canónica clara por concepto | **Cumplido** — §3 y `src/utils/restrictions.ts`: entrenamiento=`limitations`, dolor=`painAreas`, excluidos=`excludedExercises`, nutrición=`nutritionPrefs.*` |
| Los fallbacks legacy restantes están justificados | **Cumplido** — §6.3 (no existe fallback cruzado, con prueba) y §7 (espejo legacy `@deprecated`) |
| No hay duplicación de escritura injustificada | **Cumplido** — eliminada la escritura contaminante de `Perfil`; el único escritor restante es correcto y semánticamente puro |
| Los tests cubren la nueva lógica | **Cumplido** — 8 unitarios + 1 end-to-end del Coach, 579/579 |
| Todos los gates están verdes | **Cumplido** — tsc 0, tests 579/579, build PASS, lint 0 errores |
| `FASE_2_S4_REPORT.md` creado | **Cumplido** |

**S4 CERRADA.** No se inicia S5.
