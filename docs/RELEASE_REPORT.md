# RELEASE — Informe de producción

> **ESTADO FINAL: PUBLICADO el 2026-10-20 → https://altheafit.netlify.app**
> (Frontend en Netlify · Backend Firebase `althea-4b1d0` · Hosting Firebase deshabilitado, ver §6)
> Ver §6 (Release ejecutado) al final. El §1–§5 que siguen son el análisis del
> intento bloqueado del 2026-10-10, conservado como histórico.

| Dato | Valor |
|---|---|
| Fecha del intento | 2026-10-10 |
| Commit en árbol de trabajo | `1fb12f7` (`1fb12f7ca5ea8113b155f2207b024e1aff231471`) — **59 archivos SIN COMMITTEAR** |
| Entorno objetivo | producción (Firebase Hosting + Cloudflare Worker `althea-proxy-production`) |
| **Resultado del intento** | **BLOCKED — no se desplegó nada** (superado por el release del 2026-10-20, §6) |

Ningún comando de despliegue fue ejecutado. No se corrieron
`worker:deploy:production`, `worker:secret:production`, `worker:kv:production`,
`deploy:hosting:production` ni ningún deploy de `firestore.rules`.

---

## 1. Condiciones previas (§1) — veredicto real

| # | Condición | Veredicto | Evidencia |
|---|---|---|---|
| 1 | CI verde | **FAIL** | 59 archivos modificados sin commitear; el CI no puede haber corrido sobre este código |
| 2 | Staging validado (Auth/Firestore/Worker/CORS/Coach/PWA) | **FAIL** | Sólo el Worker de staging está validado (28 PASS). Auth E2E, aislamiento Firestore, Hosting, CSP live, PWA y Coach remoto siguen `NOT VALIDATED` |
| 3 | Clave Groq histórica sustituida + nueva en los Workers | **FAIL** | `worker:staging:preflight` → `GROQ_API_KEY_NOT_SET_ON_WORKER`; el Worker de staging responde 503 fail-closed |
| 4 | Clave antigua de Groq revocada | **FAIL** | `docs/INFRAESTRUCTURA.md` §9 → **NOT REVOKED** |
| 5 | CalorieNinjas revocada o resultado documentado | **FAIL** | §9 → **NOT REVOKED** |
| 6 | `.env.production` correcto | **FAIL** | Sólo contiene `VITE_GROQ_PROXY_URL`; faltan las 6 `VITE_FIREBASE_*` y `FIREBASE_PRODUCTION_PROJECT_ID` |
| 7 | `CORS_ORIGIN` de producción coincide con los orígenes reales | **NOT VERIFIABLE** | Está en `https://althea.app,https://www.althea.app`, pero sin proyecto de producción declarado no hay Hosting que lo sirva ni forma de confirmar el dominio real |
| 8 | KV de producción con ID válido y distinto del de staging | **FAIL** | `worker/wrangler.production.toml:40` → `REEMPLAZAR_KV_NAMESPACE_ID_PRODUCTION` |
| 9 | Durable Object enlazada y migración compatible | **FAIL** (no aplicado) | El binding y `migrations tag = v1` existen en el toml, pero no se aplicaron a un Worker de producción desplegado. Ojo: si el Worker de producción ya tiene una migración `v1`, el tag debe incrementarse |
| 10 | `check:release` sin secretos en el bundle | **PASS** | 114 archivos revisados, 0 claves; `gsk_` ausente de `dist/` |
| 11 | Guard de despliegue exige autorización | **PASS** | `deploy-hosting.mjs production` → `FAIL-CLOSED` en 3 escenarios (verificado el 2026-10-10) |

**Cinco condiciones críticas en FAIL. Regla §1 aplicada: no se despliega.**

## 2. Artefactos reales disponibles para rollback

| Artefacto | Valor verificado |
|---|---|
| Commit | `1fb12f7` (con 59 archivos sin commitear — **no es publicable**) |
| Proyecto Firebase de producción | **desconocido / no declarado** |
| Release de Hosting | **no existe** (nunca se desplegó) |
| Versión del Worker de producción | **no desplegada** |
| Worker de staging (único desplegado) | `althea-proxy-staging` · `f38181b8-0a9e-4f2a-9231-0dbd853d8ed6` |

Sin commit publicado, sin release de Hosting y sin versión de Worker en
producción, **no hay nada que revertir**. Ver `docs/RELEASE_ROLLBACK.md`.

## 3. Protecciones (§4) — estado antes de cualquier release

| Protección | Estado |
|---|---|
| Rate limit Durable Object (fuerte) | implementado y verificado en vivo en **staging** (`X-RateLimit-Mode: durable-object`, límite 20) |
| Rate limit KV (degradado) | implementado; namespace de producción **sin crear** |
| CORS fail-closed (allowlist exacta, sin `*`) | implementado en ambos tomls |
| CSP + headers de Hosting | implementados, con guard en CI (`hostingHeaders.test.ts`) |
| Reglas `firestore.rules` (`users/{uid}`) | versionadas; **nunca desplegadas** a ningún proyecto real |
| Presupuesto/alertas Firebase y Cloudflare | **no verificables** desde el repositorio; requieren consola del propietario |
| WAF | **no disponible / no configurado**; se mantiene todo el hardening del Worker |

