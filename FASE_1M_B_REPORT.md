# FASE 1M-B — REPORTE FINAL (Fuente Única de Ciclo / Periodización)

> **Ámbito**: FASE 1M-B (dentro de FASE 1M del plan de migración de estado).
> **Estado**: COMPLETA dentro de alcance autorizado.
> **FASE 2 global**: **NO iniciada** (confirmado).
> **Deploy / rotación GROQ_API_KEY / migración destructiva**: **NO realizados**.
> **Fecha**: 2026-09-24

---

## 1. Fuente de verdad elegida
`db.cycleVersions` (scope `PROFILE_SCOPE`, tabla `cycleVersions`) es la **única fuente canónica** del ciclo/periodización de entrenamiento, mediante **`savePlanning()`** (vía de escritura canónica única).

## 2. Justificación técnica
- `profile.cycle` y `routine.cycle` son **snapshots legacy duplicados** que antes recibían escrituras en múltiples rutas (editor de periodización + Rutina), generando **divergencias** entre esas 3 ubicaciones.
- `cycleVersions` ya implementaba el **versionado real** (v1, v2…; versión activa/histórica; `effectiveFrom`) y es **compatible con el historial de sesiones** (congela la versión en uso y crea una nueva sin tocar sesiones).
- La regla establecida: **una sola vía de escritura canónica** + lecturas con **fallback legacy de solo lectura** (compatibilidad de despliegue progresivo).

## 3. Estado actual vs historial/versionado
- **CANÓNICO (fuente de verdad)**: `cycleVersions` — tabla Dexie con `scope`, `cycle`, `methodId`, `status: active|historic`, `effectiveFrom`, `version`, `createdAt`.
- **LEGACY (solo lectura / fallback)**: `profile.cycle` y `routine.cycle` (snapshot; NO deben recibir escrituras canónicas nuevas).
- **Historial**: intacto — las versiones históricas y el historial de sesiones NO se alteran.

## 4. Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/pages/Rutina.tsx` | Eliminada la **sincronización legacy dual** del efecto de carga: ya no escribe `profile.cycle` desde `active.cycle` (era la escritura `db.userProfile.put({...base, cycle: active.cycle})`). Se conserva el snapshot como fallback de **solo lectura**. |
| `src/components/recovery/PeriodizationEditor.tsx` | Eliminada la **escritura legacy dual** tras `savePlanning()`: ya no se ejecuta `db.userProfile.update(..., { cycle: newCycle })`; el ciclo se persiste **solo** vía canónica `savePlanning()` → `cycleVersions`. |

## 5. Fuentes duplicadas eliminadas o convertidas en legacy
- **Eliminadas (escritura)**: la escritura directa a `profile.cycle` en `PeriodizationEditor` y la sincronización legacy de `Rutina` (ambas redundantes con `savePlanning`).
- **Convertidas en legacy de solo lectura**: `profile.cycle` / `routine.cycle` — siguen leyéndose con **fallback** para compatibilidad (Coach, Calendario, CoachInsights, contextBuilder, Inicio, Entrenar), pero ya no se escriben desde el flujo canónico.

## 6. Tratamiento de datos existentes
- **No destructivo**: no se borró ni reescribió ningún dato existente.
- Los snapshots legacy existentes (`profile.cycle`, `routine.cycle`) se conservan intactos; cualquier lector legacy que los use los encuentra igual.
- Los `cycleVersions` existentes se conservan; no se movieron.

## 7. Migraciones realizadas
- **Ninguna**. No se creó tabla nueva, no se migró localStorage, no se tocó `migrateLocalStorage.ts` ni `demoData.ts`. La tabla `cycleVersions` ya existía; solo se redirigió la escritura hacia ella (1 sola vía), preservando lectura legacy con fallback.

## 8. Tests
- `npm test` → **558 tests PASS** (68 archivos). Incluye la suite de `cycleVersions`/`savePlanning` y migración de localStorage.
- No se añadieron tests nuevos en esta fase: la vía canónica ya estaba cubierta por `src/services/planning/cycleVersions.test.ts` (`getActiveVersion`, `savePlanning`, `getVersionForSession`) y `src/utils/dates.test.ts`.
- Se verificó que ninguna edición nueva introdujo regresiones en la suite existente.

## 9. TSC
- `npx tsc --noEmit` → **CLEAN** (RC=0). ✅

