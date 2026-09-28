# FASE 2 — S9 · Limpieza final, deuda residual y cierre

**Fecha:** 2026-09-25
**Alcance:** S9 — limpieza final y cierre de FASE 2
**Estado:** COMPLETADA
**Precedente:** S1–S8 cerradas. S9 no abre FASE 3.

---

## 1. Objetivo

Cerrar FASE 2 con tres responsabilidades y nada más:

1. **Inventariar** la deuda residual que dejaron los subfases anteriores, tomando como fuente los reportes obligatorios.
2. **Corregir solo lo demostrable**: código muerto con evidencia de 0 escritores / 0 lectores / 0 referencias dinámicas, y bugs funcionales probados. Ante duda, conservar y documentar.
3. **Cerrar con gates verificables** y dejar el checkpoint de arquitectura documentado.

Fuera de alcance por decisión explícita: refactor, cambios de arquitectura o modelo de datos, y cualquier línea nueva de trabajo. S9 no es una reescritura; es el cierre contable de lo que ya existe.

Regla de oro aplicada en todo el subfase: **no se eliminó código solo porque "no aparece en la UI"**. Cada eliminación exigió la prueba completa de ausencia de consumidores.

---

## 2. Inventario inicial

Deuda heredada, consolidada desde `FASE_2_PLAN.md`, `FASE_2_S3_REPORT.md` … `FASE_2_S8_REPORT.md`, `FASE_1M_A_REPORT.md` y `FASE_CHECKPOINT_1A_1M_B.md`.

### 2.1 Deuda explícitamente derivada a S9

| # | Deuda | Origen |
|---|-------|--------|
| 1 | `migrateLocalStorage` escribe fecha UTC en un campo de fecha civil | S7 |
| 2 | `getTodayLocalDate` possibly muerto | S7 |
| 3 | `syncToLocalStorage` possibly muerto | S7 |
| 4 | `prefs:global` legacy, 0 lectores | S6/S7 |
| 5 | `experienceLevel` / `coachLevel` | S5/S6 |
| 6 | Clave local `codulia_api_key` | FASE 1M-A |
| 7 | `global.d.ts` (shim de 3 matchers) | S8 |
| 8 | `AltheaInput` accesibilidad | S8 → cerrada en S8 |

### 2.2 Deuda detectada durante S9

| # | Deuda | Origen |
|---|-------|--------|
| 9 | Detector TCA con indicadores corruptos y ciego al género | auditoría S9 |
| 10 | 2 `console.log` de debug con datos de dolor en producción | auditoría S9 |
| 11 | Import muerto `getCycleFromProfile` en `Rutina.tsx` | S3 (dejado explícitamente para S9) |
| 12 | `manifest.webmanifest` con color de tema divergente de la app | auditoría S9 |
| 13 | Test de S7 intermitente por I/O de red real | auditado al correr gates |

---

## 3. Auditoría de cada deuda

Clasificación A–H: **A** canónico · **B** fallback legacy · **C** runtime necesario · **D** compatibilidad · **E** dato distinto y legítimo · **F** código muerto · **G** deuda futura · **H** falso positivo.

