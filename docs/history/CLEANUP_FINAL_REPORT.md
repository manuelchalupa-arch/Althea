# Reporte final de limpieza y saneamiento (F1–F7)

Fecha: 2026-10-07 · Rama: `main` (sincronizada con `origin/main`)

## Resumen

El barrido de mantenimiento queda **completo y verificado** con 7 commits nuevos sobre `main` (pushed a `origin/main`). El proyecto conserva su funcionalidad intacta: toda la lógica muerta se eliminó sin cambiar comportamiento, los defects latentes detectados por el análisis se corrigieron y las únicas refactorizaciones de deduplicación se limitaron a copias **exactas** verificadas.

## Gates finales (estado verde)

| Gate | Resultado |
| --- | --- |
| `tsc --noEmit` | 0 errores |
| `tsc --noUnusedLocals --noUnusedParameters` | 0 diagnósticos |
| `eslint .` | 0 errores |
| `vitest run` | 131 archivos / **1268 passed** / 12 skipped |
| `build` | OK (PWA v0.21.2, precache 103 entradas) |
| `git diff --check` | 0 |
| Push `origin/main` | OK (`5b0a5ba..7b14c7b`) |

## Commits de esta tanda (7)

1. `f82c8b4` fix(entrenamiento): el cierre por medianoche cuenta como día parcial
2. `30ebdd2` refactor: eliminar código muerto — 167 bindings + 11 archivos huérfanos
3. `000df94` fix: cuatro defects latentes detectados por el análisis de código muerto
4. `9bf7f37` fix: elimina hardcodeo de colores y números mágicos en la UI
5. `7b14c7b` refactor: consolida `prettyExId` compartido en `utils/format`

## Detalle por fase

### F1 · Iconografía on-demand y purga de assets (etapa previa)
- IconFont: sincronización de rostros en Login/Onboarding; purga de **1.96 MB** de assets muertos; nuevo set de iconos resiliente con fallbacks en línea.
- Auditoría visual etapa 1 concluida con validación visual real.

### F2 · Tokens y tema (etapa previa)
- Consolidación de tokens, `theme_color` unificado, toggle de tema corregido, iconografía completa.

### F3 · Código muerto
- **167 bindings** eliminados (imports, variables, params, tipos) + **11 archivos huérfanos** retirados.
- Barrido final adicional en esta sesión: **81 → 63 → 54 → 0** diagnósticos de `noUnused`.
- Imports sin uso limpiados en 23–24 archivos (sin TS6133/TS6192 restantes).
- Stubs muertos eliminados: `useExerciseState` (`completeSet`/`skipExercise`/`swapExercise`/`modifyExercise`) y `useTrainingSession` (`finishSession`) — ninguno tenía consumidores.
- Params intencionalmente sin uso renombrados con convención `_` (exención oficial de TS): `_trend`, `_methodId`, `_wants`, `_localEntityId`, `_lastUpdateGte`, `_profile`, `_config`, `_recentVolume`, `_type`, `_cycle`, `_existingProvenance`.

### F4 · Defects latentes corregidos (en `000df94` y `8063ce8`)
1. Hardcodeos de color y números mágicos sustituidos por tokens/constantes nombradas.
2. Cierre de sesión que cruza la medianoche: la porción previa contaba como día completo en vez de parcial.

### F5 · Deduplicación
- **`prettyExId` consolidado** en `src/utils/format.ts`: 5 copias exactas en Calendario, Mas, Perfil, reportPdf y reportService ahora usan el mismo helper (firma `string | number`).
- **`epley1RM` NO se unificó**: `reportService` redondea y trata `reps <= 1` como 1 RM, mientras `prs.ts` mantiene precisión para cálculos de progresión. Unir las dos cambiaría comportamiento; se documenta aquí como inconsistencia menor conocida.
- `isCompletedSession` / ErrorBoundary / macros: ya estaban centralizados (una sola definición, múltiples llamadores).

