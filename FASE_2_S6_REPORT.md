# FASE 2 — S6 · REPORTE DE UNIFICACIÓN DE PREFERENCIAS DEL COACH

**Estado:** CERRADA
**Alcance:** auditar las preferencias/configuración del Coach, demostrar cuál es la fuente canónica y eliminar las divergencias reales. Sin dependencias nuevas, sin tabla nueva, sin cambios de prompt y sin tocar `trainingGoal`, restricciones ni ciclos.
**Fecha de cierre:** 2026-09-25
**Prerrequisitos:** S1, S2, S3, S4 y S5 cerradas. Este documento no reabre ninguna.

---

## 1. Objetivo

Dejar **una fuente canónica por preferencia persistente del Coach**, con los estados derivados y runtime claramente separados, y que todos los consumidores (contexto de IA, chat, coachCore, fallback local y UI) resuelvan la misma preferencia con la misma regla.

Regla aplicada: el problema no es que exista más de una representación, sino que **la misma preferencia se resuelva con reglas distintas según el consumidor**, o que un segundo escritor pise la preferencia explícita del usuario.

---

## 2. Las tres representaciones de preferencias encontradas

El plan anticipaba tres (`coachPrefs` de Dexie, `localStorage/prefs:global` y preferencias de perfil). La auditoría encontró que esas tres existen, pero **no son equivalentes entre sí**: una es una preferencia de usuario, otra es una preferencia legacy y la tercera son datos aprendidos. Además aparecieron tres representaciones más que el plan no mencionaba.

| # | Representación | Dónde vive | Persiste | Concepto |
|---|---|---|---|---|
| **R1** | `profile.coachTone` | `db.userProfile` (`'me'`) | sí | **Tono explícito elegido por la persona** (personalidad del Coach) |
| **R2** | `profile.coachIntensity` | `db.userProfile` (`'me'`) | sí | Preferencia legacy del onboarding (`profesional\|motivacional\|duro\|extremo`) |
| **R3** | `db.coachMemory['coach-prefs'].prefs` | `db.coachMemory` | sí | **Patrones aprendidos** de las decisiones del Coach (`disponibilidadLunes`, `ejercicioEvitado`, `duracionPreferida`…), no preferencias de usuario |
| **R3b** | `db.coachMemory['prefs:global']` | `db.coachMemory` | sí | Datos migrados del localStorage `coachPrefs` **que ningún lector lee** (id distinto al canónico) |
| **R4** | `profile.coachMethodView` | `db.userProfile` | sí | Método que la persona quiere **ver** en la pantalla del Coach (no es el método del ciclo) |
| **R5** | `profile.coachLevel` (1-5) vs `profile.experienceLevel` | `db.userProfile` | sí | Exigencia del Coach (escrita) vs nivel de experiencia (solo leída) |
| **R6** | `profile.exigencia` | `db.userProfile` | sí | Campo sin escritor y sin uso en el prompt |

### 2.1 Evidencia de que R3 no es una preferencia de usuario

`src/services/ai/coachMemory.ts:120-142`: el registro `coach-prefs` solo lo escribe `learnFromHistory()`, que **deriva** los valores del historial de decisiones del Coach (`savePrefs` no tiene otro llamador). Se consume vía `getLearningInsight()` en `chatContext.ts:105-108` y, en `contextBuilder.ts:76,248`, como `ctx.prefs`, campo que **no se renderiza** en el prompt.

Es decir: R3 es un **dato derivado** (clasificación G), no una fuente de verdad de configuración. Sus claves ni siquiera coinciden con las de R1/R2.

### 2.2 Evidencia de que R3b está muerto

`src/services/storage/migrateLocalStorage.ts:337-344` migra el localStorage legacy `coachPrefs` a `db.coachMemory` con `id: 'prefs:global'`, mientras `getPrefs()` lee `PREFS_ID = 'coach-prefs'` (`coachMemory.ts:40,115`). No existe ningún lector de `prefs:global` en el repo. La premisa del plan ("deprecar `localStorage`/`prefs:global`") ya está satisfecha: no quedan escritores de `coachPrefs` en localStorage.