| Ítem | Clase | Veredicto | Acción |
|------|-------|-----------|--------|
| `getTodayLocalDate` | **F** | 0 PRODUCTORES, 0 CONSUMIDORES | **Eliminado** |
| `syncToLocalStorage` | **F** | 0 PRODUCTORES, 0 CONSUMIDORES | **Eliminado** |
| `getCycleFromProfile` (import) | **F** | 0 usos del binding | **Eliminado** |
| Fecha UTC en migración | bug | Defecto funcional probado | **Corregido** |
| Indicadores TCA | bug | Defecto funcional probado | **Corregido** |
| `console.log` × 2 | **F** | 0 lectores; fuga de dato sensible | **Eliminados** |
| `manifest.theme_color` | **E** | Divergencia entre dos fuentes | **Alineado** |
| Test de S7 intermitente | bug de test | I/O de red real innecesaria | **Hermetizado** |
| `prefs:global` | **D** | 0 lectores, pero migrador de datos legacy | **Conservado** |
| `experienceLevel` | **C** | 50 lecturas prod; condiciona selección de método | **Conservado** |
| `coachLevel` | **C** | 11 lecturas prod; escritor en Perfil | **Conservado** |
| `codulia_api_key` | **C** | Credencial local con UI, lectura y `accountWipe` | **Conservado** |
| `.env.local` (`VITE_GROQ_API_KEY`, `VITE_NINJA_API_KEY`) | **G** | Sin lectores de código; decisión del operador | **Conservado** |
| `profile.cycle` | **B** | 14 lecturas; fallback legacy con consumidor activo | **Conservado** |
| `routine.cycle` | **B** | 10 lecturas; fallback legacy | **Conservado** |
| `methodSelector` | **C** | Contrato síncrono con 2 consumidores | **Conservado** |
| `trainingGoal` / `goalPrimary` / `goal` | **A** + **B** | Canónico con fallback documentado | **Conforme** |
| `toISOString()` (158) | **B**/legítimo | Timestamps reales + fixtures + roundtrip | **Conservado** |
| `global.d.ts` | **G** | Limitación de tooling, no de runtime | **Conservado** |
| `water250` (atajo manifest) | **G** | Sin lector; no bloquea | **Deuda futura** |
| SW `skipWaiting` sin coordenadas | **G** | Discutido en S1M-A | **Deuda futura** |
| `exigencia` como "p75 %" | **H** | No es un porcentaje | **Falso positivo** |
| IMC duplicado, `completedCount*20`, 250 ml | **G** | Sin impacto en FASE 2 | **Deuda futura** |

### 3.1 Las dos eliminaciones de código muerto, en detalle

**`getTodayLocalDate` — F**
- Definición en `src/services/storage/db.ts`; ninguna otra coincidencia en `src/` ni `worker/`.
- Sin importers, sin `export *`, sin acceso por namespace (`db['getTodayLocalDate']`), sin `bracket notation`, sin uso en strings de SW.
- Único consumidor: un bloque de 2 tests que solo comprobaba la propia función.
- El código ya usaba `todayKey()` de `@/utils/dates`: la función era un segundo reloj, es decir, exactamente el antipatrón que S7 vino a eliminar.

**`syncToLocalStorage` — F**
- Definición en `src/services/storage/routineStore.ts`; 0 coincidencias fuera de su propia definición.
- Sin lectores, sin escritores externos, sin referencias dinámicas.
- El store ya persiste exclusivamente en Dexie.

---

## 4. Evidencia

Búsqueda dirigida sobre `src/` y `worker/`, separando **código de producción** de **tests** (los tests por sí solos no prueban uso en runtime):

```
PATRÓN                     PROD   TESTS
getTodayLocalDate             0       1   (solo comentario explicativo)
syncToLocalStorage            0       0
getUTC                        0       0
profile.cycle                14       1
routine.cycle                10       0
getCycleFromProfile          12       1
trainingGoal                 77      64
goalPrimary                  24      12
profile.restrictions          7       2
limitations                  30      17
painAreas                    40       6
excludedExercises            22       6
nutritionPrefs               25      10
coachTone                    52      23
coachIntensity               21      26
coachPrefs                    8       7
toISOString                 158     119
prefs:global                  2       7
experienceLevel              50      13
coachLevel                   11       0
```

**Antipatrón UTC tras S9** (`toISOString().slice(0,10)` en producción): 6 ocurrencias, todas justificadas.

```
Inicio.tsx:783   roundtrip UTC simétrico (caso especial documentado en S7)
demoData.ts:43    fixture de demo (isDemo: true)
demoData.ts:81    fixture de demo
demoData.ts:221   fixture de demo
seeder.ts:21      seeder
seeder.ts:88      seeder
```

`migrateLocalStorage.ts` ya **no** aparece: era la 7ª ocurrencia y era un bug real. Ese es el cierre de la deuda #1 de S7.

**Nota sobre `getTodayLocalDate` en tests:** la única coincidencia que queda es el comentario del test que documenta por qué se eliminó. No es código.

---

## 5. Cambios

### 5.1 Eliminaciones (código muerto y depuración)

| Archivo | Cambio |
|---------|--------|
| `src/services/storage/db.ts` | Eliminada la función `getTodayLocalDate` y su import de `todayKey` |
| `src/services/storage/export.localDay.test.ts` | Eliminado el bloque de 2 tests que solo cubría esa función |
| `src/services/storage/routineStore.ts` | Eliminada la función `syncToLocalStorage` |
| `src/pages/Rutina.tsx` | Eliminado el import no usado `getCycleFromProfile` |
| `src/pages/Entrenar.tsx` | Eliminados 2 `console.log` de debug que imprimían datos de dolor |

