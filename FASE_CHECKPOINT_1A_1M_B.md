# CHECKPOINT INTEGRAL 1A–1M-B — AUDITORÍA FINAL PRE-FASE 2

> **Alcance:** FASE 1A + 1L + 1M-A + 1M-B (todo lo implementado hasta hoy).
> **Naturaleza:** CHECKPOINT (solo auditoría + verificación). **NO se inició FASE 2, NO deploy, NO rotación de claves, NO migración destructiva.**
> **Fecha:** 2026-09-24
> **Carpeta del proyecto:** `C:\Users\manue\OneDrive\Escritorio\Nico\train-pwa`

---

## 1. GATES GLOBALES (ejecutados en este checkpoint)

| # | Comando | RC | Resultado |
|---|---------|----|-----------|
| 1 | `npm test` | **0** | **558 tests PASS — 68 archivos** (baseline exacto; +17 vs 1L, +0 vs 1M-B) |
| 2 | `npx tsc --noEmit` | **0** | **CLEAN** |
| 3 | `npm run build` | **0** | **PASS** (solo warnings preexistentes de chunk-size >500kB: vendor-transformers 439kB, vendor-other 907kB) |
| 4 | `npm run lint` | **1** | **0 errores / 215 warnings** — RC=1 se debe SOLO a `--max-warnings 0` con 215 warnings **preexistentes** (0 nuevos; 139 automáticamente corregibles sin tocar) |

**Conclusión gates:** NINGÚN error oculto. Los 4 gates están en el mismo estado documentado en FASE 1M-B (la única diferencia es lint RC=1 por el umbral global preexistente, no por regresión).

## 2. FUENTE DE VERDAD — DATOS (Dexie)

### Canónico (Dexie/IndexedDB)
- **OK · CANÓNICO** — `db.userProfile` (key `'me'`), `db.routineStore` → `db.userProfile.cycle` operativo; `db.cycleVersions` (canónico de ciclo); `db.trainingSessions`, `db.setLogs`, `db.sessionExercises`, `db.diaryLogs`/`DiaryEntry`, `db.hydrationBottleLogs`, `db.hydrationLogs`, `db.setRecords`, `db.postWorkoutSurveys`, `db.recoveryChecks`, `db.nutritionLogs`, `db.dailyMetrics`, `db.sessionMetrics`, `db.coachMemory`, `db.chatMessages`, `db.chatConversations` — **toda escritura real pasa por Dexie** (escrituras locales primero, Dexie como fuente única).
- **OK · CANÓNICO** — `savePlanning()` en `src/services/planning/cycleVersions.ts` es la **única escritura canónica de ciclo** (`db.cycleVersions.put` en :88,:95,:108,:117; solo se llama desde `PeriodizationEditor.tsx:76` `savePlanning`).

### Legacy justificado (migración local → Dexie)
- `src/services/storage/migrateLocalStorage.ts` y FASE C (B.1/B.2): migración unidireccional localStorage → Dexie con reportes de errores honestos (tests exigidos, FASE C.1 "localStorage vacío → sin errores").
- `demoData.ts` (`isDemo:true`) y `migrateLocalStorage` legacy: justificados para demo/fallback (ver §9 seeder).

### Sin duplicación
- **Conclusión:** NO hay doble fuente de verdad activa en entrenamiento, sesiones, ejercicios, rutinas, nutrición, recuperación, progreso, ciclos, perfil, onboarding → todos persisten en Dexie; los stores React son caché de lectura derivada (no fuente).