---

## 3. Escritores y lectores de cada representación

### R1 — `profile.coachTone` (canónica)

| Rol | Ubicación |
|---|---|
| **Escritor** | `src/pages/Perfil.tsx:288-293` `saveCoachTone()` — selector "Personalidad" (4 valores = `CoachTone`) |
| **Escritor (removido en S6)** | `src/pages/Coach.tsx:184-197` `handleMethodChange()` escribía además `coachTone: style.tone` |
| **Lector** | `contextBuilder.ts:30`, `chatContext.ts:97`, `coachCore.ts:44`, `Perfil.tsx:384` (badge) |

### R2 — `profile.coachIntensity` (legacy)

| Rol | Ubicación |
|---|---|
| **Escritor** | `src/pages/Onboarding.tsx:47,115,234` (paso 14 del onboarding); default `'profesional'` en `Rutina.tsx:165` |
| **Lector** | `contextBuilder.ts:30`, `coachCore.ts:44` |

### R3 — `coachMemory['coach-prefs']` (derivado)

| Rol | Ubicación |
|---|---|
| **Escritor** | `coachMemory.ts:120-125` `savePrefs()`, invocado solo por `learnFromHistory()` (`:127-142`) |
| **Lector** | `getLearningInsight()` → `chatContext.ts:105-108`; `contextBuilder.ts:76` → `ctx.prefs` (no renderizado) |

### R4 — `profile.coachMethodView` (selección de UI)

| Rol | Ubicación |
|---|---|
| **Escritor** | `Coach.handleMethodChange()` (picker "Estilo de coaching") |
| **Lector** | `Coach.tsx:152,154` (qué método mostrar), `chatContext.ts:92` (prioridad sobre el método del ciclo para el texto "Coach activo") |

### R5/R6 — nivel y exigencia

| Campo | Escritor | Lectores |
|---|---|---|
| `coachLevel` | `Perfil.tsx:295-300` (escala 1-5) | `contextBuilder.ts:252` → `ctx.nivelExigencia` |
| `experienceLevel` | **ninguno en producción** | `coachCore.ts:43`, `chatContext.ts:85`, `contextBuilder.ts:279`, `goalEngine.ts:75`, `methodSelector.ts:13`, `nutritionMethodSelector.ts:15`, `routineBuilderIA.ts:210`, `Nutricion.tsx:137` |
| `exigencia` | **ninguno** | `contextBuilder.ts:253` → `ctx.exigencia` (nunca renderizado) |

---

## 4. Hallazgos: dónde estaba la divergencia real

**H1 · Dos escritores con semánticas opuestas sobre `coachTone`.**
`Perfil` lo escribe como *elección del usuario*; `Coach.handleMethodChange` lo escribía con *el tono del método elegido*. Efecto: cambiar de método en el Coach **destruía silenciosamente** la personalidad elegida en Perfil, pese a que la propia UI dice "si no elegís, se usa el tono de tu método de entrenamiento" (`Perfil.tsx:533-534`).

**H2 · Cuatro reglas de resolución distintas para la misma preferencia.**

| Consumidor | Regla anterior | Consecuencia |
|---|---|---|
| `contextBuilder.ts:30` | `mapTone(coachTone \|\| coachIntensity)` | ignora el método |
| `coachCore.ts:44` | `coachTone \|\| coachIntensity \|\| 'ABUELITOS'` **sin `mapTone`** | un valor legacy crudo (`'motivacional'`) llegaba a `applyPersonality` como si fuera un `CoachTone` y caía al fallback `ABUELITOS` |
| `chatContext.ts:97` | `mapTone(coachTone \|\| style.tone)` | ignora `coachIntensity` |
| `Perfil.tsx:384` | `coachTone \|\| style.tone \|\| 'ABUELITOS'` | ignora `coachIntensity` |