### 5.2 Correcciones de bugs

**`src/services/ai/nutritionSafety.ts` — detector de TCA**

El detector de trastornos alimentarios usaba indicadores que no aparecían en el texto real del usuario, y comparaba sin normalizar acentos. "compulsión" o "compulsiva" no coincidían con el indicador `compulsiv`.

Antes: comparación literal, sensible a acentos y a género.
Ahora: normalización `NFD` sin diacríticos + tallos, cubriendo ambas formas.

```ts
const normalizeForMatch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const answer = normalizeForMatch(qa.answer || '')
if (tcaIndicators.some(indicator => answer.includes(indicator))) { /* … */ }
```

Tallos usados: `compulsi`, `atracon`, `purgar`, `purgacion`, `vomit`, `vomitar`, más los términos ya presentes

Detalle de implementación: el tallo es `compulsi` y no `compulsiv`, porque en "compulsión" la raíz deriva a `compuls-i-o-n` (sin **v**), mientras que en "compulsivo" es `compuls-i-v-o`. Solo `compulsi` cubre ambas formas y sigue siendo específico.

**`public/manifest.webmanifest` — fuente de color duplicada**

`theme_color` y `background_color` declaraban un color distinto del que la app usa de verdad. Ahora las tres fuentes coinciden, y coinciden con el tema light por defecto:

```
manifest.theme_color        = #F7F3EC
manifest.background_color   = #F7F3EC
index.html theme-color      = #F7F3EC
```

---

## 6. Conservado

Decisiones de no tocar, con la razón que las sostiene:

| Ítem | Por qué se conserva |
|------|---------------------|
| `prefs:global` | 0 lectores, pero es la **única** vía por la que las preferencias de Coach de un usuario pre-Dexie llegan a `coachMemory`. Eliminarlo es perder datos reales de usuarios existentes. Compatibilidad, no código muerto. |
| `experienceLevel` | Sin escritor actual, pero 50 lecturas en producción y **condiciona la selección de método** en el constructor de rutinas. Es entrada válida del dominio, no residuo. |
| `coachLevel` | Tiene escritor en Perfil, lector en `contextBuilder` y presencia en UI. Totalmente conectado. |
| `codulia_api_key` | Credencial local del usuario: tiene UI de configuración, lectura, borrado por `accountWipe` y test de seguridad. No es residuo técnico. |
| `.env.local` | Sin lectores de código, pero contiene material de credenciales. **No se modifica, no se inspecciona y no se muestran valores** en este reporte. Decisión del operador. |
| `profile.cycle` / `routine.cycle` | Sigue teniendo consumidores activos. S3 ya fichó su deprecación planificada; S9 no la ejecuta. |
| `methodSelector` | Contrato síncrono con 2 consumidores. El problema detectado es de latencia percibida, no de corrección. S3 lo cerró. |
| `toISOString()` restante | Los timestamps ISO son representation correcta y la fuente de verdad de los campos `createdAt`/`updatedAt`. Los 6 antipatños de fecha civil están en fixtures, seeders y un roundtrip UTC simétrico. |
| `global.d.ts` | Limitación del shim de tipos de `jest-dom`, no del runtime. Ampliarlo es deuda de tooling. |

---

## 7. Migraciones modificadas

### `src/services/storage/migrateLocalStorage.ts` — fase 8 (`coachMemory`)

**Defecto:** el registro de preferencias de Coach se escribía con fecha UTC en un campo cuyo significado es fecha civil local.

```ts
// antes — día UTC
date: new Date().toISOString().slice(0, 10),

// ahora — día civil local, la misma capa canónica que usan las fases vecinas
import { todayKey } from '@/utils/dates'
date: todayKey(),
```

**Por qué importa:** las fases vecinas de esta misma migración escriben `date: key`, donde `key` ya es un día civil. La fase 8 era la única que se saltaba la convención. En cualquier huso al oeste de UTC, entre las 21:00 y las 24:00 locales, la migración escribía **mañana** en un campo que significa "hoy".

**Alcance real del defecto:** latente. Solo se activaba al re-ejecutarse la migración en un entorno limpio (instalación nueva, o después de limpiar IndexedDB), y corrompía un día la marca de tiempo de las preferencias migradas.