## 4. Para desbloquear el release

En orden estricto (§1 → §2 → §3):

1. **Revocar** la clave histórica de Groq y la de CalorieNinjas en sus consolas, y reportar el resultado real.
2. Completar el **staging**: `npm run setup:environments`, `npm run worker:secret:staging`, deploy de Hosting + `firestore.rules`, y pasar `staging:auth:e2e`, `staging:firestore:e2e`, `staging:http:smoke`, `staging:hosting:check` y `staging:pwa:check`.
3. **Committer** los 59 archivos pendientes y ver CI verde sobre ese commit.
4. Completar `.env.production` (6 claves `VITE_FIREBASE_*` + `FIREBASE_PRODUCTION_PROJECT_ID`) vía `npm run setup:environments`.
5. Crear el **KV de producción** y registrar el ID real en `worker/wrangler.production.toml` (nunca un ID ficticio).
6. Confirmar el **dominio real** de producción para alinear `CORS_ORIGIN`.
7. `npm run worker:secret:production` con la clave nueva pegada en el terminal del propietario.
8. Autorización explícita del propietario → `ALTHEA_ALLOW_PRODUCTION_DEPLOY=1 npm run deploy:hosting:production` + deploy de `firestore.rules` con `--project` explícito.

---

## 6. Release ejecutado — 2026-10-20 ✅ PUBLICADO EN NETLIFY

**URL en vivo: https://altheafit.netlify.app** · Backend: Firebase `althea-4b1d0` (único entorno). El Hosting de Firebase (`althea-4b1d0.web.app`) quedó **deshabilitado** (404) por decisión del propietario: Firebase es SOLO backend.

| Artefacto | Valor |
|---|---|
| Frontend | **Netlify deploy** 2026-10-20 (`--no-build` de `dist` compilado en verde) — bundle en vivo verificado: config `althea-4b1d0` + proxy + `/onboarding` 200 |
| Worker producción | `althea-proxy-production` · Version ID `bd6472e9-0e73-49f9-b42c-2f4858074cca` (CORS con `altheafit.netlify.app`) |
| Worker security matrix | **28 PASS / 0 FAIL** (CORS/métodos/Content-Type/límites/payload/rate limit `durable-object`) |
| Groq E2E | **200 con contenido del modelo** vía proxy desde origen netlify y web.app (antes: los 4 NOT VALIDATED) |
| KV producción | namespace `RATE_LIMIT_PRODUCTION` → `598bd1ae4ca9455ab86181d55ae69217` |
| Firestore rules | desplegadas a `althea-4b1d0` (`users/{uid}`) |
| Hosting Firebase | **DISABLED** 2026-10-20 (`web.app` → 404). El sitio default **no es borrable** (API: `FAILED_PRECONDITION: Cannot delete default Hosting Site`). Se reactiva con `firebase deploy --only hosting` |
| Build/secret scan | `check:release` OK — **0 claves** en `dist/` |
| Suite previa | tsc 0 · lint 0 · **1648 tests OK** · build PWA OK |

### Desviaciones respecto del plan §1 (decisiones del propietario)

1. **Proyecto único** `althea-4b1d0` para staging y producción — se prescindió del entorno Firebase separado; `staging:firestore:e2e` no aplica (aborta si staging == producción por diseño). El Worker `althea-proxy-staging` queda como banco de pruebas de seguridad.
2. **Clave histórica de Groq NO revocada** — el propietario decidió usar sólo la clave nueva (2026-10-20) y no rotar la vieja; riesgo aceptado y registrado en `INFRAESTRUCTURA.md` §9.
3. **CalorieNinjas sin acción** — fuera de runtime desde `7f3c687` (sin clientes/claves/llamadas); el bloqueo §1.5 era obsoleto.
4. **CI sobre el release**: los archivos del intento anterior fueron commiteados y subidos (commits `3c50871`, `a6c7d96`, `4f40d93`) + commits de preparación y publicación (`beaf655`…`7beb682` + docs) — **push autorizado por el propietario y ejecutado**.
5. **Dominio**: el frontend vive en `https://altheafit.netlify.app` (CORS del Worker incluye ese origen + `althea.app` + `www.althea.app`). Hosting Firebase deshabilitado; `althea-4b1d0.web.app` ya no sirve la app.
6. **VAPID/push**: sin clave → notificaciones push deshabilitadas (no bloqueante; añadir desde Firebase Console → Cloud Messaging si se desea).
7. **Build nativo de Netlify falla con WIP ajeno**: el sitio tiene build command `npm run build` en la UI; si hay código sin commitear que no compila, el deploy automático falla. La publicación se hizo con `--no-build` + `dist` verde. `netlify.toml` versiona las `VITE_*` para que el build de Netlify (cuando esté verde) tenga la config completa.

### Rollback (ya disponible)

```bash
cd worker && npx wrangler rollback -c wrangler.production.toml   # worker
# frontend Netlify: redeploy del dist anterior:
#   npx netlify-cli deploy --prod --no-build --dir dist --site 42c60f79-a4b4-4161-a194-79c79192ca83
# reactivar Hosting Firebase (quedó DISABLED):
#   firebase deploy --only hosting --project althea-4b1d0
```