La misma persona recibía un Coach distinto según si preguntaba en la sesión, en el chat o en Perfil. Con `coachIntensity: 'motivacional'` y método `calisthenics`, el chat usaba el tono del método y `coachCore` usaba `ABUELITOS`.

**H3 · La UI mostraba un valor distinto del que usa la IA.** El encabezado y la tarjeta "Estilo de coaching" imprimían `currentStyle.tone` (el tono del método) aunque la persona hubiera elegido otra personalidad en Perfil.

**H4 · `prefs:global` muerto** (sección 2.2): dato migrado que ningún lector puede ver.

---

## 5. Fuente canónica elegida y evidencia

**Canónica: `UserProfile.coachTone` en `db.userProfile` (`'me'`).**

Evidencia:

1. **Es la única preferencia explícitamente editable por la persona** para la personalidad del Coach (`Perfil.tsx:43-49, 523-535`).
2. **La propia UI documenta la jerarquía**: "Define el tono del Coach en el asistente. Si no elegís, se usa el tono de tu método de entrenamiento" (`Perfil.tsx:533-534`).
3. **El diseño de S2/S3 lo respalda**: `coachPersonality.ts:1-2` — "La personalidad ahora se deriva del método de entrenamiento seleccionado".
4. **`UserProfile` ya es el contenedor canónico de preferencias del usuario** (S2 estableció ahí `trainingGoal`; S4 establecía los accesores `getTrainingLimitations()` etc. sobre el mismo perfil). No hace falta otra tabla.

**Se rechazó la prescripción del plan (crear `db.coachPrefs`)** por tres razones con evidencia:

- Habría duplicado R1/R2 en una tabla nueva, contradiciendo el objetivo de S6.
- El registro `coach-prefs` que ya existe guarda **patrones aprendidos**, no configuración: mezclar ambos conceptos en un mismo documento habría creado la duplicación que S6 busca eliminar.
- No hay ningún escritor de preferencias del Coach fuera de `db.userProfile`, así que no existía el problema que la tabla nueva resolvería.

**Regla única de resolución** (`resolveCoachTone()` en `coachPersonality.ts`):

1. `coachTone` — elección explícita (canónica).
2. Tono del **método canónico** — dato derivado, no persistido.
3. `coachIntensity` — preferencia legacy, leída vía `mapTone`, **solo si no hay método**.
4. `ABUELITOS`.

### 5.1 Delta de comportamiento (explícito)

| Situación | Antes | Después |
|---|---|---|
| `coachTone` elegido | ese tono en todos lados | **igual** |
| Sin `coachTone`, con método | chat/Perfil: método · contexto/`coachCore`: `ABUELITOS` o valor legacy roto | **todos: método** |
| Sin `coachTone`, con método, `coachIntensity` no default | tres tonos distintos según la pantalla | **todos: método** |
| Sin `coachTone`, sin método, con `coachIntensity` | `coachCore` roto (`ABUELITOS`), Perfil `ABUELITOS` | **todos: `mapTone(intensity)`** |
| Sin ninguna preferencia | `ABUELITOS` | **igual** |

El único caso que cambia es el tercero: la elección del onboarding deja de imponerse sobre el método cuando existe método configurado. Es la semántica documentada en la UI y en `coachPersonality.ts`, y es justo el caso que antes producía tres respuestas incompatibles. El campo **no se borra ni se migra**: recovered la prioridad en una línea si en el futuro se decide lo contrario.

---

## 6. Cambios realizados