### F6 · Tokens y UI (completado en fases previas)
- Doble capa de tokens (`althea-tokens.css` + `index.css`): **diferido, con confirmación** — requiere migración estructural con validación visual amplia. Se revisó de nuevo en el Prompt 3 y se mantiene el deferral: el agente no puede revisar imágenes, y una conversión masiva de clases sin revisión visual es exactamente el tipo de cambio riesgoso que este documento decide no hacer. **Acción requerida por el dueño**: revisar los PNG de `althea-shots/` y aprobar una migración en un milestone aparte.

### F7 · Barrido amplio
- ~~Mapeo de nombres vía texto UI en `Entrenar.tsx`~~ → **RESUELTO (Prompt 3, §2)**. Se creó `src/services/training/exerciseIdentity.ts`: resolución **por ID estable primero**, con fallback legacy por nombre **exacto** (normalizado y candidato único), etiquetado con su fuente (`custom-id` / `stored-id` / `legacy-name-exact` / `unresolved`). Cableado en `openViewer`, `loadSwapOptions` y `handleSessionLoaded`. El emparejamiento difuso quedó relegado a **pista de visualización** (`scoreNameMatch`, elige el GIF) y **nunca** cambia el `exerciseId` de la sesión. 21 tests en `exerciseIdentity.test.ts` cubren búsqueda, sustitución, variantes y sesiones antiguas.
- Se eliminó la duplicación de los dos mapas `muscleMap` inline (idénticos) → `apiMuscleFor()` en el mismo módulo. El lookup ahora usa fold (tolera acentos: antes `Bíceps` caía a `pectorals`); el alcance de `piernas` se mantiene conservador (`quads`, no la familia completa) para no cambiar comportamiento.

## Decisiones de no-cambio (conservadas a propósito)

| Área | Motivo |
| --- | --- |
| Notificaciones / `exportImport` / `export` / `demoData` / seeder | Se revisaron; al no tener consumidores funcionales pero ser reutilizables/exportables, se conservan. `exportImport.ts` aún importa `sessionExercises` en la línea 9 que se documentó para futura revisión. |
| ~~`stripAccents` inline (≈15 sitios)~~ | **RESUELTO (Prompt 3, §3)**. La migración ya estaba completa: la única implementación vive en `src/utils/format.ts:10` y los **16 consumidores** importan de allí. Lo que faltaba era cobertura: ahora hay `src/utils/format.test.ts` (24 tests) que fija el orden de operaciones (`toLowerCase` → NFD → quita diacríticos), la no-idempotencia del trim y el matching real de ejercicios/músculos. Sin cambios de comportamiento. |
| `SESSION_TRANSITIONS` | Constante de dominio; intacta. |
| Planificación de rutina (`routine.cycle`) | Tiene **su propio versionado** en `routineStore.saveRoutineVersioned` (snapshot por versión, no destructivo). Unificarlo con `db.cycleVersions` (`scope = routineId`) exige migración de datos sobre versiones ya persistidas → **cambio separado documentado**. |
| `methodSelector.getAvailableDays` (lee `profile.cycle.weekMap`) | Es una **entrada de recomendación sincrónica** (alimenta `selectMethods` → `buildCycleFromProfile`), no una lectura de presentación. Migrarla exige hacer async `selectMethods` y toda su cadena de llamadores → **cambio de alcance separado**. Además, la rama principal es `profile.schedule.availableDays` (la fija Onboarding). |

## Pendientes/Recomendaciones (próximo milestone)

1. ~~Extraer `stripAccents` en `utils/format` y migrar los ~15 sitios inline~~ → hecho; ahora cubierto por `format.test.ts`.
2. Consolidar la doble capa de tokens CSS (validación visual). **Requiere revisión humana de PNG.**
3. ~~Migrar `Entrenar.tsx` a mapeo por id estable en vez de nombre~~ → hecho (`exerciseIdentity.ts`).
4. Considerar unificar `routine.cycle` con `db.cycleVersions` (`scope = routineId`) en un milestone con migración de datos.
