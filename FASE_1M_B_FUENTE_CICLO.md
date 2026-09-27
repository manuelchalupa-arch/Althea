# FASE 1M-B — DECISIÓN: Fuente única de verdad para Ciclos/Periodización

> Documento de decisión (FASE 2) — se escribe ANTES de cualquier refactorización.
> Complementa a FASE_1M_A_REPORT.md (normalización de fechas locales). NO inicia
> FASE 2 global, NO hace deploy, NO rota claves.

## 1. Auditoría (FASE 1) — estado del ciclo en la app

Las siguientes estructuras REPRESENTAN o ALMACENAN el ciclo/periodización:

| Estructura | Ubicación | Rol actual | Persistencia | Historial |
|---|---|---|---|---|
| `profile.cycle` | `UserProfile.cycle` (types) | Legacy — config incrustada en perfil | Dexie `userProfile` | No |
| `routine.cycle` | `Rutina.cycle` (types) | Legacy — config incrustada en rutina | Dexie `routines` | No (la rutina sí se versiona) |
| `db.cycleVersions` | `planning/cycleVersions.ts` | **CANÓNICA** | Dexie `cycleVersions` | Sí — por versión |
| `db.weeklySequences` | `db.weeklySequences` | **DERIVADA** (planif. semanal por ciclo) | Dexie `weeklySequences` | No |
| `demoData.*.cycle` | demo | demo/demo fixtures | Solo demo | — |
| `migrateLocalStorage.*.cycle` | migración legacy | 1M-A JUSTIFICADO (migración 1-vía) | — | — |

### API canónica ya existente (cycleVersions.ts)
- `CycleVersion { id, scope, version, status: 'active'|'historic', effectiveFrom, methodId, cycle: CycleConfig, createdAt, note }`
- `PROFILE_SCOPE = 'profile'`
- `listVersions(scope?)`, `getActiveVersion(scope?)`, `getVersion(id)`
- `savePlanning(input): { version, created }` — con reglas de versionado:
  - sin versión previa → crea v1 activa
  - ciclo idéntico → no-op
  - planificación ya usada por sesiones → congela activa como `historic`, crea nueva `active`
  - no usada → actualiza la activa en su lugar
- `getVersionForSession(session)`, `isPlanningUsed(scope)`
- `groupSessionsByVersion(sessions)` → agrupa sesiones por versión vigente al ejecutarlas, **nunca las modifica**; sesiones sin cycleId → grupo `legacy`

## 2. Deci sión: FUENTE ÚNICA DE VERDAD

**`db.cycleVersions` (scope `profile`) es la única fuente de verdad persistente del
ciclo/periodización actual.**

Justificación (por criterios de la auditoría):
- **Persistencia e integridad**: tabla dedicada con PK y referencias via `cycleId` en sesiones en vez de dos campos incrustados duplicados (`profile.cycle` y `routine.cycle`) que pueden divergir.
- **Historial**: único modelo con versionado real (`CycleVersion.version` + `effectiveFrom` + estado `historic`) → permite "sesiones que apuntan a su versión vigente" sin recalcular (requisito de reduce-analytics).
- **Relaciones**: `cycleVersions.cycle` es `CycleConfig` tipado; `WeeklySequence.cycleId` y `TrainingSession.cycleId` referencian la versión — no el perfil ni la rutina.
- **Estado actual vs historial distinguido**: `status='active'` = estado vigente; `status='historic'` = historial. No asumimos historial como estado (regla FASE 2).
- **Escritura única**: `savePlanning()` es la ÚNICA vía de crear/actualizar el ciclo; no hay `update` sueltos sobre el campo `cycle` de profile/routine.
- **Compatibilidad**: los campos legacy se MANTIENEN como snapshot congelado (ver §3) para no romper datos ni forzar migración destructiva.

## 3. Regla de compatibilidad (sin migración destructiva)

- `profile.cycle` y `routine.cycle` pasan a **legacy de solo lectura / snapshot**: 
  - Se dejan de ESCRIBIR en las rutas nuevas (Onboarding, PeriodizacionEditor, Rutina).
  - Toda escritura se redirige a `savePlanning(scope)`.
  - Las lecturas conservadas que usan `profile.cycle` para datos como `weekMap`/`methodId` migran a `getCycleFromProfile()` que ya resuelve desde la versión activa de `cycleVersions` (con fallback legacy intacto).
- **No migración destructiva**: los datos históricos de las dos tablas legacy y `demoData` NO se tocan; solo se congela el estado actual en la versión activa la primera vez que la nueva escritura ocurra.
- **No inventar valores**: si no hay versión activa ni legacy → se usa el `DEFAULT_CYCLE`/`buildCycleFromMethod` existente (no se fabrica historia).

## 4. Sitios a reescribir (implementación FASE 3)

Archivos que leen/escriben `cycle` y deben apuntar al util único (`getCycleFromProfile` + `savePlanning`):
- `src/pages/Rutina.tsx` (editor): escrituras de `routine.cycle` → `savePlanning`.
- `src/pages/Onboarding.tsx`, `src/pages/Perfil.tsx`: default/lecturas.
- `src/pages/Calendario.tsx`, `Entrenar.tsx`, `Coach.tsx`, `Inicio.tsx`: lecturas `profile.cycle`/`routine.cycle` → util único.
- `src/components/recovery/PeriodizationEditor*`: editor periodización → `savePlanning`.
- `src/services/planning/cycle.ts/buildCycleFromMethod etc.`: ya producen `CycleConfig` puro.
- `src/pages/Nutricion.tsx`: lectura `profile.cycle`.
- `demoData.ts` / `migrateLocalStorage.ts`: SIN CAMBIOS (JUSTIFICADO: demo / migración legacy 1-vía).

## 5. Gates de la fase (al final)
- `npm test` verde (incl. tests de cycle y de fechas de 1M-A)
- `npx tsc --noEmit` limpio
- `npm run build` PASS
- `npm run lint` 0 errores
- Auditoría final volviendo a buscar `routine.cycle`, `profile.cycle`, `cycleVersions` y clasificando cada referencia como CANÓNICA / HISTÓRICA / DERIVADA / LEGACY.

## 6. Estado del ciclo (memoria)
- FASE 2 (decisión) DOCUMENTADA — pendiente confirmación del usuario para implementar.
- FASE 3 (implementación) NO iniciada.
- FASE 2 global / deploy / rotación de clave: NO iniciadas.