| Archivo | Cambio |
|---|---|
| `src/services/ai/coachPersonality.ts` | Nuevo `resolveCoachTone()`: la regla única, con su orden canónico documentado. Importa `mapTone` de `systemPrompt` (sin ciclo: `systemPrompt` no importa `coachPersonality`). |
| `src/services/ai/coachPreferences.ts` (nuevo) | `setCoachMethodView()`: única escritura de la vista de método del Coach, extraída del componente para poder verificarla en tests. No escribe `coachTone`. |
| `src/services/ai/contextBuilder.ts` | `personalidad` pasa a `resolveCoachTone()` con el método **canónico** (`cycle.methodId` de `getCanonicalCycle`, coherente con S3). Eliminado el import sobrante de `mapTone`. |
| `src/services/ai/coachCore.ts` | `tone` pasa a `resolveCoachTone()` y resuelve el método con `getCanonicalCycle()`. Esto corrige el bug del valor legacy crudo sin `mapTone`. |
| `src/services/ai/chatContext.ts` | `tone` pasa a `resolveCoachTone()`. Eliminado el import sobrante de `mapTone`. |
| `src/pages/Perfil.tsx` | El badge "Personalidad" usa `resolveCoachTone()`: ahora muestra el mismo valor que usa la IA. |
| `src/pages/Coach.tsx` | `handleMethodChange` ya **no pisa `coachTone`**; usa `setCoachMethodView`. El encabezado y la tarjeta "Estilo de coaching" muestran el tono efectivo (`coachTone ?? currentStyle?.tone`), no el del método. |
| `src/types/index.ts` | Documentada la semántica: `coachTone` canónica, `coachIntensity` legacy, `coachMethodView` no canónico. Sin estrechar tipos: `mapTone` traduce a propósito los valores legacy. |
| `src/services/ai/coachPreferences.test.ts` (nuevo) | 11 tests de S6. |

No se modificó ningún prompt, ni Groq/proxy, ni `trainingGoal`, ni las restricciones, ni los ciclos.

---

## 7. Fallbacks conservados y justificación

| Fallback | Consumidores reales | Decisión |
|---|---|---|
| `coachIntensity` (R2) | Onboarding lo escribe; `resolveCoachTone` lo lee cuando no hay método | **Se conserva** como fallback legacy. No se borra ni se migra: hay usuarios con la elección del onboarding y sin método, y es lo que la auditoría muestra que aún influye. |
| Tono derivado del método (paso 2) | Todos los consumidores | **Se conserva**: es un dato **derivado**, no una segunda fuente persistente. Se calcula desde el método canónico de S3. |
| `mapTone()` como traductor de valores legacy | Todo el código de tono | **Se conserva**: es la única pieza que traduce `'MOTIVACIONAL'|'DURO'|'EXTREMO'|'PROFESIONAL'|'ESTRICTO'` a `CoachTone`. No es un store: es una función pura. |
| `coachMethodView` (R4) | `Coach.tsx:152,154` y `chatContext.ts:92` | **Se conserva**: es una selección de UI legítima (hablar de un método distinto al del ciclo), no una copia del método canónico. Se le bajó la prioridad de escritura: ya no pisa el tono. |
| `coachMemory['coach-prefs']` (R3) | `getLearningInsight()` → chat | **Se conserva**: dato derivado del historial de decisiones, con consumidor real. No es preferencia de usuario. |
| `prefs:global` (R3b) | **ninguno** | **No se conserva como fallback**: no tiene consumidores. Se dejó la fila tal cual (no se borra data del usuario ni se toca la migración) y se documenta como deuda en la sección 9. |
| `ctx.prefs` en el prompt | ninguno (`buildPrompt` no lo renderiza) | **Se conserva** sin cambios: no es una divergencia, es un campo muerto del contrato de IA. Deuda documentada. |
| `profile.exigencia` (R6) | ninguno | **Se conserva** sin cambios: sin escritor y sin renderizado, no puede divergir. Deuda documentada. |

---

## 8. Duplicaciones descartadas y por qué

