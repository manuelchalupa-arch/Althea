# Pendientes para otro agente

> **Actualizado 2026-10-14.** Esta lista contiene **solo lo que sigue abierto**:
> P1–P4 requieren **medios externos** (red, credenciales, consolas) y P5 es
> **deuda de código medida** que no conviene borrar en bloque.
>
> Lo que se cerró en esta ronda (todo verificado con `tsc`, `lint`, `build` y la
> suite completa):
>
> - `npm install` fallaba con `ERESOLVE` (se quitó `@eslint/js`, que pedía
>   `eslint@^10` con el proyecto en `^9`). **Resuelto.**
> - `/entrenar` sin sesión redirigía a `/inicio`, ruta inexistente → pantalla
>   vacía. **Resuelto** (además se añadió ruta `*` para URLs desconocidas).
> - Exportar/importar datos tenía motor completo pero **sin interfaz**; ahora
>   está en Perfil → «Tus datos». **Resuelto.**
> - Activación de notificaciones push sin control en la UI. **Resuelto**
>   (Perfil → Notificaciones).
> - `eslint-plugin-jsx-a11y` instalado pero nunca cargado: **no había ninguna
>   detección de accesibilidad**. **Resuelto**; la deuda restante está
>   inventariada en `DEUDA_ACCESIBILIDAD.md`.
> - CSP con `https://*.workers.dev` (cualquier Worker de terceros) → acotado a
>   `althea-proxy-*.workers.dev`. **Resuelto.**
> - Sin tope de tamaño en `firestore.rules`. **Resuelto.**
> - `noUnusedLocals`/`noUnusedParameters` desactivados (dejaban pasar imports
>   muertos). **Resueltos y activados.**
> - `VITE_GROQ_PROXY_URL` con la URL real de staging como valor por defecto en
>   `.env.example`. **Resuelto** (ahora es un placeholder).
> - URL base de WGER duplicada en 3 lugares. **Resuelta** (una sola constante).
> - Referencias rotas en documentación (`wrangler.toml`, `foodProvider.ts`).
>   **Resueltas.**
>
> Lo automatizable localmente sigue cerrado y en verde. Lo que queda requiere
> **medios que este entorno no tiene**: credenciales externas, accesos a consolas
> o decisiones arquitectónicas con riesgo funcional. Cada punto incluye qué
> falta y cómo resolverlo.

---

Todo lo automatizable localmente está cerrado y en verde (tsc 0, lint 0, build PASS, check:release OK). Lo siguiente **requiere medios que este entorno no tiene** (credenciales externas, accesos a consolas o decisiones arquitectónicas con riesgo funcional). Cada punto incluye exactamente qué falta y cómo resolverlo.

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

## P2. Validación WGER contra la API real (requiere red + cuenta externa)

16 tests omitidos por diseño, en dos grupos:

1. **7 autenticados** (`wgerIntegration.test.ts`, `describe.skipIf(!hasCredentials)`):
   requieren **cuenta de prueba** en `https://wger.de`. Exportar
   `WGER_TEST_USERNAME` y `WGER_TEST_PASSWORD` (o el flujo `WGER_INTEGRATION_TEST=1`
   documentado en el test) y ejecutar
   `npx vitest run src/services/integrations/wger/`. Nunca commitear credenciales.
2. **9 de contrato público** (`wgerPublicContract.test.ts`,
   `describe.skipIf(!RUN_PUBLIC)`): requieren **solo** `WGER_PUBLIC_INTEGRATION=1`
   (lectura de endpoints públicos, sin cuenta). Se intentó ejecutar aquí y
   **fallan todos por falta de red**, no por el código.

Ambos grupos requieren además **salida de red a `wger.de`**, que este entorno no
tiene (verificado: `connect ETIMEDOUT 128.140.77.49:443`). Por eso no se pueden
validar aquí aunque se aporte la cuenta.

## P3. Revocaciones externas de credenciales (requiere acceso a consolas)

1. Revocar API key histórica de GroqCloud (consola de Groq, sección API Keys); si se genera una nueva, actualizar el secret `GROQ_API_KEY` del Worker antes de borrar la anterior.
2. Invalidar API key de CalorieNinjas (función de cambio de clave de la cuenta).
Verificación: la clave vieja devuelve 401/error de autenticación. Detalle en `ALTHEA_FINAL_CLOSURE.md` §11.

## P4. `.firebaserc` sin proyecto por defecto (requiere ID del proyecto Firebase)