**Compatibilidad:** la cambio no altera el esquema, ni las claves, ni el `id` (`prefs:global`), ni el `type`, ni el `data`. Solo el valor de un campo que estaba mal desde siempre. La migración sigue siendo idempotente (verificado en test).

---

## 8. Tests

### 8.1 Tests nuevos

**`src/services/ai/nutritionSafety.tca.test.ts` — 6 tests**
Cubren: detección con tilde, sin tilde, variante femenina, negación explícita, ausencia de indicadores, y datos históricos corruptos que no deben disparar la alarma.

**`src/services/storage/migrateLocalStorage.localDay.test.ts` — 4 tests**
- A las 21:30 escribe el día local y **nunca** el día UTC (con aserción explícita de que el día UTC sería mañana, para que el test no sea vacuo).
- A la 01:00 escribe el día local.
- El contenido de las preferencias legacy se migra sin alterationes.
- La migración sigue siendo idempotente: re-ejecutarla no duplica la fila ni cambia la fecha.

Ambos usan `vi.useFakeTimers({ toFake: ['Date'] })` con instants construidos en hora **local** (`new Date(y, m-1, d, h)`), de modo que fallan si alguien reintroduce UTC. El caso 21:30 está elegido precisamente porque es la franja horaria donde el bug es observable.

### 8.2 Test existente hermetizado

**`src/services/ai/routineBuilderIA.localDay.test.ts`** (de S7)

Durante los gates de S9 este test falló de forma intermitente: 1 de cada ~3 corridas de suite completa. Causa raíz verificada:

- El fallback local de `routineBuilderIA` pide ejercicios con `fetchByMuscle()`, que hace **`fetch` real a `cdn.jsdelivr.net`** (`exerciseGym.ts:6`, `:49`, `:61`).
- `routineBuilderIA.ts:91` lanza `Promise.allSettled` sobre varios músculos, es decir, N peticiones HTTP por día de entrenamiento.
- El test solo asserta `cycle.startDate` y `cycle.trainingDays.length`, **ambos construidos 100% en local** (vía `buildCycleFromMethod`): la red es irrelevante para lo que verifica.
- Con 84 archivos en paralelo, esas peticiones compiten por el mismo CDN y llegaban a superar el timeout de 5 s de vitest.

Es un defecto preexistente del test de S7, no una regresión de S9. **No se eliminó ni relajó ningún test ni ninguna aserción.** Se mockeó `@/services/exerciseGym`, que es el patrón que ya usan `VariantPicker.test.tsx`, `Biblioteca.favorites.test.tsx` y `Entrenar.nav.test.tsx`. Verificación: 6/6 corridas aisladas y 3/3 corridas de suite completa limpias, frente a ~1 fallo de cada 3 antes del cambio.

### 8.3 Aritmética de la suite

| | Archivos | Tests |
|---|---|---|
| Baseline S8 | 82 | 663 |
| Tests eliminados (función muerta) | — | −2 |
| TCA | +1 | +6 |
| Migración | +1 | +4 |
| **Total S9** | **84** | **671** |

---

## 9. Verification sources

Auditoría dirigida de los 20 patrones solicitados (ver §4) y **checkpoint de arquitectura**, invariante por invariante:

| Invariante | Estado | Evidencia |
|---|---|---|
| Una fuente de verdad por concepto | ✅ | Tono de Coach resuelto solo por `resolveCoachTone` (`coachPersonality.ts`), usado por `Coach.tsx`, `Perfil.tsx`, `chatContext.ts`, `coachCore.ts`. Sin implementación paralela. |
| Sin duplicación persistente | ✅ | S9 eliminó la última divergencia detectable: el color del manifest. `prefs:global` es un Producto de migración **exento** de borrado por compatibilidad. |
| Ciclos canónicos | ✅ | Precedencia única vía `getActiveVersion` (`cycleVersions.ts`) en `PeriodizationEditor`, `useTrainingSession`, `Calendario`. |
| `trainingGoal` canónico | ✅ | `resolveTrainingGoal` (`utils/trainingGoal`) con fallback explícito a `goalPrimary` en `Mas.tsx` y `Nutricion.tsx`. |
| Restricciones separadas por dominio | ✅ | `getNutritionRestrictions` ≠ `getTrainingLimitations` / `getPainAreas` / `getExcludedExercises` (`utils/restrictions`), con documentación que prohíbe mezclarlas. |
| Coach, resolución única de tono | ✅ | Ver primera fila. Sin tono calculado inline en la UI. |
| Fechas civiles locales | ✅ | 45 archivos importan la capa central `@/utils/dates`. Los 6 antipatrones restantes están en fixtures/seeders + 1 roundtrip UTC simétrico. |
| Timestamps reales intactos | ✅ | `toISOString()` preservado para `createdAt`/`updatedAt`; S9 no lo tocó. |
| Fallback legacy donde corresponde | ✅ | `profile.cycle`, `routine.cycle`, `goalPrimary`, `prefs:global` se leen y degradan con elegancia; ninguno se borró. |
| Sin datos ficticios | ✅ | No se añadieron placeholders ni mocks de datos en producción. Los mocks de S9 viven solo en tests. |
| Sin regresiones en los 7 dominios | ✅ | 671/671 tests verdes; `tsc` limpio. |