| Sospecha | Veredicto | Evidencia |
|---|---|---|
| "`coachPrefs` en localStorage es una fuente" | **Falso positivo (H)** | Sin escritores; la migración de `migrateLocalStorage.ts:337` lo consume y lo manda a un id que nadie lee. |
| "`coachMemory` prefs son la fuente canónica" | **Falso positivo (G)** | Solo lo escribe `learnFromHistory()`; sus claves son patrones aprendidos, no configuración. |
| "`coachIntensity` y `coachTone` son la misma preference → fusionar" | **Parcialmente cierto** | Son el mismo *concepto* con distinta antiguedad; se unificaron en el **resolver**, no en el almacenamiento. Fusionar los campos habría costado una migración de datos sin beneficio. |
| "`coachMethodView` duplica `cycle.methodId`" | **Falso positivo (H)** | Conceptos distintos: uno es "qué método quiero ver en el Coach", el otro es el método canónico del ciclo (S3). La UI lo ofrece como preview. |
| "`coachLevel` duplica `experienceLevel`" | **Falso positivo (H)** | Datos distintos y ambos legítimos: escala 1-5 de exigencia (escrita) vs nivel de experiencia de entrenamiento (solo leída, sin escritor). Fusionarlos sería artificial. |
| "`experienceLevel` es un espejo peligroso" | **Falso positivo (H)** | No tiene escritor: no puede diverger de nada. Sus lectores usan defaults explícitos. |
| "`exigencia` es un espejo" | **Falso positivo (H)** | Sin escritor y sin renderizado en el prompt. |
| "`ctx.prefs` es una copia divergente" | **Falso positivo (H)** | Se carga y se transporta, pero no se usa: no hay dos versiones que puedan diferir. |

---

## 9. Tests agregados

`src/services/ai/coachPreferences.test.ts` (nuevo, 11 tests):

| # | Test | Qué demuestra |
|---|---|---|
| 1 | la fuente canónica gana sobre método e intensity | precedencia de R1 |
| 2 | sin `coachTone`, deriva del método canónico | paso 2 |
| 3 | sin método, `coachIntensity` funciona como fallback legacy | paso 3 (los 3 valores legacy) |
| 4 | ausencia total → `ABUELITOS` | default sin lanzar |
| 5 | método desconocido cae al intensity legacy | robustez |
| 6 | el `AIContext` recibe el tono canónico | **lectura desde la fuente** en el consumidor real |
| 7 | el `AIContext` hereda el método sin tono explícito | consumidor real + método canónico |
| 8 | sin preferencias el `AIContext` no inventa personalidad | honestidad del contexto |
| 9 | cambiar el método **no** pisa la preferencia canónica | **escritor duplicado eliminado** |
| 10 | cambiar el método sin tono previo deriva del método nuevo, sin crear copia | sin efecto secundario |
| 11 | una actualización no deja segunda copia persistente divergente | ningún escritor en localStorage + valores intactos |

No se eliminó ni relajó ningún test existente. Verificados explícitamente los consumidores de S3/S4 y del Coach: `chatContext.test.ts`, `coachIntegration.test.ts`, `chatLocalFallback.test.ts`, `coachMemory.test.ts`, `coachBehavior.test.ts`, `cycleVersions.test.ts`, `restrictions.test.ts`, `migrateLocalStorage.test.ts`, `onboarding.test.tsx` — todos verdes sin modificación.

---

## 10. Resultado de gates

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| Suite completa | **594/594 tests, 72 archivos** (baseline 583/71 → +11 tests, +1 archivo) |
| `npm run build` | **PASS** (9.60s) |
| `npm run lint` | **0 errores, 213 warnings** — idéntico al baseline, **ningún warning en los archivos modificados** (exit 1 por `--max-warnings 0`, comportamiento conocido) |

---

## 11. Deudas detectadas para S7+ (NO resueltas)