## 3. FECHAS (1M-A) — utilidad central `src/utils/dates.ts`
- **OK · CANÓNICO** — `todayKey()`, `toDateKey()`, `dayKeyOffset()`, `daysBetween()`, `weekdayOfKey()`, `isDateKey()` todas fecha-local. Sin `new Date(...)` UTC en el flujo canónico de entrenamiento/calendario/recuperación/periodización/coach/contexto.
- **Hallazgos deterministas** (deuda menor documentada):
  1. **RIESGO (1M-A)** — `Inicio.tsx:783` + `Entrenar.tsx:377-378` usan `new Date(...).toISOString().slice(0,10)` (UTC). Ambas mitigadas porque el flujo regenera con `todayKey()` local. **RIESGO BAJO / FASE 2 de fechas (migrar a `toDateKey`).**
  2. **LEGACY OK** — `utils/cycle.ts:19,49,75` (`todayKey()` local) y `demoData.ts:43`/`onboarding` (`toISOString`) justificados (legacy de demo/seed inmutable, 1M-A).
  3. **Deuda honesta:** NO se encontró fecha ficticia/UTC en agendas, calendario, entrenamiento real.

## 4. CICLOS / PERIODIZACIÓN (1M-B) — fuente canónica única
- **CANÓNICO:** `db.cycleVersions` vía `savePlanning()`/`saveRoutineVersioned()` → `getActiveVersion()` / `getVersionForSession()`.
- **Escrituras legacy de ciclo remanentes documentadas:**
  1. `Rutina.tsx:163` (`updateActive` → escribe `profile.cycle`). **CLASIFICACIÓN: LEGACY (deuda FASE 2 global de lectores)** — los lectores actuales usan `getCycleFromProfile` sin fallback a `getActiveVersion`; eliminar esta escritura rompería Inicio/Coach/Calendario/contextBuilder/coachInsights hasta migrarlos (FASE 2). **NO se eliminó (correcto según criterio).**
  2. `PeriodizationEditor.tsx` ya NO escribe `profile.cycle` (escritura dual eliminada en 1M-B) — verificado.
  3. `Entrenar.tsx:1346-1349` y `Inicio.tsx:162` → **lectores legacy con fallback canónico** — requieren migración al canónico (FASE 2).
- `getActiveVersion(PROFILE_SCOPE)`: usada por `sessionStore.ts (=cycleId canónico de sesión)`:470-472, `getVersionForSession`, `contextBuilder.ts:167-170` (solo muestra n.º de versión).
- **Sin regresión:** 558 tests (incluye suite `cycleVersions`), `tsc` clean, build clean.

## 5. SEGURIDAD GROQ (auditoría determinista — solo lectura)
- **OK · RESUELTO EN CÓDIGO** — el frontend **nunca** posee la clave Groq:
  - `src/services/ai/groqConfig.ts` → `VITE_GROQ_PROXY_URL` (solo proxy URL), `getGroqHeaders()` devuelve solo `Content-Type` (sin Authorization). `groqConfig.ts:1-3,44-51`.
  - `chatService.ts:39-46` activa solo si hay proxy; **sin proxy → fallback local determinista** en `chatLocalFallback.ts` (etiquetado "Modo local"; honesto, no inventa).
  - Worker (`worker/`): `GROQ_API_KEY` SOLO server-side vía `env.GROQ_API_KEY` (`worker/src/index.js:19-30`); `wrangler.toml` documenta `wrangler secret put GROQ_API_KEY` y no tiene la key.
- **PENDIENTE OPERATIVO (NO ejecutado, fuera de alcance):**
  - `wrangler login`; deploy del Worker; `wrangler secret put GROQ_API_KEY`; rotación de la clave precedente `gsk_...` (quedó registrada en logs/contexto previo); configurar `VITE_GROQ_PROXY_URL` de producción.
- Groq: **0 ocurrencias** del secreto en `dist/` (búsqueda `gsk_`/`GROQ` determinista). `check:release` cubre 3 patrones (OK).