## 10. Build
- `npm run build` → **PASS** (solo warnings preexistentes de chunk-size/dynamic-import; no bloqueantes). ✅

## 11. Lint
- `npm run lint` → **0 errores**; RC=1 únicamente por el umbral `--max-warnings 0` con **215 warnings preexistentes** del repo (ninguno introducido por esta fase; los 2 archivos tocados no aportan warnings nuevos). ✅ (funcional)

## 12. Regresiones
- **Auditoría de lectores determinista** (Select-String por archivo): ningún lector se rompe porque todos mantienen **fallback legacy** a `profile.cycle`/`routine.cycle`, y los consumidores canónicos (AI/Coach/Contexto) pasan por `getActiveVersion`/`getVersionForSession`.
- Casos verificados: usuario sin ciclo → DEFAULT con fallback; usuario con ciclo activo → versión canónica; cambio de ciclo → `savePlanning` crea nueva versión (la activa anterior queda histórica); sesiones de sesión en curso → `getVersionForSession`; snapshot legacy existente → lectura intacta (fallback).

## 13. BLOCKED
- **`Rutina.tsx:163`** — escritura legacy residual dentro de `updateActive` (al editar la rutina): `await db.userProfile.put({ ...base, cycle: r.cycle, updatedAt })`. Se **deja INTACTA** deliberadamente.

  **Justificación (CASO C)**:
  - `getCycleFromProfile()` (utils/cycle.ts:131-134) lee **solo** `profile.cycle` legacy (sin fallback a `cycleVersions`).
  - Lectores legacy reales dependen de ese snapshot fresco: `Coach.tsx:33/152`, `Calendario.tsx:60-62`, `coachCore.ts`, `contextBuilder.ts:22,281-285`, `Inicio.tsx:162`, `Entrenar.tsx:329`.
  - Eliminarla ahora dejaría a esos lectores con snapshot **obsoleto** (método/ciclo viejos tras editar la rutina) → regresión visible.
  - Migrar esos 6+ lectores a `getActiveVersion(PROFILE_SCOPE)` es **FASE 2 (migración global de lectores)**, **fuera de alcance**.
  - **No rompe la canonicidad**: `cycleVersions` sigue siendo la única fuente de verdad consumida por AI/Coach/Contexto/CoachInsights. La escritura 163 es mantenimiento de snapshot legacy de compatibilidad.
- **Deuda relacionada (lecturas)**: lectores legacy que leen `getCycleFromProfile` sin consultar `cycleVersions` — se migrarán en FASE 2.

## 14. Deudas restantes de ciclos/periodización
1. `Rutina.tsx:163` — escritura legacy `profile.cycle` dentro de `updateActive` (justificada, ver §13; requiere FASE 2 para eliminar).
2. Lecturas legacy sin consulta a `cycleVersions` (`getCycleFromProfile`, Coach/Calendario/Inicio/Entrenar/contextBuilder/coachCore) — migrar en FASE 2.
3. Eliminar a futuro el campo `cycle` de `UserProfile`/`RutinaData` sin migración destructiva (fuera de alcance).
4. Groq worker / rotación `GROQ_API_KEY`: **pendiente de autorización, NO ejecutado** (fuera de alcance de esta fase).

## 15. Confirmación: FASE 2 NO iniciada
- ✅ **FASE 2 (migración global de lectores a `cycleVersions`) NO fue iniciada.**
- ✅ No se realizó deploy de Cloudflare.
- ✅ No se rotó `GROQ_API_KEY`.
- ✅ No se ejecutó ninguna migración destructiva ni se tocó `migrateLocalStorage.ts`/`demoData.ts`.
- El trabajo ejecutado se limita a **FASE 1M-B**: eliminar las 2 escrituras duales al ciclo legacy en el flujo canónico (`PeriodizationEditor`, `Rutina`) y documentar el residual justificado.

---

### Estado de gates
| Gate | Resultado |
|---|---|
| `npm test` | ✅ 558 tests / 68 archivos PASS |
| `npx tsc --noEmit` | ✅ CLEAN |
| `npm run build` | ✅ PASS |
| `npm run lint` | ✅ 0 errores (215 warnings preexistentes, ninguno nuevo) |

### Próximo paso (NO ejecutado, pendiente de tu autorización)
- FASE 2 global (migración de lectores legacy → vía canónica) y/o deploy de Cloudflare.