| # | Deuda | Ubicación | Riesgo |
|---|---|---|---|
| D1 | `prefs:global`: fila migrada que ningún lector puede ver. El `id` no coincide con `coach-prefs` | `migrateLocalStorage.ts:337-344` vs `coachMemory.ts:40` | Datos muertos; no puede divergir porque nadie los lee |
| D2 | `experienceLevel` no tiene escritor: 8 lectores usan defaults implícitos | perfil + `goalEngine`/`methodSelector` | Perfil no puede configurar la experiencia; el selector de método usa siempre un default |
| D3 | `profile.exigencia` sin escritor y nunca renderizado | `contextBuilder.ts:253` | Campo muerto del contrato de IA |
| D4 | `ctx.prefs` se calcula y se transporta, pero `buildPrompt` no lo usa | `contextBuilder.ts:76,248` | Los patrones aprendidos no llegan al prompt de ejercicio (sí llegan al chat vía `getLearningInsight`) |
| D5 | `coachLevel` (1-5) solo llega al prompt; no influye en `resolveGoal` ni en `applyPersonality` | `contextBuilder.ts:252` | La "exigencia" elegida en Perfil no modula la lógica del Coach, solo el texto |
| D6 | `getLearningInsight()` sigue un orden fijo de if y devuelve un solo insight | `coachMemory.ts:144-151` | Cuando coexisten varios patrones aprendidos, solo se comunica uno |

Ninguna de estas pertenece a S6: no crean una segunda fuente persistente que pueda divergir.

---

## 12. Conclusión de cierre

S6 queda **CERRADA**. La prefs del Coach quedó con una fuente canónica clara y demostrable: `UserProfile.coachTone` en `db.userProfile`, con `coachIntensity` como fallback legacy sin método y el tono del método canónico como valor derivado. La premisa del plan (crear `db.coachPrefs`) se descartó con evidencia: la estructura adecuada ya existía y el registro `coach-prefs` de `coachMemory` guarda otra cosa (patrones aprendidos), no configuración.

Lo que realmente estaba duplicado no eran los almacenamientos, sino las **reglas de lectura**: cuatro consumidores resolvían el mismo tono de tres maneras distintas, y un segundo escritor borraba la personalidad elegida por la persona. Ambas cosas están corregidas con un único resolver y un único escritor por preferencia, con tests que lo fijan.

**Criterios de cierre verificados:**

| Criterio | Estado | Evidencia |
|---|---|---|
| Una fuente canónica clara por preferencia persistente | **CUMPLIDO** | Sección 5: R1 canónica, R2 fallback legacy, R3 derivado, R4 selección de UI |
| No quedan dos fuentes persistentes que puedan divergir | **CUMPLIDO** | Un solo campo canónico (`coachTone`) y una sola regla de resolución para todos los consumidores |
| Estados derivados/runtime claramente separados | **CUMPLIDO** | Tono del método = derivado (paso 2); `coachMethodView` = selección de UI; `coach-prefs` = aprendizaje |
| Los consumidores del Coach funcionan con la fuente correcta | **CUMPLIDO** | `contextBuilder`, `coachCore`, `chatContext`, `Perfil`, `Coach` usan `resolveCoachTone`; verificado con `buildTrainingContext` en tests |
| Los fallbacks restantes están justificados | **CUMPLIDO** | Sección 7, con consumidores reales verificados |
| Sin refactorización forzada | **CUMPLIDO** | 6 sospechas descartadas con evidencia (sección 8); ningún campo eliminado |
| Prompt, Groq/proxy, trainingGoal, restricciones y ciclos sin tocar | **CUMPLIDO** | Diff acotado a resolución de tono + un escritor |
| tests, tsc, build y lint | **CUMPLIDO** | 594/594, tsc 0, build PASS, lint 0 errores / 213 warnings (baseline) |
| `FASE_2_S6_REPORT.md` existe | **CUMPLIDO** | Este documento |

**S7, S8 y S9 no se iniziaron. S6 termina aquí.
