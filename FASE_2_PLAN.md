# FASE 2 — PLAN TÉCNICO DE EJECUCIÓN (SOLO DISEÑO / AUDITORÍA)

> **Checkpoint cerrado:** FASE 1A–1M-B completa — 558 tests/68 archivos PASS, tsc CLEAN, build PASS, lint 0 errores (215 warnings preexistentes, 0 nuevos).
> **Este documento:** plan de FASE 2 (migración de lectores legacy a fuente canónica + unificación de modelos duplicados).
> **Estado:** SOLO DISEÑO. **NO se inicia implementación en este documento.** No hay deploy, no hay rotación de claves, no hay migración de datos aún.

---

## 0. PRINCIPIOS RECTORES

- Cada deuda se resuelve como **subfase independiente y reversible**; nunca una "FASE 2 gigante" que toque todo a la vez.
- La **fuente de verdad** (canónico) es: `db.cycleVersions` (ciclos), `db.*` (Dexie) para datos, y el **proxy server-side** para secretos.
- Todo lector legacy se migra **con fallback** primero; la eliminación de la escritura legacy se hace SOLO cuando 0 lectores dependen de ella.
- **Restricciones duras:** no romper `Rutina.tsx:163` mientras haya lectores legacy; no fusionar campos solo por nombre parecido; no eliminar datos históricos; no exponer secretos en el bundle.

---

## 1. ESTADO DE PARTIDA (verificado)

- Tests: **558 PASS** (68 archivos) → baseline exacto tras 1M-B.
- tsc --noEmit: **CLEAN** · build: **PASS** · lint: **0 errores / 215 warnings preexistentes (0 nuevos)**.
- Fuente de ciclo canónica única: `src/services/planning/cycleVersions.ts` (`savePlanning`, `getActiveVersion`, `PROFILE_SCOPE`).
- Escritura canónica única de ciclo: `PeriodizationEditor.tsx:76` → `savePlanning`.
- Residual documentado: `Rutina.tsx:163` (`updateActive` escribe `profile.cycle` como snapshot legacy de compatibilidad).
- Seguridad: Groq solo server-side (proxy Worker pendiente de deploy); **RIESGO Ninja**: `VITE_NINJA_API_KEY` inlineada (hallazgo de checkpoint) → deuda de seguridad a resolver en FASE 2 (rotación + proxy) y rollback a localStorage por-usuario.

---

## 2. MODELO DE OBJETIVOS — AUDITORÍA Y DISEÑO

### Hallazgos deterministas (grep 1M-B)

**`trainingGoal`** (53+ refs) — el campo que SÍ se usa en el flujo coach/IA:
- `src/services/nutrition/macroService.ts:50-51` — carrera crítica: `proteinRange(w, p.goalPrimary)` — espera... **CORRECCIÓN**: usa `goalPrimary`. Ver abajo.
- `src/services/ai/contextBuilder.ts:268` `const goal = (ctx.userProfile?.trainingGoal as string) || ctx.objetivo || 'hypertrophy'`
- `src/services/ai/coachCore.ts:41` `(profile?.trainingGoal as TrainingGoal) || 'hypertrophy'`
- `src/services/ai/globalScore.ts:130` / `coachInsights.ts` — usan `trainingGoal` o `goalPrimary`.
- `src/pages/Perfil.tsx:276-280` — **escritor legítimo** de `trainingGoal` (único campo que el Perfil actualiza).
- `src/pages/Onboarding.tsx:216-219` — escribe `goal` (primario) + `goalsSecondary` + `customGoal`... y `Onboarding.tsx:219` `goalPrimary: objPrincipal`.

**`goalPrimary`** (19 refs) — usado por nutrición:
- `src/services/nutrition/macroService.ts:50-51` `proteinRange(w, p.goalPrimary)` / `calorieGoal(tdee, p.goalPrimary)` — **CANÓNICO nutrición**.
- `src/utils/nutrition.ts:36,44` — helper `calorieGoal`/`proteinRange` leen `goalPrimary`.
- `src/pages/Onboarding.tsx:219` — lo escribe al finalizar onboarding (`goalPrimary: objPrincipal`).
- `src/pages/Mas.tsx:87-88`, `Nutricion.tsx:123-124` — lo leen.

