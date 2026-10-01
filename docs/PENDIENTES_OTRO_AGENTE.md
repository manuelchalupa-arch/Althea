# Pendientes para otro agente (cierre 2026-10-01)

Todo lo automatizable localmente está cerrado y en verde (tsc 0, tests 132/1208, lint 0, build PASS, check:release OK). Lo siguiente **requiere medios que este entorno no tiene** (credenciales externas, accesos a consolas o decisiones arquitectónicas con riesgo funcional). Cada punto incluye exactamente qué falta y cómo resolverlo.

## P1. Umbrales T032: Performance ≥85 y JS inicial <150 KB gzip (BLOQUEADO por arquitectura)

**Estado medido final (Lighthouse 11.7.1, misma metodología que §14 de `ALTHEA_FINAL_CLOSURE.md`, re-medido 2026-10-01 tras el cierre definitivo):**
PWA 100/100 · Performance 72/100 (FCP 2,9–3,0 s · LCP 6,5 s · TBT 10–20 ms · CLS 0 · SI 2,9–3,0 s · TTI 4,6–4,9 s).
JS inicial ≈280 KB gzip, piso arquitectónico medido por chunk:
`vendor-react` 44.7 + `vendor-router` 13.5 + `vendor-state`(dexie) 31.6 + `vendor-firebase` 140 + `index` 73.9 (+ icons/utils).

**Optimizaciones realizadas en código (verificadas):**
- `@huggingface/transformers` y `recharts` eliminados del proyecto (cero importadores): chunk `vendor-transformers` (119.6 KB) y wasm ONNX fuera de `dist`; precache 87→86 entradas.
- `aiService` en Inicio/Entrenar por `import()` dinámico (obsoleto tras la remoción: el módulo liviano resultante se importa estático sin costo).
- Corregida la clasificación `@firebase/*` → `vendor-firebase` (antes caía en `vendor-other`).

**Qué queda y por qué no es razonablemente reducible:** el LCP (6,5 s en Moto G4 simulado) está dominado por parse/compilación del JS inicial; Firebase solo (140 KB) consume casi todo el presupuesto de 150 KB y es necesario en el arranque (auth gating, messaging, sync). Alcanzar los umbrales exigiría diferir Firebase/Dexie del arranque, lo que cambia el boot offline-first y el gating de login: reestructuración desproporcionada con riesgo funcional. No se modificó por estabilidad.

## P2. Validación WGER con credenciales reales (requiere cuenta externa)

12 tests omitidos por diseño (`describe.skipIf`, `REQUIRES_CREDENCIALES` en `src/services/integrations/wger/wgerIntegration.test.ts`).
Para resolverlo: conseguir cuenta de prueba en `https://wger.de`, exportar `WGER_TEST_USERNAME` y `WGER_TEST_PASSWORD` (o el flujo `WGER_INTEGRATION_TEST=1` documentado en el test), ejecutar `npx vitest run src/services/integrations/wger/`. Nunca commitear credenciales.

## P3. Revocaciones externas de credenciales (requiere acceso a consolas)

1. Revocar API key histórica de GroqCloud (consola de Groq, sección API Keys); si se genera una nueva, actualizar el secret `GROQ_API_KEY` del Worker antes de borrar la anterior.
2. Invalidar API key de CalorieNinjas (función de cambio de clave de la cuenta).
Verificación: la clave vieja devuelve 401/error de autenticación. Detalle en `ALTHEA_FINAL_CLOSURE.md` §11.

## P4. `.firebaserc` sin proyecto por defecto (requiere ID del proyecto Firebase)

El ID (`VITE_FIREBASE_PROJECT_ID`) no existe en ningún `.env` local, por lo que no se puede generar sin inventarlo. Para resolverlo: `firebase use --add` con el project ID real al momento del deploy. No bloquea readiness ni build.
