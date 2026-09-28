# ALTHEA — CIERRE COMPLETO (FASE A · B · C)

**Fecha:** 2026-09-28
**Alcance:** orden de cierre total: cadena de datos, lógica de series, todas las fases Wger, requisitos visuales y documentación final.
**Resultado:** **CERRADO EN CÓDIGO.** Gates en verde. Las dos acciones externas de credenciales de `ALTHEA_FINAL_CLOSURE.md` §11 siguen pendientes y no dependen de este trabajo.

---

## 1. Reglas con las que se cerró

1. Sin preguntas ni confirmaciones intermedias.
2. Sin auditoría general repetitiva: investigación dirigida sólo donde hizo falta.
3. No se cierra una fase con código incompleto, muerto, duplicado, hardcodeado, mocks como funcionalidad, doble fuente de verdad ni tests rotos.
4. Arquitectura respetada: `Dexie = verdad local`, `Wger = enriquecimiento`, ninguna fuente eliminada antes de validar sustitución y documentar la decisión.
5. Sin push, sin PR, sin deploy.

---

## 2. FASE A — Cadena de datos rutina → sesión (completa)

Cada ejercicio de la rutina llega a la sesión con sus propios datos, y cada serie conserva lo suyo.

| Pieza | Cambio |
|---|---|
| `domain.ts` | `SessionExercise` con `restSec/seriesType/tempo/targetRir/targetRpe/notes`; `SetRecord` con `actualLoadText` (valor + unidad originales tipeados) |
| `setPlanner.ts` | `resolveSetType(seriesType?)` con labels ES y tokens piramidal/descendente (consumido por `ExerciseSeriesTable`) |
| `sessionStore.ts` | `createSession` persiste descanso, tipo de serie, tempo, RIR/RPE, notas y `setType` por serie; `prunePendingSetRecords`; `exercisesOf` propaga todo desde la rutina; `confirmSetRecord` guarda `actualLoadText` y sólo conserva el peso anterior si el peso ejecutado coincide |
| `useExerciseState.ts` | `SessionEx` con `restSec/tempo/rir/rpe/notes` |
| `ExerciseSeriesTable.tsx` | notas por serie (no por ejercicio), chips `planMeta`, índice de serie activa corregido (`nextUncompletedIdx = -1` cuando ninguna está pendiente) |
| `Rutina.tsx` | bloque «Descanso y objetivos»: descanso, tipo, tempo, RIR/RPE, notas |
| `loadModel.ts` | `fromKg()` (null sin equivalencia conocida) + `roundLoad()` |
| `ExerciseSeriesTable.tsx` | toggle KG/LB con `aria-pressed`, guardado siempre en kg canónico, número solo interpretado como libras, «2 placas» no inventa kg (hint sin equivalencia), 0 = sin peso |

**Tests nuevos:** `sessionChain.test.ts` (9) y `loadUnits.test.tsx` (4). Cobertura del ciclo completo: `saveRoutine → setActiveRoutineId → getDayExercises → createSession → confirmSetRecord`.

---

## 3. FASE B — Wger: integración completada y decisiones documentadas

- **Biblioteca** (`Biblioteca.tsx`): `syncWger()` con import automático de primer arranque (flag `wger:autoImport:v1`, sólo con 0 registros y online), refresh con `load('muscle','__all__')`, card «Catálogo Wger» en desktop y barra compacta con «Sincronizar» en mobile.
- **Comparación de fuentes:** `wgerComparison.ts` exportado desde `wger/index.ts`. Wger `912` vs `ExerciseGymGifsDB` `1323` → **`DECISION = MANTENER_AMBAS`**: ninguna fuente se elimina; la biblioteca actual, las APIs de ejercicios/nutrición, `customExercises`, rutinas, historial, PR/1RM, periodización, Recovery, Coach, Firebase y Dexie siguen intactos.

### 3.1 Decisión: fetchers eliminados (sin pérdida de datos)