**`goal`** (93 refs, mixto):
- `src/pages/Onboarding.tsx:216` escribe `goal` (texto español, p.ej. "hipertrofia").
- `src/services/ai/contextBuilder.ts:22` y `coachCore`/`coachInsights` lo leen en algunos puntos; `trainingGoal` en otros.
- `src/pages/Perfil.tsx:376` usa `GOAL_MAP[profile?.trainingGoal || 'hypertrophy']` — **default "Hipertrofia" puede ser engañoso** (deuda UX ya reportada).
- Onboarding escribe `goal`; Perfil escribe `trainingGoal`; Coach lee `trainingGoal` mayormente con fallback `goal`.

### Diagnóstico
Los 3 campos representan **conceptos semánticamente iguales** (objetivo primario) pero con **nombres distintos y escritores distintos**:
- `goal` (string español) — escrito por **Onboarding**.
- `goalPrimary` — escrito por **Onboarding** (mismo momento, mismo valor `objPrincipal`), leído por **nutrición**.
- `trainingGoal` (enum inglés `TrainingGoal`) — escrito por **Perfil**, leído por **Coach/IA/nutrición parcial**.

**Esto es un DUPLICADO REAL de fuente de verdad** (un solo concepto, 3 nombres, 2 escritores, lectores mezclados).

### Propuesta de unificación (respeta compatibilidad)
1. **Campo canónico:** `trainingGoal` (tipo `TrainingGoal`, ya tipado y usado por Coach/IA).
2. **`goal` → DERIVADO legacy:** conservar lectura, pero escribir SOLO si no existe `trainingGoal` (fallback al migrar perfiles legacy).
3. **`goalPrimary` → DERIVADO legacy:** mantener lectura (nutrición), sincronizarlo desde `trainingGoal` en un único punto (ver §4 migración), o migrar nutrición a `trainingGoal` directo vía macroService.
4. **Onboarding debe escribir `trainingGoal`** además de `goal`/`goalPrimary` (hoy NO lo hace → usuarios nuevos quedan sin campo canónico → Coach usa fallback). Éste es el **fix de mayor valor**.
5. **Perfil:** al editar objetivo, actualizar también `goal` (legacy espejo) o eliminar dependencia de `goal` en Coach.

**Decisión técnica:** NO fusionar nombres. Mantener `goal` y `goalPrimary` como DERIVADOS/snapshots; el canónico es `trainingGoal`. Migrar lectores de `goal`/`goalPrimary` hacia `trainingGoal` en la subfase correspondiente.

---

## 3. RESTRICCIONES — AUDITORÍA Y DISEÑO

### Hallazgos
- Onboarding escribe `restrictions` (entrenamiento: equipamiento/movimientos/ejercicios/tiempo/espacio) — `src/pages/Onboarding.tsx:193-222`.
- Perfil escribe `restrictions` como restricciones ALIMENTARIAS — `src/pages/Perfil.tsx:258-263` (mismo campo, significado distinto).
- Consumidores: `src/services/ai/contextBuilder.ts:105` y `chatLocalFallback.ts:109-112` lo leen como nutricional; coachCore/coachInsights leen `restrictions`/nutritionPrefs.

### Diagnóstico
**DUPLICADO SEMÁNTICO:** un mismo campo `restrictions` recibe 2 significados (entrenamiento vs alimentación) de 2 escritores distintos. Los lectores IA lo interpretan como NUTRICIÓN; el onboarding lo llena con datos de ENTRENAMIENTO → el prompt del Coach puede recibir restricciones de equipamiento como si fueran dietéticas.

### Propuesta
1. **Separar en 2 campos:**
   - `restrictions: string[]` — SOLO restrictiones de entrenamiento (equipamiento/movimiento/tiempo/espacio). CANÓNICO para coaching de ejercicio.
   - `nutritionRestrictions: string[]` (o `dietaryRestrictions`) — SOLO alimentarias (vegano, sin gluten, alergias). CANÓNICO para nutrición/Coach.