El ID (`VITE_FIREBASE_PROJECT_ID`) no existe en ningún `.env` local, por lo que no se puede generar sin inventarlo. Para resolverlo: `firebase use --add` con el project ID real al momento del deploy. No bloquea readiness ni build.

## P5. Deuda de código medida, no eliminada (requiere criterio, no es mecánico)

Estos puntos de la auditoría se **midieron** en esta ronda y se decidió **no
borrar en bloque** porque el coste/riesgo supera al beneficio. Se dejan con
cifras reales para que se puedan atacar con conocimiento.

### P5.0 Subcarpetas de Wger (antes «DEAD-005») — **RECHAZADO, no es un hallazgo válido**

- **Qué decía:** `src/services/integrations/wger/{training,stats,nutrition,measurements}/`
  (~1950 líneas, 20 archivos) no tiene consumidor en runtime → borrar.
- **Por qué se rechaza:** contradice una **decisión arquitectónica explícita y
  documentada** en el propio código. `src/services/integrations/wger/wgerComparison.ts`
  contiene `DECISION = { decision: 'MANTENER_AMBAS', ... }`: ExerciseGymGifsDB es
  la fuente de ejercicios y Wger se conserva como **fuente externa de
  enriquecimiento** (ingredientes de Open Food Facts + ejercicios adicionales +
  licencia CC-BY-SA por registro). Las subcarpetas son la capa de esa estrategia.
- **Conclusión:** no se elimina. La auditoría automática las marcó como muertas
  por «cero imports en runtime», sin conocer la decisión de producto.

### P5.1 Exports sin uso (antes «DEAD-008»)

- **Medición (contando también el uso en tests):** de 1497 exports en producción,
  **186 no se referencian desde ningún otro archivo, ni siquiera desde un test,
  ni dentro de su propio archivo**. Son los que se pueden borrar sin ambigüedad.
- **Por qué no se borran en bloque:**
  1. **El barril `src/services/integrations/wger/index.ts`** aporta ~45 de esos
     186. Es la API pública del subsistema que P5.0 decidió **conservar**:
     vaciarlo contradice esa decisión.
  2. **La feature de feedback en desarrollo activo** (`src/services/feedback/*`,
     `components/feedback/*`, `useFeedbackActor`): ~20 exports sin consumidores
     porque está a medio construir. Borrarla rompería trabajo en curso.
  3. El resto (~120) son candidatos legítimos, pero cada borrado puede dejar
     imports internos huérfanos (que `noUnusedLocals` ahora sí detecta) y exige
     `tsc`+`lint`+suite verdes por módulo.
- **Recomendación:** un pase por módulo, empezando por `src/utils/*` y
  `src/services/ai/*` (los de mayor cantidad), borrando export + helper
  interno + `tsc`/`lint` tras cada archivo.

### P5.2 Clases CSS sin uso (antes «DEAD-009»)

- **Medición:** 199 clases definidas a mano en `src/index.css` +
  `src/styles/althea-*.css`. **50 sin uso estático en componentes.**
- **Falsos positivos confirmados (NO borrar):** se construyen dinámicamente:
  `althea-plate__status--*`, `althea-nav--*`, `is-active-*`, `st-*`
  (`st-active`, `st-skipped`, `st-partial`, `st-cancelled`, `st-abandoned`),
  `status-tag--completed`.
- **Candidatas reales (~43):** utilidades de layout (`althea-col-*`,
  `althea-grid-12`, `althea-stack*`, `althea-page`), decorativas
  (`althea-marble*`, `althea-gold-rule`, `althea-wordmark*`, `tfade`, `veil`,
  `temple-rise`), componentes sin adoptar (`althea-drawer*`, `althea-sheet`,
  `althea-seg`, `althea-tab(s)`, `althea-divider`, `althea-table--striped`),
  e iconos de tema (`icon-sun`, `icon-moon`) —estos últimos probablemente sí
  se usen por convención de tema.
- **Por qué no se borran:** son ~2 KB, no afectan al runtime, y viven en la
  cascada de un sistema de diseño con selectores compuestos. Borrar `.althea-nav`
  rompería las variantes `--bar`/`--sidebar`. El beneficio es cosmético y el
  riesgo, silencioso (ningún test detecta un `className` eliminado).

### P5.3 Componente Modal accesible (antes «A11Y-001»)

Ver `DEUDA_ACCESIBILIDAD.md`: ~41 overlays `fixed inset-0` frente a 2 con
semántica de diálogo. Es trabajo de refactor de UI, no una corrección puntual.