Se eliminaron funciones que nadie llamaba y que duplicaban trabajo ya cubierto:

| Eliminado | Por qué no hace falta |
|---|---|
| `fetchWgerTaxonomy` (`wgerAdapter`) | La taxonomía y las traducciones viajan dentro de `exerciseinfo` y ya las resuelve `wgerMapper` |
| `fetchMuscles`, `fetchEquipment`, `fetchCategories`, `fetchExerciseTranslations` (`wgerClient`) | Mismo motivo: endpoints redundantes respecto de `exerciseinfo` |
| `fetchIngredients` (`wgerClient`) | Ingredientes pertenecen al módulo propio de nutrición, no al catálogo de ejercicios |

Consecuencias verificadas: `wgerClient → wgerMapper → wgerAdapter → Dexie → Althea` sigue siendo la única puerta de entrada; `altheaId = wger-{id}` y `wgerProvenance` no cambian; las fábricas `vi.mock('./wgerClient')` de los 4 tests Wger se limpiaron y la suite queda verde.

**Tests Wger:** `wgerIntegration.test.ts` (14), `wgerOffline.test.ts` (4), `wgerDuplicates.test.ts`, `wgerAdapter.test.ts`.

---

## 4. FASE C — Requisitos visuales y funcionales

| Requisito | Estado | Evidencia |
|---|---|---|
| Día completado ⇒ sin «COMENZAR» ni segunda sesión | CERRADO | `Inicio.tsx` (guard `todayCompleted` + chips `inicio-day-done` / `inicio-start-done`); redirect `/entrenar → /inicio` ya existente. Test nuevo en `Inicio.entrenar.test.tsx` |
| ErrorBoundary global y por página | CERRADO | `App.tsx`: `App`, `Entrenar`, `Progreso` (en `/progresos` y `/progreso`), `Coach`, `Nutricion`. Tests en `ErrorBoundary.test.tsx` (3) |
| Calendario con detalle completo | CERRADO | macros P/C/G del día, estados honestos («Sin comidas registradas», «Sin datos», «Sesión pendiente de registrar», «Sin sesiones registradas este día») |
| Paleta Althea | CERRADO | `SyncStatusCard`, `Perfil`, `Rutina` y `Biblioteca` sin verde/violeta/naranja puros: sólo tokens `primary/secondary/tertiary/error/surface/outline` |
| Targets táctiles 48px | CERRADO | 17 `min-h-[44px]` → `48px` en `Entrenar.tsx` (resto del código ya en 48) |
| Seeds sin contaminar métricas | VERIFICADO | `generateSeedSerie` sólo alimenta «última vez» (UI muestra «sin datos» si `isSeed`); no entra a métricas ni a BD |
| avgRPE muerto en Inicio | CERRADO | eliminado; `dayStatus.rating` toma `postWorkoutSurveys.sessionRating`; KPI renombrado a «INTENSIDAD MEDIA (PLAN)» con RPE planificado real |

### 4.1 Progreso simplificado (decisión + sustitución)

La página queda con **mapa corporal + 1 selector de período + resumen pequeño (3 KPIs) + bloque de informe PDF**, es decir dentro del límite de 2 selectores.

Se retiraron del dashboard: «Evolución por parte muscular» (selector de parte + 6 métricas + LineChart + sparklines), «Recuperación» (gauge + sparkline) y «Resumen nutricional» (medias + barras de 7 días).

**Sustitución validada antes de retirarlos:**

- Recuperación y nutrición ya viven completas en el informe PDF (`reportService`, secciones seleccionables `recuperacion` / `nutricion`).
- La serie temporal de volumen pasó al PDF: `reportService` calcula `entrenamiento.serieDiaria[]` (fecha, volumen kg×reps, series) desde `setRecords` reales; `reportPdf` dibuja «Volumen diario · últimos N días» con las mismas barras vectoriales del resto del documento; `ReportModal` muestra las últimas 7 fechas como vista previa.
- Fuerza (`progresoPorEjercicio`, 1RM Epley) y carga muscular siguen en el PDF.
- **No se borró ningún dato fuente**: `allLogs`, `bodies`, `recovery`, `trainingSessions` y los cálculos de KPI siguen en Dexie.