2. **Compatibilidad:** durante la transición, `restrictions` conserva su lectura legacy combinada SOLO si `nutritionRestrictions` está vacío; una vez migrado Perfil, `restrictions` deja de contener datos dietéticos.
3. **Perfil:** separar la UI en dos secciones (restricciones de entrenamiento / restricciones alimentarias) — no mezclar.
4. **contextBuilder/chatLocalFallback:** leer el campo correcto según dominio.
5. Deuda del onboarding: si el onboarding escribe `restrictions` alimentarias, debe escribirlas en el campo nuevo; las de entrenamiento ya van ahí.

**Decisión:** la fusión actual es un **RIESGO** (conceptos mezclados). Subfase dedicada; orden después de objetivo (mismo archivo `Perfil.tsx`/`Onboarding.tsx`).

---

## 4. COACH PREFS — AUDITORÍA Y DISEÑO

### Hallazgos (3 representaciones para el mismo concepto)
1. **`coachPrefs` (legacy localStorage)** — `src/stores/coachPrefs.ts` o análogo; leído por Coach.tsx para intensidad/personalidad. Estado: snapshot heredado.
2. **`coach-prefs` (Dexie)** — tabla Dexie/`db.coachPrefs` — **canónico candidato** (persistido, sobrevive PWA).
3. **`prefs:global` (localStorage)** — migración de `migrateLocalStorage.ts:337-354`; espejo legacy del store.

### Diagnóstico
Probable DUPLICADO de 3 vías para la misma preferencia del Coach (intensidad/tono). Onboarding escribe prefs en el perfil (Dexie) pero Coach.tsx persiste a su propio store → divergencia.

### Propuesta
1. **Canónico:** tabla Dexie `coachPrefs` (o campos `coachTone`/`coachIntensity` en `userProfile` — decidir tras inspeccionar el esquema).
2. **Escritores:** unificar a UNA ruta (`coachService.persistPrefs`). Onboarding/Coach/perfil escriben por esa vía.
3. **Legacy:** `coachPrefs` localStorage y `prefs:global` quedan SOLO lectura con fallback; se elimina su escritura.
4. **Lector:** Coach.tsx debe leer Dexie canónico primero.
5. **Migración:** una subfase unidireccional localStorage→Dexie ya existente (`migrateLocalStorage.ts`) — extender para estas claves si faltan.

**Decisión:** mantener `coach-prefs` Dexie como canónico; deprecar las otras dos. Subfase baja prioridad (no rompe función core; solo divergencia de preferencias).

---

## 5. STORE REACT ESPEJO — AUDITORÍA Y DISEÑO

### Hallazgos
- `src/stores/profile.ts` — store Zustand con persist a localStorage (`trainpwa-profile`) que **duplica** `userProfile` de Dexie; campo `hydrationToday` solo; algunos componentes (HydrationWidget) lo leen.
- En checkpoint 1M-B: "solo se usa en `HydrationWidget.tsx:12` y tests; canon es Dexie (comentario del propio store)". Posiblemente también Inicio/Entrenar usan el store React como caché local.

### Diagnóstico
**Store React espejo = DUPLICADO de fuente para `userProfile`.** Riesgo de divergencia cuando Dexie y el store desincronizan (p.ej. actualización del ciclo en Rutina no propaga al store React).

### Propuesta
1. **Objetivo:** eliminar el store React como fuente; Dexie = única. El store (si se conserva) debe ser **caché de lectura derivada**, actualizado por eventos de Dexie (subscription/liveQuery), nunca escrito directamente por páginas.
2. **Migración:** reemplazar `stores/profile.ts` por hook `useProfile()` que hace `liveQuery`/`useLiveQuery` de Dexie (ya hay patrón Dexie liveQuery en el repo). Los escritores escriben `db.userProfile.put` (no al store).
3. **Riesgo de eliminarlo:** revisar lectores (grep `stores/profile`). Migrar cada lector a `useProfile` antes de borrar el store.
4. **Transición:** store legacy queda como wrapper fino que delega en Dexie (fachada), no como segunda fuente.

**Decisión:** subfase de unificación pequeña; reemplazar el store espejo por liveQuery Dexie. Prioridad media (riesgo de divergencia bajo hoy, pero es exactamente "dos fuentes de verdad" que FASE 2 debe eliminar).

