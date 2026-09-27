# FASE 2 — S2: Objetivo Único (canonical `trainingGoal`)

**Estado:** CERRADO ✅ — Gates verdes, tests añadidos, sin regresiones.
**Archivo:** `FASE_2_S2_REPORT.md`

---

## Decisión de diseño (aprobada)

El objetivo de entrenamiento tiene **una única fuente de verdad**: `UserProfile.trainingGoal`
(vocabulario canónico en inglés: `strength | fat_loss | hypertrophy | mobility | general_health`).

Los campos legacy **no se eliminan** pero se degradan a lectura temporal:

| Campo | Rol | Estado |
|---|---|---|
| `UserProfile.trainingGoal` | Fuente de verdad oficial | ✅ Canónico |
| `UserProfile.goal` | Estrategia legacy del onboarding (español) | ⏳ Legacy read-only (`@deprecated`) |
| `UserProfile.goalPrimary` | Texto libre legacy del onboarding (español) | ⏳ Legacy read-only (`@deprecated`) |

**Vocabularios que pertenecen a otro dominio y NO se tocan en S2:**
- Métodos de nutrición (`nutritionMethodsDB`): `health | maintenance | recomposition | muscle_gain | fat_loss`.
  Usado por `nutritionMethodSelector.ts` y `adherenceTracker.ts` (siguen leyendo `trainingGoal` con su
  propio default `'health'`). Refactor de ese vocabulario queda fuera de alcance (futuro).

---

## Helper central: `src/utils/trainingGoal.ts` (nuevo)

Resolución determinista, sin inventar valores:

1. `isValidTrainingGoal` → valida que `trainingGoal` esté en el vocabulario canónico.
2. Prioridad de `resolveTrainingGoal(profile)`:
   - `trainingGoal` válido ⇒ se usa tal cual.
   - `goal` (legacy español) ⇒ mapa exacto `GOAL_TO_TRAINING_GOAL`
     (`fuerza→strength`, `hipertrofia→hypertrophy`, `perdida_peso→fat_loss`, `movilidad→mobility`,
     `resistencia|recomposicion|mantenimiento|personalizado→general_health`). Los sin equivalente exacto
     van a `general_health` (default conservador).
   - `goalPrimary` (texto libre) ⇒ por keywords, **en orden de déficit primero**
     (`fat_loss` → `hypertrophy` → `strength` → `mobility`), consistente con `utils/nutrition.ts`.
   - Sin nada resoluble ⇒ `undefined`; **cada caller aplica su propio default** (no un valor global).

### Mapa de keywords (`goalPrimary`)
| Outcome | Keywords |
|---|---|
| `fat_loss` | fat_loss, grasa, perder, bajar |
| `hypertrophy` | hypertrophy, hipertrofia, masa, ganar |
| `strength` | strength, fuerza, force |
| `mobility` | mobility, movilidad |

> Nota de comportamiento: por el orden, un texto como *"ganar fuerza"* se resuelve a `hypertrophy`
> (por la palabra `ganar`, que tiene prioridad). Es el orden documentado y consistente con el módulo
> de nutrición; si en el futuro se quiere priorizar `force`, hay que evaluar frases compuestas (fuera de S2).

---

## Cambios realizados

### Escritores de `trainingGoal` (canónico)
| Archivo | Cambio |
|---|---|
| `src/pages/Onboarding.tsx` | Escribe `trainingGoal: resolveTrainingGoal({ goal: selectedGoal, goalPrimary: objPrincipal })`. Sigue escribiendo `goal`, `goalPrimary`, `goalsSecondary`, `customGoal` (legacy, sin duplicar nuevas escrituras innecesarias). |
| `src/pages/Perfil.tsx` | Ya escribía `trainingGoal` (verificado). Sin cambios. |
| `src/pages/Rutina.tsx:162` | Perfil base fallback ahora incluye `trainingGoal: 'hypertrophy'` (consistente con su `goal:'hipertrofia'`) |

### Lectores migrados a `resolveTrainingGoal` (con default propio preservado)
Se les agrega el fallback a legacy (`goalPrimary`) para no cambiar comportamiento de perfiles antiguos.