**Dominios verificados:** entrenamiento, nutrición, recuperación, progreso, Coach, onboarding, y configuración de perfil. El ciclo completo (onboarding →"Rutina" → "Entrenar" → Progreso) no presenta rutas rotas.

---

## 10. Legacy compatibility

- **Usuarios pre-Dexie:** sus preferencias de Coach (`localStorage['coachPrefs']`) siguen migrándose. La corrección de §7 cambia el valor de un campo, no la existencia del registro ni su contenido.
- **Idempotencia:** verificada por test. Re-ejecutar la migración no duplica filas ni altera fechas ya escritas.
- **Perfil antiguo sin `trainingGoal`:** sigue resolviendo por `goalPrimary`/`goal`.
- **Ciclos antiguos:** `profile.cycle` y `routine.cycle` siguen siendo leídos; ningún consumidor se rompió.
- **`prefs:global`:** se conserva deliberadamente **porque** es el canal de compatibilidad. Borrarlo habría sido romper datos de usuarios reales.
- **Base de datos:** sin cambios de esquema. Ninguna tabla, índice ni versión fue modificada en S9.
- **Contratos públicos:** ninguno alterado. `methodSelector`, `getActiveVersion` y `resolveCoachTone` mantienen sus firmas.

---

## 11. Check release

```
> npm run check:release
[check:release] OK: sin claves de API embebidas en dist/ (94 archivos revisados)
exit=0
```

Ejecutado **después** del build final, sobre el `dist/` real, no sobre el baseline de S8.

Comprobaciones que cubre el script: prefijos de clave (`gsk_`), valores de `VITE_GROQ_API_KEY`, URLs de proxy/API, y referencias a servicios externos (Ninja/CalorieNinjas) embebidas en el bundle.

**Higiene de secretos en S9:** no se imprimió ni se registró el valor de ninguna credencial. La auditoría de `.env.local` y de `codulia_api_key` se hizo **solo por nombre de clave**. No se modificó, rotó ni eliminó ninguna credencial, y no se despliega ni se toca infraestructura de Cloudflare.

---

## 12. Gates

| # | Gate | Comando | Resultado |
|---|------|---------|-----------|
| 1 | Tipos | `npx tsc --noEmit` | ✅ exit 0, 0 errores |
| 2 | Tests | `npx vitest run` | ✅ **84/84 archivos, 671/671 tests** |
| 3 | Build | `npm run build` | ✅ exit 0, `✓ built in 10.09s`, PWA generado (`sw.js` + `workbox-89e594d6.js`) |
| 4 | Lint | `npm run lint` | ✅ **0 errores / 211 warnings** |
| 5 | Release | `npm run check:release` | ✅ exit 0, 94 archivos |

**Sobre el gate 4:** el script usa `--max-warnings 0`, así que devuelve exit 1 por diseño mientras existan warnings. La comparación relevante es contra el baseline, medido con `-f json` y sumando `errorCount`/`warningCount`:

```
baseline S8:  0 errores / 213 warnings
resultado S9: 0 errores / 211 warnings
delta:        0 errores / −2 warnings
```

Los −2 warnings son exactamente los dos `console.log` eliminados de `Entrenar.tsx` (regla `no-console`). **Cero warnings nuevos.** No se silenció ninguna regla ni se añadió `eslint-disable`.

**Sobre el gate 2:** se ejecutó 3 veces consecutivas con resultado idéntico, precisamente por el defecto de intermitencia descrito en §8.2. La pass anterior a la hermetización mostraba 1 fallo de cada ~3.