---

## 6. SEGURIDAD — AUDITORÍA Y DISEÑO (SOLO PLAN, no ejecución)

### A. Groq
- **Estado de código:** OK — el frontend SOLO usa `VITE_GROQ_PROXY_URL` (proxy); Worker server-side mantiene `GROQ_API_KEY` (`worker/src/index.js:19-30`); la clave **no está** en `src/` ni en bundle (`src/vite-env.d.ts:6` no la declara). Fallback local honesto (`chatLocalFallback`, `routineBuilderIA`).
- **Pendiente operativo (FASE 2, no bloqueante):**
  1. Deploy del Worker (Cloudflare).
  2. `wrangler secret put GROQ_API_KEY` (con la NUEVA clave).
  3. **Rotación de la clave previamente expuesta** (`gsk_…` en historial/`.env.local` remoto).
  4. Config `VITE_GROQ_PROXY_URL` (producción).
  5. Migrar lectores que llaman a `chatService` con fallback (ver §13 de checkpoint).

### B. Ninja (API key inlineada — RIESGO REAL)
- **Hallazgo:** `VITE_NINJA_API_KEY` se inyecta en el bundle (`dist/*.js` contiene la key real; búsqueda determinista lo confirmó). Riesgo de exposición pública.
- **Plan FASE 2:**
  1. **Rotar** la clave Ninja (operativo manual).
  2. **Mover a proxy server-side** (el mismo patrón Groq: Worker que mantiene la clave, frontend llama `VITE_NINJA_PROXY_URL`).
  3. Eliminar el fallback `.env` local con la key real (solo placeholder).
  4. Frontend deja de enviar `X-Api-Key` con valor secreto; el proxy lo agrega server-side.
- **Clasificación:** RIESGO de seguridad → **alta prioridad operativa** dentro de FASE 2 (aunque no bloquea el resto de FASE 2; ver matriz).

### C. Otros
- Firebase: configuración pública SDK por diseño (no secreto). OK.
- `.env.local` con `VITE_GROQ_API_KEY` muerta (56 chars): eliminar/rotar (huérfana, no se lee).

---

## 7. FECHAS (1M-A) — AUDITORÍA Y DISEÑO

### Hallazgos deterministas
- `src/utils/dates.ts` — utilidad canónica de fechas **LOCALES** (`todayKey`, `toDateKey`, `dayKeyOffset`, `daysBetween`, `weekdayOfKey`). Todo el flujo core la usa. **CANÓNICO OK.**
- **RIESGO 1M-A:** `src/pages/Inicio?` y `Entrenar.tsx:377` (`new Date('YYYY-MM-DD')` → UTC) vs `Entrenar.tsx:417` fechas locales — está documentado como RIESGO BAJO (solo en caminos específicos).
- RIESGO B2 (1M-A): horario UTC de hidratación nocturna (UTC−3) — `hydrationBottles.ts:103,129,177,213` con `toISOString().slice(0,10)`.

### Propuesta
1. **Subfase fechas:** consolidar a utilidad local en los ~5 puntos UTC residuales (Inicio, Entrenar, hydrationBottles, progreso/PR, rutina).
2. **Prioridad:** hydration UTC (impacto visible en noche) por encima de Inicio/Entrenar (solo display).
3. Después de consolidar, correr gates; el resto de la deuda (demoData/migrate) es LEGACY justificado, NO tocar.

---

## 8. ENTRENAMIENTO

- Auditoría previa 1M-A confirmó estados canónicos, sin datos ficticios; cubierto por 558 tests.
- Residual en `Entrenar.tsx` / `sessionStore` con cierre `completed→done` correcto (verificate existente rutina `updateActive` y los flujos covered).
- No se detecta deuda crítica pendiente en este dominio más allá de las ya listadas (doble fuente `Entrenar.tsx` legacy en días/ciclo). Ver §9.

---

## 9. UI / UX

