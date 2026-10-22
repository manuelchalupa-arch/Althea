# Pendientes para otro agente

> **Actualizado 2026-10-21.** Esta lista contiene **solo lo que sigue abierto**:
> P1–P4 requieren **medios externos** (red, credenciales, consolas) y P5 es
> **deuda de código medida** que no conviene borrar en bloque.
>
> Lo que se cerró en esta ronda (todo verificado con `tsc`, `lint`, `build` y la
> suite completa):
>
> - **Feature de feedback (specs 003 + 005) terminada de punta a punta:**
>   bandeja admin accesible para el creador (correo `manuelchalu@gmail.com`
>   en `firestore.rules`, **desplegado y verificado en vivo**), ruta de
>   detalle `/feedback/thread/:id` (antes pantalla en blanco), identidad de
>   usuario denormalizada en los hilos, detección de rol por sonda al servidor,
>   reenvío de la cola offline al reconectar (`flushOutbox` por fin con
>   consumidor), envíos que informan estado real (pendiente/error en lugar de
>   éxito falso) y `feedbackAuthz.test.ts` (SC-002) + guardas de rules en
>   `staging-preflight`. **Resuelto.**
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

## P3. Revocaciones externas de credenciales (requiere acceso a consolas)

1. Revocar API key histórica de GroqCloud (consola de Groq, sección API Keys); si se genera una nueva, actualizar el secret `GROQ_API_KEY` del Worker antes de borrar la anterior.
2. Invalidar API key de CalorieNinjas (función de cambio de clave de la cuenta).
Verificación: la clave vieja devuelve 401/error de autenticación. Detalle en `ALTHEA_FINAL_CLOSURE.md` §11.

## P4. ~~`.firebaserc` sin proyecto por defecto~~ — **RESUELTO (verificado 2026-10-21)**

Ya existe `"default": "althea-4b1d0"` en `.firebaserc` y
`VITE_FIREBASE_PROJECT_ID=althea-4b1d0` en `.env` y `.env.production`. El
despliegue de rules con `firebase deploy --only firestore:rules` funcionó
contra ese proyecto. No queda nada pendiente aquí.

## P5. Deuda de código medida, no eliminada (requiere criterio, no es mecánico)

Estos puntos de la auditoría se **midieron** en esta ronda y se decidió **no
borrar en bloque** porque el coste/riesgo supera al beneficio. Se dejan con
cifras reales para que se puedan atacar con conocimiento.

### P5.1 Exports sin uso (antes «DEAD-008»)

- **Medición (contando también el uso en tests):** de 1497 exports en producción,
  **186 no se referencian desde ningún otro archivo, ni siquiera desde un test,
  ni dentro de su propio archivo**. Son los que se pueden borrar sin ambigüedad.
- **Por qué no se borran en bloque:**
  1. **La feature de feedback** (`src/services/feedback/*`,
     `components/feedback/*`, `useFeedbackActor`): quedan sin consumidores
     `sendThreadMessage`, `listInternalNotes`, `addInternalNote`,
     `deleteMessage`, `pendingOutboxCount` y `retryFeedbackEntry`. Son
     capacidades de la spec 003 (respuestas, notas, borrado) que la spec 005
     puso **fuera de alcance** con decisión explícita ("el creador resuelve
     directo"): hoy son API muerta candidata a borrado, pero las reglas de
     Firestore aún las soportan, así que no rompen nada.
  2. El resto (~120) son candidatos legítimos, pero cada borrado puede dejar
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

## P6. Staging `althea-stg` — configurado 2026-10-21 (pasos de propietario)

Proyecto Firebase nuevo **plan Spark, sin facturación ni tarjeta** (el ID
`althea-staging` ya existía ajeno → se usó `althea-stg`). Configurado y verificado:
Firestore `(default)` en `nam5` con las rules 005 desplegadas, Web app + Hosting
site creados, APIs Firestore/Identity Toolkit habilitadas, `.env.staging` local
(gitignored) con la URL real del worker staging, `verify:env:staging` OK y
`staging:preflight` **PASS**.

Límites gratuitos aplicables (Spark): Firestore 1 GiB almacenados, 50K lecturas /
20K escrituras / 20K borrados por día, 10 GiB de egress/mes; Hosting 10 GB de
almacenamiento y 360 MB/día de transferencia; Authentication incluido (los métodos
básicos sin costo; Identity Platform 50K MAU si se activa).

Acciones del propietario para dejarlo operativo (todas gratuitas):
1. Consola Firebase → Authentication → Get started → habilitar **Email/Password**
   en `althea-stg`. Hoy `staging:firestore:e2e` falla con `CONFIGURATION_NOT_FOUND`
   (no habilitable vía API sin consola).
2. `npm run worker:secret:staging` — secret `GROQ_API_KEY` del worker de staging
   (`worker:staging:preflight` lo marca BLOCKED).
3. Consolidar los cambios sin commitear de `worker/` (limpieza WGER de otra sesión
   + `CORS_ORIGIN = https://althea-stg.web.app` ya escrito en
   `wrangler.staging.toml`) y recién entonces `npm run worker:deploy:staging`.
4. `npm run deploy:hosting:staging` cuando el WIP local (Entrenar/Biblioteca/estilos)
   esté consolidado; recién ahí `staging:verify:all`.