| Archivo | Antes | Ahora |
|---|---|---|
| `src/services/ai/coachCore.ts` | `profile?.trainingGoal` | `resolveTrainingGoal(profile) \|\| 'hypertrophy'` |
| `src/services/ai/fallbackAIProvider.ts` | `ctx.userProfile?.trainingGoal` | `resolveTrainingGoal(ctx.userProfile) \|\| 'hypertrophy'` |
| `src/services/ai/methodSelector.ts` | `profile.trainingGoal` | `resolveTrainingGoal(profile) \?\? 'hypertrophy'` |
| `src/services/ai/nutritionEngine.ts` | `userProfile.trainingGoal` | `resolveTrainingGoal(userProfile) \|\| 'hypertrophy'` |
| `src/services/ai/chatContext.ts` | `p.goalPrimary` (texto crudo) | `getGoalLabel(resolveTrainingGoal(p))` con fallback a `p.goalPrimary` |
| `src/services/nutrition/macroService.ts` | `p.goalPrimary` | `resolveTrainingGoal(p) \|\| p.goalPrimary` |
| `src/pages/Nutricion.tsx:124` | `p.goalPrimary` | `resolveTrainingGoal(p) \|\| p.goalPrimary` |
| `src/pages/Mas.tsx:89` | `prof.goalPrimary` | `resolveTrainingGoal(prof) \|\| prof.goalPrimary` |
| `src/services/ai/globalScore.ts:130` | `p?.goalPrimary` | `resolveTrainingGoal(p) \|\| p?.goalPrimary` |
| `src/services/ai/coachInsights.ts:429` | `p?.goalPrimary` | `resolveTrainingGoal(p) \|\| p?.goalPrimary` |

### `src/services/ai/contextBuilder.ts`
- Línea ~26: calcula `const trainingGoal = resolveTrainingGoal(profile)`.
- Macros (`cg2`, `pr2`): priorizan `trainingGoal` (canónico) → `goalPrimary` → `objetivo`.
- `buildPrompt` (~268): **BIG FIX** — `TRAINING_GOAL_PROFILES[goal]` recibía `goal` en español
  (`hipertrofia`, `fuerza`) con lo que indexaba `undefined` y caía silenciosamente a `hypertrophy`.
  Ahora usa `resolveTrainingGoal(ctx.userProfile) || ctx.objetivo || 'hypertrophy'`.
- `objetivo` (display/KB tags) se conserva en español legacy para no cambiar el comportamiento de
  los tags de conocimiento ni el contexto visible al modelo.

### Tipos (`src/types/index.ts`)
- `Goal` ahora incluye `movilidad` y tiene `@deprecated`.
- `goal` y `goalPrimary` tienen `@deprecated` apuntando a `trainingGoal`.
- `trainingGoal?: TrainingGoal` documentado como fuente oficial.
- Se eliminó una duplicación de `goalPrimary`/`goalsSecondary`/`customGoal` en la interfaz.

---

## Tests (nuevo archivo)

`src/utils/trainingGoal.test.ts` — cubre las 5 categorías pedidas:

1. **C1** — Perfiles nuevos (con `trainingGoal` canónico) se resuelven tal cual.
2. **C2** — `trainingGoal` tiene prioridad sobre `goal`/`goalPrimary` legacy.
3. **C3** — Legacy `goal` (español) se mapea de forma determinista (todos los valores).
4. **C4** — `goalPrimary` libre por keywords resuelve los 4 outcomes; texto no relacionado ⇒ `undefined`.
5. **C5** — Sin dato resoluble ⇒ `undefined` (sin sorpresas), y mapa legacy sin huecos + `isValidTrainingGoal`.

Adaptado: `src/services/ai/chatContext.test.ts` — assert de objetivo tolerante a capitalización
(`toLowerCase()`) porque ahora se muestra el label canónico (`Hipertrofia`).

---

## Gates (todos verdes)

| Gate | Resultado |
|---|---|
| `npm test` | ✅ 69 archivos / 565 tests (baseline 68/558 → **+1 archivo, +7 tests**) |
| `npx tsc --noEmit` | ✅ sin errores |
| `npm run build` | ✅ build OK (PWA v0.21.2) |
| `npm run lint` | ✅ 0 errores, **213 warnings** (idéntico al baseline, sin regresiones; RC=1 por `--max-warnings 0`) |

Sin reducción de tests existentes; sin tocar S1 (proxy/worker/claves) ni `FASE_2_S1_REPORT.md`.

---

## Fuera de alcance (documentado para fases futuras)

- Refactor del vocabulario de métodos de nutrición (`health/maintenance/recomposition/muscle_gain`).
- Mejora del análisis de frases compuestas en `goalPrimary` (p. ej. "ganar fuerza").
- Eliminación definitiva de escrituras legacy `goal`/`goalPrimary` desde Onboarding (deprecación ya documentada).