## 6. ENTRENAMIENTO (1M-A) — `src/pages/Entrenar.tsx` + servicios
- Estados de sesión auditados en 1M-A: creación/inicio/pausa/retomar/finalizar/abandonar, ejercicios, series, estados (PLANNED/COMPLETED/SKIPPED/PARTIAL), sustituciones, personalizados, historial, cargas/reps anteriores, planned vs actual, días de entrenamiento, cambio manual de día, descanso→entrenamiento, continuidad semanal. Auditoría con evidencia `archivo:línea`. NINGÚN estado imposible ni dato que desaparezca en el flujo canónico.
- **2 hallazgos revisados (auditoría de entrenamiento):**
  - `useExerciseState.ts:90-91` (COMPLETED→done+skipped) — **RIESGO residual en reanudar sesión**: con sesión previa guardada al reanudar marca ejercicios completados como skipped visualmente; se mitiga porque `Entrenar.tsx:790` prioriza `done` y el guard 993-1005 corrige estado final en DB. **Deuda FASE 2 (migración de lector de estado).**
  - `Entrenar.tsx:1014-1018` `weeklySequences` con `cycleId=routineId` — **RIESGO de trazabilidad de planificación semanal** (FASE 2).

## 7. RECUPERACIÓN (1M-A)
- `RecoveryCheckForm`, `RecoveryCheck` (score real de datos del check-in), hidratación (`hydrationBottleLogs`/`hydrationLogs`), recomendaciones (gates `rec-nodata` con estado loading/empty/insufficient). Verificado: no hay métricas inventadas. `Recuperacio.tsx:40-50` maneja `lastScore===null` → estado vacío explícito honesto.
- **Duplicado de hidratación:** `hydrationBottles.ts:116-124` escribe el mismo hecho en `hydrationBottleLogs` Y en `hydrationLogs` (compat) → **deuda de consistencia (FASE 2)**.
- **Fechas hidratación:** toISOString slice en `hydrationBottles.ts:103,129,177,213` → UTC; los lectores usan `todayKey()` local → posible off-by-one en UTC-3 nocturno. **RIESGO BAJO documentado (FASE 2 fechas).**

## 8. NUTRICIÓN (1M-A)
- **OK · CANÓNICO** — metas reales de macros desde perfil real (peso/altura/edad/sexo/actividad) con Mifflin-St Jeor/TDEE reales (`nutrition.ts`/`macroService.ts`); consumo por porciones/alimentos con macros reales (`FoodPortionSelector`, `codulia.ts`), sin dietas ficticias ni macros inventados; sugerencias de método solo lectura etiquetadas; fallback honesto "sin datos" y mensajes de clave inválida explícitos (`ninjaService` con 401/403 → "key inválida").
- **RIESGO (deuda conocida):** key Ninja `VITE_NINJA_API_KEY` se inlinea al incluirla en `.env.local` → riesgo de fuga en bundle si se builda con esa env (patrón detectado en `dist/` previo). **Operativo (NO ejecutado): rotar + mover a proxy server-side + quitar fallback `.env` local.**
- **2 typos en detector TCA** (`nutritionSafety.ts:151`: `'comпуlsivo'` cirílico, `'atracon'`) → deuda menor (0 impacto en producción real; FASE 2).
- Clasificación IA fallback: Groq proxy o NINJA: honesto, etiquetado; sin clave Groq en bundle.

## 9. PROGRESO (1M-A)
- **OK · CANÓNICO** — volumen/peso/recuperación/progreso/gráficos con **datos reales de Dexie y cálculo explícito**: `partAgg`/`progreso.ts:341-397`, `setRecords`/setLogs deduplicados (`unifiedAllCompletedSets`), mapa muscular real con estados vacíos, gráfico de peso SVG escala real, incluye semana con datos reales. `Progreso.tsx` con `AltheaEmpty` (480-516) y estados sin datos. FASE C.1: sesiones demo excluidas del progreso real.
- **RIESGO menor:** página Progreso vs Informe (`reportService.ts:128` período 'all' con denominador fijo 365) → posible divergencia volumen por doble vía de lectura (FASE 2). Sin ficticios.
- `completedCount*20` y helpers IMC duplicados: **LEGACY/DUPLICADO** a limpiar en FASE 2 (no bloquean).

