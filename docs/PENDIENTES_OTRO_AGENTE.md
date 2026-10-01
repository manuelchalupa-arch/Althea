# Pendientes para otro agente (cierre 2026-10-01)

Todo lo automatizable localmente está cerrado y en verde (tsc 0, tests 132/1208, lint 0, build PASS, check:release OK). Lo siguiente **requiere medios que este entorno no tiene** (credenciales externas, accesos a consolas o decisiones arquitectónicas con riesgo funcional). Cada punto incluye exactamente qué falta y cómo resolverlo.

## P1. Umbrales T032: Performance ≥85 y JS inicial <150 KB gzip (BLOQUEADO por arquitectura)

**Estado medido (Lighthouse 11.7.1, misma metodología que §14 de `ALTHEA_FINAL_CLOSURE.md`):**
PWA 100/100 · Performance 72/100 (FCP 2,9 s · LCP 6,5 s · TBT 10 ms · CLS 0 · SI 2,9 s · TTI 4,6 s).
JS inicial ≈280 KB gzip, piso arquitectónico medido por chunk:
`vendor-react` 44.7 + `vendor-router` 13.5 + `vendor-state`(dexie) 31.6 + `vendor-firebase` 140 + `index` 73.9 (+ icons/utils).

**Ya intentado y verificado:**
- `@huggingface/transformers` solo por import dinámico (chunk separado 119.6 KB, fuera del inicio).
- `aiService` en Inicio/Entrenar por `import()` dinámico.
- Corregida la clasificación `@firebase/*` → `vendor-firebase` (antes caía en `vendor-other`).
- Re-medición 2026-10-01: Performance 72 (antes 75, ruido de medición), LCP JS-bound (sin imágenes pesadas en Inicio).

**Para resolverlo (otro agente):** diferir la inicialización de Firebase (auth/messaging/sync) hasta después del primer paint y/o diferir Dexie del arranque, o recortar dependencias. Riesgo: cambia el boot (gating de login, offline-first) — requiere decisión de producto + re-verificación funcional completa + re-medir con `npx -y lighthouse@11` contra `npm run preview`.

## P2. Validación WGER con credenciales reales (requiere cuenta externa)

12 tests omitidos por diseño (`describe.skipIf`, `REQUIRES_CREDENCIALES` en `src/services/integrations/wger/wgerIntegration.test.ts`).
Para resolverlo: conseguir cuenta de prueba en `https://wger.de`, exportar `WGER_TEST_USERNAME` y `WGER_TEST_PASSWORD` (o el flujo `WGER_INTEGRATION_TEST=1` documentado en el test), ejecutar `npx vitest run src/services/integrations/wger/`. Nunca commitear credenciales.

## P3. Revocaciones externas de credenciales (requiere acceso a consolas)

1. Revocar API key histórica de GroqCloud (consola de Groq, sección API Keys); si se genera una nueva, actualizar el secret `GROQ_API_KEY` del Worker antes de borrar la anterior.
2. Invalidar API key de CalorieNinjas (función de cambio de clave de la cuenta).
Verificación: la clave vieja devuelve 401/error de autenticación. Detalle en `ALTHEA_FINAL_CLOSURE.md` §11.

## P4. `.firebaserc` sin proyecto por defecto (requiere ID del proyecto Firebase)

El ID (`VITE_FIREBASE_PROJECT_ID`) no existe en ningún `.env` local, por lo que no se puede generar sin inventarlo. Para resolverlo: `firebase use --add` con el project ID real al momento del deploy. No bloquea readiness ni build.
