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

Los 12 tests `skipped` son los E2E de WGER, que requieren credenciales (`WGER_TEST_USERNAME` / `WGER_TEST_PASSWORD`) no disponibles localmente.

## Commits de esta tanda (7)

1. `f82c8b4` fix(entrenamiento): el cierre por medianoche cuenta como día parcial
2. `30ebdd2` refactor: eliminar código muerto — 167 bindings + 11 archivos huérfanos
3. `000df94` fix: cuatro defects latentes detectados por el análisis de código muerto
4. `9bf7f37` fix: elimina hardcodeo de colores y números mágicos en la UI
5. `d2458fc` fix: unifica el prefijo de claves WGER de planes de nutrición
6. `8063ce8` fix: respeta el aborto externo en wgerClient y elimina código muerto
7. `7b14c7b` refactor: consolida `prettyExId` compartido en `utils/format`

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
1. **Abort de requests WGER ignorado**: `wgerClient.request` no enlazaba `options.signal` del llamador al `AbortController` interno; ahora sí, y las 12 mutadoras le pasan su `signal`. El timeout de 15 s se mantiene.
2. **Prefijo de claves WGER inconsistente** para planes de nutrición (`nutritionplan/` vs `NUTRITION#`).
3. Hardcodeos de color y números mágicos sustituidos por tokens/constantes nombradas.
4. Cierre de sesión que cruza la medianoche: la porción previa contaba como día completo en vez de parcial.

### F5 · Deduplicación
- **`prettyExId` consolidado** en `src/utils/format.ts`: 5 copias exactas en Calendario, Mas, Perfil, reportPdf y reportService ahora usan el mismo helper (firma `string | number`).
- **`epley1RM` NO se unificó**: `reportService` redondea y trata `reps <= 1` como 1 RM, mientras `prs.ts` mantiene precisión para cálculos de progresión. Unir las dos cambiaría comportamiento; se documenta aquí como inconsistencia menor conocida.
- `isCompletedSession` / ErrorBoundary / macros: ya estaban centralizados (una sola definición, múltiples llamadores).

### F6 · Tokens y UI (completado en fases previas)
- Doble capa de tokens (`althea-tokens.css` + `index.css`): **diferido** — requiere migración estructural con validación visual amplia; fuera del alcance de solo-no-cambiar-comportamiento.

### F7 · Barrido amplio
- Mapeo de nombres vía texto UI en `Entrenar.tsx` (~línea 621): **diferido** — apunta a matching por nombre en lugar de por id estable; requiere rediseño a ids y regresión de tests de búsqueda.

## Decisiones de no-cambio (conservadas a propósito)

| Área | Motivo |
| --- | --- |
| Subárbol WGER (`wgerSyncEngine` + `WgerSyncPanel`) | Los subclientes (`measurements/` `nutrition/` `stats/` `training/`) se dejan como están: consolidarlos en `wgerClient` es un refactor amplio con credenciales y endpoints ligeramente distintos; se recomienda hacerlo en un milestone aparte. |
| `getJSON` duplicado en wger (5 copias) | Ídem: misma razón de riesgo/alcance. |
| Notificaciones / `exportImport` / `export` / `demoData` / seeder | Se revisaron; al no tener consumidores funcionales pero ser reutilizables/exportables, se conservan. `exportImport.ts` aún importa `sessionExercises` en la línea 9 que se documentó para futura revisión. |
| `stripAccents` inline (≈15 sitios) | Copias no exactas: cada sitio encadena operaciones distintas (trim, case, extra replaces en muscleMap/customExercises). Extraer utilitario `stripAccents` en `utils/format` y migrar progresivamente es la recomendación, pero tocar todos cambia matching de búsqueda/IA con riesgo de regresión silenciosa → diferido con tarea propuesta. |
| `SESSION_TRANSITIONS` | Constante de dominio; intacta. |

## Pendientes/Recomendaciones (próximo milestone)

1. Extraer `stripAccents` en `utils/format` y migrar los ~15 sitios inline uno a uno con tests de búsqueda.
2. Consolidar la doble capa de tokens CSS (validación visual).
3. Migrar `Entrenar.tsx` a mapeo por id estable en vez de nombre.
4. Revisar los subclientes WGER sobrantes para unificarlos en `wgerClient` (con tests E2E reales, requiere credenciales).
5. Ejecutar los 12 tests E2E WGER con credenciales para cerrar el gap de cobertura.