- **Elementos decorativos detectados (temple.tsx):** buscador sin funcionalidad (`temple.tsx:171-177`), botón notificaciones sin acción (`:186`), badge "Coach activo" (`:182-185`) que finge estado. Onboarding/Perfil: campos `trainingGoal` vs `goal` en UI.
- **Plan:** convertir o eliminar (diseño): el buscador → funcional o quitar; notificaciones → integrar reales (FASE 2) o quitar; badge de estado → dato real de conexión/offline.
- Respeta la regla: NADA decorativo que aparente funcionalidad.
- Prioridad: baja (cosmético, sin impacto en datos), pero penaliza honestidad de la app.

---

## 10. PWA / OFFLINE
- Service worker precachea; sin cacheo de endpoints IA (correcto). updateViaCache OK.
- theme_color: `manifest` (validation manifest:10) global, etc. — consistente tras checkpoint.
- RIESGO 1A documentado: sin `clientsClaim` en producción → frecuente actualización diferida. Deuda herramienta `check:release` → FASE 2.
- Instalación sin icono real (`icon-192.png` 1×1) — resolver en FASE 2 UX.

---

## 11. PROGRESO / NUTRICIÓN / RECUPERACIÓN / COACH IA — síntesis
- **CANÓNICO-OK** (verificado): nutrición real (TMB/TDEE formulas), progreso real (volumen/series), recuperación real (score), coach IA real (contextBuilder+Groq/local fallback).
- Deudas menores transversales (helper IMC duplicado, diary removals, exports) → FASE 2 categoría limpieza.
- Adherencia del Coach con `completedCount*20` → reemplazar por conteo real (matriz P2).

---

## 12. MATRIZ DE PRIORIZACIÓN TÉCNICA

| ID | Problema | Impacto | Riesgo | Dependencias | Esfuerzo | Fase/prop | Clase |
|----|---------|---------|--------|--------------|----------|-----------|-------|
| S1 | Ninja key inlineada en bundle | Alto (fuga secreto si se publica) | ALTO | Worker proxy, rotación | M | **P0** | SEGURIDAD |
| S2 | Groq key evitar re-exposición; deploy proxy + rotación operativa | Alto | ALTO (si se deploya con key vieja) | Cloudflare, operación | M | **P0** | SEGURIDAD |
| D1 | Objetivo 3 fuentes (goal/goalPrimary/trainingGoal) | Medio | MEDIO (Coach usa fallback; onboarding no escribe canónico) | Onboarding+Perfil+Coach | M | **P1** | FUENTE DE VERDAD |
| D2 | `Rutina.tsx:163` residual profile.cycle | Medio | MEDIO (si se elimina sin migrar lectores) | ~15 lectores | M | **P1** | FUENTE DE VERDAD |
| D3 | Restricciones mezcladas (entrenamiento vs dieta) | Medio | MEDIO (prompt IA recibe dato equivocado) | Perfil, onboarding, contextBuilder | M | **P1** | FUENTE DE VERDAD |
| R1 | Store React espejo profile | Bajo-Medio | BAJO hoy (divergencia latente) | varios lectores | S | **P2** | DUPLICADO |
| R2 | Coach prefs 3 vías | Bajo | BAJO (preferencias divergentes) | Coach, onboarding, migrate | S | **P2** | DUPLICADO |
| F1 | Fechas UTC hidratación | Medio (noche UTC−3) | MEDIO (off-by-one) | hydrationBottles, hydration UI | S | **P2** | COMPORTAMIENTO |
| F2 | Fechas UTC Inicio/Entrenar/PR | Bajo | BAJO | 3-5 archivos | S | **P3** | COMPORTAMIENTO |
| U1 | temple.tsx decorativo (buscador/notif/badge) | Bajo | BAJO | temple, UI | S | **P3** | UX |
| U2 | Perfil default "Hipertrofia" engañoso | Bajo | BAJO | Perfil | XS | **P3** | UX |
| C1 | helper IMC duplicado / imports muertos / lint warnings | Bajo | BAJO | varios | M | **P4** | LIMPIEZA |
| C2 | completedCount*20 adherencia | Bajo | BAJO | coachInsights | S | **P4** | LIMPIEZA |

**Clasificación:** P0 = seguridad operativa (no código-deploy aún), P1 = fuente de verdad / datos, P2 = comportamiento, P3 = UX, P4 = limpieza.

---

## 13. SUBFASES PROPUESTAS (orden de ejecución independiente)