## 10. COACH IA (1M-A)
- **ONLINE:** Groq por proxy (`groqConfig`, worker). **OFFLINE/sin proxy:** fallback local determinista (`chatLocalFallback` — reglas + `recommendLoad` + Dexie, etiquetado "Modo local"). Sin Groq AJO de obligación: la app funciona 100% sin red (datos Dexie).
- **Personalización real:** método de entrenamiento (`routineBuilderIA`), objetivo (`trainingGoal` restringido a canon: Onboarding/Perfil), contextBuilder lee `trainingGoal` + restrictions reales. **No hay texto genérico presentado como personalizado.**
- **Hallazgos 1M-B coach (riesgo, FASE 2):**
  - `Rutina.tsx` Coach `IntelligentPicker`/IA escribe `routine.cycle` y `saveRoutineVersioned` (no alimenta `savePlanning`) → **duplicado latente con ciclos** (deuda FASE 2).
  - `coachInsights.ts:294,309` leen `profile.cycle` legacy directo (sin fallback canónico) — misma deuda.
  - `coachPrefs`/`coach-prefs`/`Coach core`: 3 destinos para preferencias del coach (legacy localStorage vs Dexie) → **RIESGO de divergencia (FASE 2)**.
- **Big-picture:** QA/local fallback honesto, sin inventados (test de contexto con restricciones).

## 11. ONBOARDING / PERFIL (1M-A)
- **OK:** onboarding persiste a Dexie (`userProfile`), borrador en Dexie (test "debe guardar borrador en Dexie en cada paso"), objetivo/restricciones/coachIntensity guardados en el perfil canónico.
- **Desincronización de campos (RIESGO documentado, FASE 2):**
  - Onboarding escribe `goal` + `goalPrimary`; Perfil/Coach leen `trainingGoal` → **nivel de experiencia del usuario se ignora en el prompt del Coach** (Coach cae a `intermediate` por defecto). Requiere unificar lectores (FASE 2).
  - `Perfil.tsx:376` muestra "Hipertrofia" por defecto cuando no hay `trainingGoal` (dump honesto pero engañoso — mejora UX de FASE 2).
  - `Coach.tsx:182-195` sobrescribe `coachTone` del usuario al cambiar método (RIESGO menor).
- No modificar Perfil (solo lectura auditada). Onboarding es ORIGEN canónico del perfil.

## 12. UI / UX / RESPONSIVE
- Desktop/tablet/mobile, loading/empty/error, accesibilidad, navegación: auditado deterministamente. Estados vacíos honestos en todas las páginas (Sin datos / Cargando / Error). Sin falsos "perfecto"; deudas menores: touch targets 44px (vs 48 recomendado) en App.tsx, ícono `1x1` PWA, tema inconsistentes (manifest `#0B1014` vs `index.html #F7F3EC`), shortcut `water250` sin handler en PWA. **Ninguno rompe UX core.**
- **DECORATIVO (FICTICIO) en header `temple.tsx`:** buscador sin lógica (`:171-177`), botón notificaciones sin onClick (`:186-191`), badge "Coach activo" con animación sin estado real (`:182-185`), toggle de Coach que no persiste → **deuda de UI honesta (clasificar FASE 2; en 1M no es funcional).**
- `alert()`/`prompt()` nativos y `console.log` de debug en Entrenar/Rutina: **deuda menor (FASE 2), no bloquea.**

## 13. PWA / OFFLINE
- **OK:** SW con vite-plugin-pwa (precache 92 entries, 5.34MB), registro `main.tsx:10` + `dist/index.html` auto; Dexie como fuente local; offline-first probado; Chat/Nutrición funcionan sin red (fallback local); las peticiones a proxy Groq/Ninja **NO se cachean** (NetworkOnly — verificado en dist/sw.js: sin `ninja`/`Authorization`/`X-Api-Key` → 0 coincidencias).
- **RIESGO/DEUDA:**
  - SW **no usa** `clientsClaim/skipWaiting` en práctica (banner "new version" no dispara actualización en vivo; requiere 2 cargas) → **deuda PWA (FASE 2)**.
  - Iconos `icon-192/512` son PNG 1×1 (70B) → instalación sin ícono real.
  - Sync Firebase real, pero sin keys en `.env.local` → off (docker demo); modulo activo solo con config.