**Comparación con el baseline de S8:** +2 archivos de test, +8 tests, 0 errores de tipos, 0 errores de lint, −2 warnings, release limpio. Ninguna métrica de calidad retrocedió.

---

## 13. Deudas futuras

Registradas para decisión, **no** ejecutadas en S9. Ninguna bloquea FASE 2.

| Deuda | Riesgo | Acción propuesta |
|-------|--------|------------------|
| `.env.local` sin lectores (`VITE_GROQ_API_KEY`, `VITE_NINJA_API_KEY`) | credenciales en disco de desarrollo | Rotar yexternalizar en FASE 3 |
| `global.d.ts` con 3 matchers de `jest-dom` | Fricción al añadir matchers nuevos | Declarar los tipos de `vitest` directamente |
| `profile.cycle` y `routine.cycle` | dos fuentes de verdad del ciclo | Deprecación planificada en S3; Consumers activos impedían borrarla |
| Atajo `water250` en el manifest | sin lector; ruido de superficie | Eliminar o cablear |
| `skipWaiting` del Service Worker sin coordenadas | comportamiento de actualización no determinista | Decidir semántica de actualización |
| 211 warnings de lint | deuda técnica real, mayoritariamente `any` y deps de efectos | Campaña por módulo, no masiva |
| Duplicación de IMC y otros cálculos derivados | riesgo de divergencia numérica | Unificar en `utils/` |
| Tests con I/O de red real | intermitencia y CI frágil | Auditar `exerciseGym` y los tests que lo consumen |
| `experienceLevel` sin escritor | entrada potencialmente inalcanzable desde la UI | Confirmar si debe exponerse o deprecarse |

**Moraleja operativa:** dos de estas deudas (`.env.local` y los tests con red) eran de clase "parecían menores y resultaban frescas". La primera está en el informe de 1M-A desde el inicio; la segunda se destapó recién al correr los gates. Ninguna era bloqueante, pero ambas se corrigen mejor ahora que después de que se multipliquen.

---

## 14. Conclusión

**FASE 2 queda cerrada.**

S9 hizo exactamente lo que debía: un inventario con evidencia, cuatro eliminaciones de código muerto justificadas, dos correcciones de bugs funcionales, una hermetización de test, un cleanup de depuración, y un cierre verificable. No tocó arquitectura, ni modelo de datos, ni navegación, ni infraestructura.

**Balance:**

- **Código eliminado:** 4 (+1 import muerto, +2 `console.log`) — los 4 con prueba de 0 consumidores.
- **Bugs corregidos:** 2 (fecha UTC en migración, detector TCA) — ambos con test de regresión.
- **Deuda conservada con justificación:** 9 ítems.
- **Deuda futura registrada:** 9 ítems.
- **Gates:** 5/5 verdes. +8 tests, 0 errores de tipos, 0 errores de lint, −2 warnings, release limpio.
- **Arquitectura:** 11 invariantes conformes.

**Sobre el criterio de S9.** La tentación de un subfase de limpieza es convertirla en una reescritura oportunista. Se resistió. `prefs:global` tenía 0 lectores y aun así se conservó, porque borrarlo habría perdido datos de Coach de usuarios reales. `experienceLevel` no tiene escritor y se conservó, porque 50 llamadas de producción dependen de él. `profile.cycle` es duplicado y se conservó, porque tiene consumidores vivos y su deprecación ya estaba planificada en S3. Eliminar código "sin referencias en la UI" habría sido un ahorro de líneas a costa de datos, comportamiento o de la trazabilidad de decisiones futuras. La deuda que no se puede pays es la que se documenta, y así quedó.

**Una corrección de proceso.** El test intermitente de S7 estuvo desde el principio, pero S7 y S8 lo pasaron por verde sin notar que dependía de red real. El fallo no lo causó S9, pero S9 lo encontró. Un gate que pasa por suerte no es un gate: por eso el gate 2 se ejecutó tres veces. La lección queda registrada en §13: los tests que hacen I/O de red necesitan revisión, y un CI verde una vez no es evidencia de nada.

**Siguiente paso:** el checkpoint final de FASE 2. No se inicia FASE 3 desde este reporte.

---

*Reporte generado en S9 · 2026-09-25 · 14 secciones · gates 5/5*