Tests: `Progreso.blocks.test.tsx` (estructura y ausencia de bloques profundos) y `Progreso.periodo.test.tsx` (período y rango personalizado, antes `Progreso.evolucion.test.tsx`).

### 4.2 Código muerto eliminado en este cierre

`avgRPE` (Inicio), `weightData`, `bucketTotal`, `measures`, `numOrNull`, `metricValueOf`/`DayAgg`/`METRICS`/`METRIC_HELP`, `partSel`/`metric`/`customNames`/`unmapped`, query `db.sessions` que se descartaba en el destructuring, import de `projectProgress` sin uso, y los fetchers Wger de la sección 3.1.

### 4.3 Test hecho hermético

`sessionStore.test.ts` · «7. Ejercicio excluido nunca aparece como variante» llamaba a `fetchAll()` (CDN jsDelivr) y fallaba con `TypeError: fetch failed` cuando la red fallaba. Ahora usa una fixture local: la regla depende del id excluido, no del catálogo remoto. **Ningún test depende ya de red para pasar.**

---

## 5. Gates finales

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0, 0 errores |
| `npx vitest run` | **121/121 archivos, 1012/1012 tests** |
| `npm run build` | PASS, PWA emitido (69 entradas de precache) |
| `npm run lint` | 0 errores / 166 warnings (= baseline) |

Crecimiento sobre el cierre Wger anterior (118 archivos / 995 tests): **+3 archivos, +17 tests**.

---

## 6. Contadores reales

- `src/` sin tests: **184 archivos, 33 767 líneas**
- Tests: **121 archivos**
- Páginas: **14** · Componentes: **40** · Servicios: **100**
- Rutas mantenidas: `/`, `/entrenar`, `/progresos`, `/calendario`, `/nutricion`, `/recuperacion`, `/rutina`, `/biblioteca`, `/perfil`, `/coach`, `/mas`

---

## 7. Pendientes externos (no de código)

Siguen vigentes los dos puntos de `ALTHEA_FINAL_CLOSURE.md` §11:

1. Revocar la API key histórica de GroqCloud (consola del proveedor; si se genera una nueva, actualizar el secret del Worker antes de borrar la anterior).
2. Invalidar la API key de CalorieNinjas desde la consola de la cuenta.

No hay ninguna acción técnica de código pendiente en el proyecto.

---

## 8. Actualización (2026-09-28) — cierre de orden posterior

Tras este documento se ejecutó una orden de cierre adicional (gasto calórico del ejercicio e informes PDF). Contadores y gates actuales:

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0, 0 errores |
| `npm test` | **124/124 archivos, 1041/1041 tests** (0 fallidos) |
| `npm run build` | PASS, PWA emitido (71 entradas de precache) |
| `npm run lint` | 0 errores / 166 warnings (= baseline; 0 nuevos) |

Crecimiento sobre este cierre (121 archivos / 1012 tests): **+3 archivos, +29 tests**.

Lo nuevo, sin tocar la cadena de datos existente:

- **Gasto calórico del ejercicio** con motor único `src/services/training/exerciseEnergy.ts` (duración medida − pausas × peso registrado → MET 6.0), compartido por Inicio (`inicio-gasto-calorico`: hoy + semana), historial (`Calendario`: sesión y total del día) e informes.
- **Informes PDF** con modos semanal / mensual / personalizado, completadas e incompletas, duración medida, gasto, distribución, días extremos, observaciones, destacados, PRs y conclusiones (documentación: `docs/INFORMES_PDF.md`).
- Verificación local de credenciales y gates: `ALTHEA_FINAL_CLOSURE.md` §13.

Los dos pendientes externos de §7 siguen vigentes e intactos.