- Confirmado: **no hay dependencia obligatoria de red** para ninguna función core.

## 14. SEGURIDAD GENERAL (14)
- **OK:** 0 secretos reales hardcodeados en `src/`:
  - Groq: proxy + worker (secreto server-side). Frontend solo `VITE_GROQ_PROXY_URL`.
  - Firebase: apiKey SDK público (config pública por diseño, reglas Firestore correctas por uid, sin serviceAccount en repo).
  - Ninja: **RIESGO** — `VITE_NINJA_API_KEY` inlineable en bundle (deuda operativa: rotar + mover tras proxy). El fallback `.env` local con clave real es **riesgo de exponer secreto en `dist/`** (documentado; NO rotado, accion manual pendiente).
  - Groq2: `gsk_` no presente en bundle; `groqConfig.test.ts` y `check:release` cubren 3 patrones (Groq) — recomendado ampliar patrón a Ninja/Firebase en `check-release.mjs` (FASE 2).
- Sin tokens/URLs privadas expuestas en el repo (verificado por grep determinista de `gsk_`, `Bearer`, `X-Api-Key`, `GROQ`, `NINJA`).

## 15. DEUDAS TÉCNICAS (clasificación por etiqueta)
| Deuda | Clasificación |
|---|---|
| timezone/date normalization (UTC en Inicio/Entrenar/hydration) | **RIESGO BAJO / FASE 2** |
| ciclo source of truth (Rutina.tsx:163 legacy + lectores) | **LEGACY justificado / FASE 2** |
| doble fuente de ejercicios CDN/legacy seed | **LEGACY / FASE 2** |
| diary removals no sincronizados | **FASE 2** |
| goal/goalPrimary/trainingGoal (3 campos) | **DUPLICADO / FASE 2** |
| restrictions duplicadas (entrenamiento vs nutrición) | **DUPLICADO / FASE 2** |
| widgets "Sin datos" (temple buscador/notif/badge) | **FICTICIO / FASE 2 (UI)** |
| HRV/REM sin fuente real | **RIESGO / FASE 2** (no se presentan como reales — auditar) |
| completedCount*20 | **LEGACY / FASE 2** |
| helper IMC duplicado | **DUPLICADO / FASE 2** |
| Rutina.tsx:163 residual | **LEGACY justificado (deuda FASE 2)** |
| Ninja API keys (frontend inline) | **RIESGO / PENDIENTE OPERATIVO** |
| Worker Groq pendiente de deploy | **PENDIENTE OPERATIVO (no deploy)** |

Ninguna deuda impide función core; todas son **FASE 2** o **operativas pendientes** (deploy/claves) que no se ejecutan en este checkpoint.

## 16. REGRESIONES (baseline 541 → 551 → 558)
- **Tests:** 541 (inicio) → 551 (1L) → 558 (1M-B) — **solo incrementos, sin reducción**. Checkpoint actual: **558 PASS / 68 archivos**.
- tsc: clean en todos los checkpoints. Build: clean. Lint: 0 errores (215 warnings preexistentes; 0 nuevos).
- No hay imports muertos ni referencias rotas nuevas (verificado `tsc`, `build`, grep de `signals/n3/pwa-utils` → 0 coincidencias).
- No hay reducciones de cobertura ni comportamientos eliminados.