Cada subfase: objetivo, alcance (archivos), dependencias, invariantes, tests requeridos, criterio de aceptación, riesgos, rollback.

### F2-S1 — SEGURIDAD OPERATIVA (P0)
- **Objetivo:** eliminar el riesgo de fuga de secretos (Ninja inlineada, Groq operativo).
- **Alcance:** `worker/` (proxy Ninja si aplica), `.env*`, build config, rotación de claves.
- **Dependencias:** acceso Cloudflare (manual/operativo).
- **Invariantes:** ningún secreto en `src/`; los gates no dependen de claves.
- **Tests:** `check:release`, grep de secreto en dist; suite existente.
- **Aceptación:** `dist/` sin keys reales; front sin `X-Api-Key` secreto; Worker con secret por env.
- **Riesgos:** deploy de Worker mal configurado → fallback local cubre.
- **Rollback:** deshabilitar proxy → fallback local (ya existe).

### F2-S2 — OBJETIVO ÚNICO (P1) — `goal`/`goalPrimary`/`trainingGoal`
- **Objetivo:** `trainingGoal` canónico; `goal`/`goalPrimary` derivados legacy.
- **Alcance:** `Onboarding.tsx` (escribir `trainingGoal`), `Perfil.tsx` (unicidad), `contextBuilder.ts`, `coachCore.ts`, `coachInsights.ts`, `nutrition/macroService.ts`.
- **Invariantes:** onboarding nuevo SIEMPRE tiene `trainingGoal`; lectura de legacy sigue funcionando.
- **Tests:** onboarding (nuevo: escribe trainingGoal), coachCore (usa trainingGoal), nutrition (goalPrimary→trainingGoal o derivación).
- **Aceptación:** sin doble escritura; test que prueba onboarding→Coach coherente.
- **Riesgos:** cambiar macroService a `trainingGoal` puede alterar metas → mantener `goalPrimary` como derivado de `trainingGoal` con misma fórmula.
- **Rollback:** revivir lectura dual.

### F2-S3 — CICLO LEGACY (P1) — migrar lectores + retirar `Rutina.tsx:163`
- **Objetivo:** eliminar la escritura legacy `profile.cycle` migrando los ~15 lectores a `getActiveVersion(PROFILE_SCOPE)` con fallback.
- **Alcance:** los lectores listados (Inicio, Entrenar, Coach, Calendario, PeriodizationEditor, contextBuilder, coachInsights, Coach/Entrenar, Nutricion, Mas, Perfil, useTrainingSession, etc.).
- **Invariantes:** ningún lector queda sin fallback; snapshot legacy queda congelado tras migrar (solo lectura).
- **Tests:** tests existentes de lectores + nuevo test "lector con cycleVersions usa versión activa (no snapshot)".
- **Aceptación:** 0 escrituras a `profile.cycle` en runtime; lectores usan canónico con fallback.
- **Riesgos:** lector sin migrar → ciclo desactualizado; por eso se migra con fallback ANTES de eliminar.
- **Rollback:** reintroducir fallback (el snapshot legacy persistido sigue existiendo en BD).

### F2-S4 — RESTRICCIONES SEPARADAS (P1)
- Separar `nutritionRestrictions`; actualizar Perfil UI y lectores IA.
- Alcance: `Perfil.tsx`, `Onboarding.tsx`, `contextBuilder.ts`, `chatLocalFallback.ts`, types.
- Aceptación: test "restricción nutricional no llega como de entrenamiento" y viceversa.

### F2-S5 — STORE REACT ESPEJO (P2)
- Reemplazar `stores/profile.ts` por hook `useProfile` (liveQuery Dexie).
- Aceptación: 0 lectores del store espejo; tests verdes; Hydration/Inicio usan Dexie.

### F2-S6 — COACH PREFS ÚNICAS (P2)
- Unificar a Dexie `coachPrefs`; deprecar localStorage/`prefs:global`.
- Aceptación: una sola escritura; Coach lee canónico.

### F2-S7 — FECHAS/HIDRATACIÓN (P2-P3)
- Hidratación UTC→local (prioridad), luego Inicio/Entrenar/PR.
- Aceptación: tests de noche UTC−3.