---

## 9. Actualización final (2026-09-28) — cierre de lint, T032 y credenciales

Orden posterior al apartado 8, ejecutado el mismo día. Sólo se tocaron los cabos abiertos que dejó `af8735a`: lint, auditoría del motor MET, credenciales, T032 y documentación.

| Gate | Resultado | Estado |
|---|---|---|
| `npm run lint` | **exit 0 — 0 errores / 0 warnings** (`--max-warnings 0` sin excepciones) | **PASS** |
| `npx tsc --noEmit` | exit 0, 0 errores | **PASS** |
| `npm test` | 124 archivos / 1041 tests / 1041 aprobados / 0 fallidos | **PASS** |
| `npm run build` | PASS, PWA emitido (71 entradas de precache) | **PASS** |
| `npm run check:release` | OK: sin claves en `dist/` (70 archivos) | **PASS** |
| Lighthouse 11.7.1 (local) | PWA **100/100** · Performance **75/100** · JS inicial ≈400 KB gz | **PARCIAL** (ver `ALTHEA_FINAL_CLOSURE.md` §14) |

Cómo se resolvieron los 166 warnings históricos, sin tocar `eslint.config.mjs`:

- **104 `curly`** → llaves añadidas (`eslint --fix`, revisado: 104 líneas, sólo sintaxis).
- **42 `eqeqeq`** → equivalencia semántica exacta (`x != null` → `x !== null && x !== undefined` y viceversa); cero cambio de comportamiento.
- **17 `react-hooks/exhaustive-deps`** → dependencias completadas donde faltaban valores reales; patrón ref para valores que cambian por render (`RecoveryCheckForm.onChange`, `Entrenar.load`); `refreshKey` movido al effect de `WaterBottle`; `loadCoachRecommendation` reordenado en `useExerciseState` (evita TDZ); dependencias sobrantes eliminadas donde el cuerpo no las usa (`sessionId` en `useExerciseState` y `PainToggle`, `active?.cycle`/`active?.createdAt` en `Rutina`); `muscles` memoizado en `Rutina.IntelligentPicker`.
- **3 `no-console`** → decisión estructural en `src/services/logger.ts`, documentada en `ALTHEA_FINAL_CLOSURE.md` §15 (consola sólo para `warn`/`error`, `debug`/`info` por el pipeline de listeners; `logger.test.ts` actualizado al contrato corregido).

Auditoría del motor MET (sin cambiar ningún valor): `EXERCISE_MET = 6.0` y `EXERCISE_ACTIVITY` están centralizados y documentados con fuente en `exerciseEnergy.ts:18-20` (Compendium 2024); la fórmula `kcal/min = MET × 3,5 × peso ÷ 200` existe en un solo lugar (`metExpenditure.ts:63`); ningún componente de UI calcula kcal (Inicio/Calendario/informes sólo formatean el resultado de `computeExpenditure`/`sessionEnergy`); el único otro `6.0` es la fila de la tabla Compendium (`metExpenditure.ts:17`) y las aserciones de tests.

Credenciales re-verificadas hoy (§13): sin claves en `src/`, `dist/`, árbol rastreado, ni historia git (las únicas coincidencias de `gsk_` son patrones de los scripts de verificación y documentación); `.env`/`.env.local`/`.env.production` en `.gitignore`; sólo `.env.example` rastreado. **Siguen pendientes únicamente las 2 acciones externas de §7/§11.**

T032: verificado localmente con Lighthouse (apartado `ALTHEA_FINAL_CLOSURE.md` §14); `quickstart.md` sí existe (`.specify/specs/001-pwa-entrenamiento-mvp/quickstart.md`), lo que corrige la nota anterior. **Estado: PARCIAL** (PWA ✓, build ✓; performance y tamaño de bundle ✗).

---

*Actualización de contadores y gates. Los apartados 1–7 describen el estado original de este cierre y el 8 su primera actualización.*