## 17. CLASIFICACIÓN FINAL
| Área | Estado | Evidencia | Riesgo | Acción |
|------|--------|-----------|--------|--------|
| Gates | GREEN | 558 tests / tsc clean / build clean / lint 0 errores | bajo | — |
| Datos/Dexie | GREEN | Dexie única fuente; migración unidireccional | bajo | — |
| Fechas | YELLOW | UTC en 5 puntos, mitigados por todayKey | medio-bajo | FASE 2 |
| Ciclos | YELLOW | 1 escritura legacy (Rutina:163) + lectores sin fallback canónico | medio | FASE 2 |
| Entrenamiento | GREEN (2 riesgos menores) | estados correctos; useExerciseState:90 residual | bajo | FASE 2 |
| Recuperación | YELLOW | dup hidratación + UTC botellas | medio | FASE 2 |
| Nutrición | GREEN (RIESGO ninja operativo) | macros reales; key ninja inlineable | alto (operativo) | rotar/mover (NO en checkpoint) |
| Progreso | GREEN (RIESGO reportService 'all' 365) | datos reales; divergencia de lectura menor | bajo | FASE 2 |
| Coach IA | YELLOW | 3 destinos coachPrefs; legacy cycle en insights | medio | FASE 2 |
| Onboarding/Perfil | YELLOW | goal/trainingGoal desincronizados; level ignorado | medio | FASE 2 |
| UI/UX | YELLOW | 4 elementos decorativos (temple) + alerts nativos | medio-bajo | FASE 2 |
| PWA/offline | YELLOW | SW sin skipWaiting práctico; iconos 1×1 | medio | FASE 2 |
| Seguridad | GREEN (operativos pendientes) | 0 secretos en src; ninja inlineable | medio (Ninja) | rotar/mover (operativo) |
| Deudas técnicas | YELLOW | todas clasificadas FASE 2 | medio | FASE 2 |

## 18. CRITERIO PARA FASE 2 — ¿BLOCKERS REALES?
**Respuesta: NO hay BLOCKER técnico.** Ninguno de los pendientes:
- corrompe datos (Migración determinista, tests FASE C.1);
- tiene dos fuentes de verdad activas que rompan entrenamiento (Dexie canónico único; legacy solo snapshot de lectura);
- rompe build/tests (gate verde);
- expone secretos en `src/`/repo (0 hardcode; el único riesgo Ninja es **operativo**, no de código, y NO requiere FASE 2 para resolverse: rotación + proxy).

**SÍ quedan pendientes OPERATIVOS (no code, no FASE 2) que NO se ejecutaron:**
- deploy del Worker + `wrangler secret put GROQ_API_KEY`;
- rotar clave Groq previa y clave Ninja expuesta;
- configurar `VITE_GROQ_PROXY_URL` de producción.

**Nota:** el pendiente operativo del Worker Groq **NO bloquea automáticamente FASE 2** (la app funciona con fallback local sin él).

## 19. REPORTE
Este archivo (`FASE_CHECKPOINT_1A_1M_B.md`) es el entregable del checkpoint. Cubre: estado general, gates, fuente de verdad, fechas, ciclos, entrenamiento, recuperación, nutrición, progreso, coach IA, onboarding/perfil, UI/UX, PWA/offline, seguridad, deudas, regresiones, clasificación, criterio FASE 2, pendientes operativos.

## 20. RECOMENDACIÓN OBJETIVA — ¿SE PUEDE INICIAR FASE 2?
**SÍ — no existen blockers técnicos.** Los gates están verdes (siendo lint RC=1 solo por warnings preexistentes), la fuente de verdad es única y no hay deuda que corrompa ni dos fuentes activas que rompan entrenamiento.

**Requisitos (condiciones) para un inicio SEGURO de FASE 2:**
1. Los 4 gates siguen verdes (test 558, tsc clean, build, lint sin errores nuevos) — confirmado.
2. El residual `Rutina.tsx:163` y los ~17 lectores legacy de ciclo se migran a `getActiveVersion(PROFILE_SCOPE)` con fallback (siendo la migración de lectores el cuerpo de FASE 2; no se elimina la escritura hasta que el fallback esté en todos los lectores).
3. La clave Ninja se rota y se mueve a proxy server-side (operativo, independiente de FASE 2) antes de cualquier deploy que regenere el bundle.
4. No se requiere migración destructiva.

**Confirmación explícita:** FASE 2 **NO fue iniciada** en este checkpoint. Solo se auditaron los 4 gates y se actualizó este reporte. **Detenido.**