### F2-S8 — UX PULIDO (P3)
- temple decorativo, default Perfil, 1×1 icon PWA.
- Aceptación: sin falsa funcionalidad.

### F2-S9 — LIMPIEZA (P4)
- helper IMC, imports muertos, lint warnings selectivos, completedCount.

---

## 14. ORDEN DE EJECUCIÓN SEGURO

1. **F2-S1 (Seguridad)** — primero: sin esto cualquier deploy expone claves. (Operativo, pero el código del proxy ya está; solo falta rotación/deploy → guard operativo, no bloquea resto).
2. **F2-S2 (Objetivo)** — base de datos/perfil → afecta a los demás.
3. **F2-S3 (Ciclo legacy)** — segundo mayor: elimina doble fuente de ciclo.
4. **F2-S4 (Restricciones)** — mismo archivo familia Perfil/Onboarding; agrupar con S2 si conveniente.
5. **F2-S5 (Store espejo)** — dependiente de no romper lectores.
6. **F2-S6 (Coach prefs)**.
7. **F2-S7 (Fechas)** — independiente, puede ir en paralelo.
8. **F2-S8 (UX)** · 9. **F2-S9 (Limpieza)**.

Justificación: seguridad → fuente de verdad de perfil → ciclo → restricciones (comparten archivos con S2) → stores duplicados → preferencias → fechas (independiente) → UX → limpieza.

---

## 15. CRITERIOS DE CIERRE DE FASE 2

- **Tests:** total ≥ 558 (solo aumentos; nunca reducción).
- **tsc --noEmit:** CLEAN.
- **build:** PASS.
- **lint:** 0 errores; warnings solo preexistentes (0 nuevos) o reducción.
- **Seguridad:** `check:release` verde; sin secuencia de clave real en `dist/`; Ninja movida a proxy; Groq secret solo server-side.
- **Fuente de verdad:** una sola escritura por concepto (`cycleVersions`, `trainingGoal`, `coachPrefs`, `nutritionRestrictions`); lectores con fallback.
- **Compatibilidad:** ningún lector legacy sin fallback; datos históricos intactos.
- **Regresiones:** código muerto/duplicados identificados eliminados o documentados.
- **Documentación:** reportes actualizados.

---

## 16. CHECKPOINT de diseño — preguntas abiertas (para decidir antes de implementar)
- ¿`coachPrefs` canónico = tabla `coach-prefs` Dexie o campos en `userProfile`? (necesaria inspección del esquema Dexie)
- ¿`goalPrimary` se migra a `trainingGoal` en macroService o se mantiene como derivado síncrono? (impacta metas nutricionales de usuarios legacy)
- ¿Onboarding nuevo migración de usuarios legacy con solo `goal`?: estrategia (fallback en lectura vs backfill unidireccional).
- ¿Fechas hydration: unificamos `hydrationLogs`+`hydrationBottleLogs`?

---

## 17. RIESGOS GLOBALES DE FASE 2
- Regresión en Coach/IA si `trainingGoal` no se propaga correctamente.
- Divergencia temporal entre `cycleVersions` y lectores si se elimina 163 antes de migrar todos.
- Cambio de macros para usuarios legacy al migrar `goalPrimary`.
- Deploy del Worker con clave no rotada (exposición).
- Multiplicidad de tests (asumir +X por subfase, sin reducción).

## 18. BLOQUEOS PENDIENTES
- Deploy Worker Groq + rotación de clave (operativo manual, no bloquea código).
- Rotación Ninja + proxy (operativo manual).
- Acceso Cloudflare/Firebase para verificación de deploy (no bloquea desarrollo local).

## 19. PRÓXIMO PASO (no ejecutado aún)
Esto es SOLO el plan. Antes de implementar se requiere tu aprobación para:
1. Elegir el orden de subfases (recomendado: S1→S2→S3→S4→S5→S6→S7→S8→S9).
2. Confirmar las decisiones abiertas (§16).
3. Autorizar inicio de la primera subfase.

**FASE 2 NO ha sido iniciada. No se modificó código, no se hizo deploy, no se rotó ninguna clave, no se ejecutó ninguna migración de datos.** Detenido en diseño.
