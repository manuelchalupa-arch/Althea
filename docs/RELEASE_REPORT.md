# RELEASE — Informe de producción

| Dato | Valor |
|---|---|
| Fecha del intento | 2026-10-10 |
| Commit en árbol de trabajo | `1fb12f7` (`1fb12f7ca5ea8113b155f2207b024e1aff231471`) — **59 archivos SIN COMMITTEAR** |
| Entorno objetivo | producción (Firebase Hosting + Cloudflare Worker `althea-proxy-production`) |
| **Resultado** | **BLOCKED — no se desplegó nada** |

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
