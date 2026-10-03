# ALTHEA — Infraestructura, Seguridad y Staging

Estado de este documento: refleja el hardening local del Worker y la
preparación de la separación staging/producción. **No** certifica validación
contra entornos reales.

```
CODE-COMPLETE      = TRUE
STAGING-VALIDATED   = FALSE   (falta proyecto Firebase + credenciales del owner)
PRODUCTION-READY   = FALSE   (falta staging + revocación de claves históricas)
```

---

## 1. Topología

```
Navegador
  ├── Firebase Auth        (identidad)
  ├── Firestore            users/{uid}/**   ← reglas: request.auth.uid == uid
  └── POST /  ───────────► Cloudflare Worker
                              │  CORS fail-closed, body limit, payload
                              │  validation, timeout, rate limit
                              ▼
                          Groq API           (GROQ_API_KEY = secret server-side)
  └── /api/wger/* ───────► Cloudflare Worker ──► wger.de (token HttpOnly)
```

Regla dura: el frontend **nunca** habla con `api.groq.com`. La única clave
privada del proyecto (`GROQ_API_KEY`) existe sólo como secret del Worker.

### Estado real del Worker de staging (verificado en vivo)

| Dato | Valor |
|---|---|
| Worker | `althea-proxy-staging` |
| URL | `https://althea-proxy-staging.manuelchalupa.workers.dev` |
| Version ID del deploy | `f38181b8-0a9e-4f2a-9231-0dbd853d8ed6` |
| KV namespace (capa 2) | `0f643e89b72743f197bd851c4dd9146e` |
| Durable Object (capa 1) | `RateLimiter` — enlazada y confirmada en el deploy |
| `CORS_ORIGIN` | `https://althea-staging.web.app` |
| `GROQ_API_KEY` | **FALTA** — el Worker responde 503 fail-closed |

El Worker de staging se desplegó y se verificó **contra el servicio real**
(28 comprobaciones, ver §10). Lo único que no se ha podido exercised es el
tramo final hacia Groq, que necesita el secret.

---

## 2. Variables de entorno

| Variable | Pública | Dónde se usa |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | sí | `src/services/firebase/config.ts` |
| `VITE_FIREBASE_AUTH_DOMAIN` | sí | íd. |
| `VITE_FIREBASE_PROJECT_ID` | sí | íd. |
| `VITE_FIREBASE_STORAGE_BUCKET` | sí | íd. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | sí | íd. |
| `VITE_FIREBASE_APP_ID` | sí | íd. |
| `VITE_FIREBASE_VAPID_KEY` | sí | `src/services/firebase/messaging.ts` |
| `VITE_GROQ_PROXY_URL` | sí | `src/services/ai/groqConfig.ts` |
| `GROQ_API_KEY` | **NO** | sólo secret del Cloudflare Worker |

Ninguna privada está en `VITE_*`. `.env*` está en `.gitignore`
(`.env`, `.env.local`, `.env.production`). Plantilla: `.env.example`.

---

## 3. Hardening del Worker

Implementado en `worker/src/index.js`. Cada regla tiene tests en
`worker/src/index.test.ts` (56 tests). Los tests prueban la **lógica**
(CODE-VERIFIED); no sustituyen la prueba contra el Worker desplegado.

### 3.1 CORS — fail-closed

Antes: `env.CORS_ORIGIN || request.headers.get('Origin') || '*'` → cualquier
origin, y el header `Access-Control-Allow-Origin` reflejaba el origin pedido.

Ahora:
- `CORS_ORIGIN` es obligatorio. Sin él (o si es `*`, o si contiene `*`) → **500**.
- Lista separada por coma, comparación **exacta**. No se refleja el Origin.
- Origin no permitido → **403** sin header CORS.
- Preflight `OPTIONS` → 204 sólo para origin permitido; si no, 403.
- `Allow: POST, OPTIONS` en las respuestas 405.
- Endpoints WGER exigen `Origin` explícito (usan cookies).

Requests sin `Origin` (same-origin, health checks, curl) no son un bypass de
CORS: el navegador siempre envía `Origin` en cross-origin, y el control real de
credenciales lo dan `SameSite=Strict` + `Secure` en la cookie de WGER.

### 3.2 Métodos

Sólo `POST` (Groq) y `GET/POST/DELETE` (WGER). `GET/PUT/PATCH/DELETE` en `/`
→ 405 con `Allow: POST, OPTIONS`. Un 405 no ejecuta ninguna llamada saliente.

### 3.3 Content-Type

`application/json` obligatorio en POST (se acepta con parámetros `charset`).
`text/plain`, `form-data`, `multipart/*` o ausente → **415**.

### 3.4 Body size limit

| Endpoint | Límite | Código |
|---|---|---|
| `/` (Groq) | **65536 B (64 KiB)** | `413` + header `X-Max-Body-Bytes` |
| `/api/wger/*` | **8192 B (8 KiB)** | `413` |

Doble barrera: se mira `Content-Length` antes de leer, y además se corta el
stream por bytes reales (`Content-Length` es falsificable).

El payload real del Coach ronda 2-8 KB (system prompt + contexto de usuario,
`max_tokens=512`), así que 64 KiB es holgado y aún corta abuso.

### 3.5 Payload validation — proxy controlado, no relay

`validateChatPayload()` acepta un esquema cerrado:
- Raíz: objeto. Sólo se admiten `messages` y las claves de provider que el
  frontend ya envía (`model`, `max_tokens`, `temperature`, `top_p`, `stream`),
  que se **aceptan pero se ignoran**.
- Cualquier otro campo → 422 `unexpected_field`. El cliente no puede
  inyectar `url`, `api_key`, `headers`, ni nada fuera del esquema.
- `messages`: array no vacío, máx **40** mensajes.
- `role` ∈ {`system`, `user`, `assistant`}. Sin campos extra por mensaje
  (nada de `name`, `function_call`).
- `content`: string no vacío, máx **12000** caracteres.
- El payload que sale se **reconstruye en el servidor**:
  `model = openai/gpt-oss-20b`, `max_tokens = 512`, `temperature = 0.7`,
  `top_p = 0.9`, `stream = true`. El cliente no puede fijarlos (verificado por
  test: mandando `model: 'attacker-model'` el upstream recibe el modelo del
  servidor).
- Sólo se reenvían `Content-Type` y `Authorization` hacia Groq. Ningún header
  del cliente se propaga.

El proxy WGER también dejó de ser relay: `WGER_ALLOWED_PATH` limita las rutas
a una allowlist (`exerciseinfo`, `muscle`, `equipment`, `workout`, …).

### 3.6 Timeout

`fetchWithTimeout()` con `AbortController` en **toda** llamada saliente.
Groq: `GROQ_TIMEOUT_MS` (default 60000). WGER: `WGER_TIMEOUT_MS` (default 15000).
Excedido → **504** `upstream_timeout`, sin detalle interno.

### 3.7 Error sanitization

Nunca se devuelve: cuerpo del proveedor, headers upstream, stack traces,
variables de entorno ni mensajes con detalle de infra.
- Groq no-2xx → **502** `upstream_error`, y se registra sólo el status upstream.
- Fallo de red → **502** `upstream_error`.
- Secret ausente → **503** `proxy_not_configured`.
- Tests verifican que `sk-live-leak`, `gsk_secretvalue` y `org_12345` nunca
  llegan al cliente.

### 3.8 Rate limit / abuse control

Tres capas. Se usa siempre **la más fuerte disponible** y la respuesta declara
cuál se usó (`X-RateLimit-Mode`). Ninguna degrada en silencio.

| # | Capa | Mecanismo | Garantía | Modo |
|---|---|---|---|---|
| 1 | **Durable Object** | binding `RATE_LIMITER`, clase `RateLimiter` | **Strongly consistent.** Un isolate por clave ⇒ las peticiones de esa clave se serializan. Única capa que es un boundary de seguridad real en el edge distribuido. | `durable-object` |
| 2 | KV namespace | binding `RATE_LIMIT` | Eventualmente consistente. Frena abuso trivial y coste accidental, pero **no** es un techo: dos isolates pueden leer antes de escribir. | `kv` |
| 3 | Memoria del isolate | `Map` en el módulo | **Ninguna** en un edge multi-isolate. Solo para desarrollo sin bindings. | `memory-degraded` |

- Groq: **20 req / 60 s** por IP (`CF-Connecting-IP`).
- WGER: **60 req / 60 s** por IP (tráfico de sincronización, más holgado).
- Al exceder → **429** + `Retry-After`, `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Si la capa 1 falla → degrada a la 2, marcada `degraded: true` y
  `X-RateLimit-Mode: kv`. Sin binding alguno → capa 3.
- Si KV está caído → fail-**open** (el Coach no se cae por un fallo de rate
  limit), también marcado `degraded`.

**Ventana fija y su límite conocido:** el contador guarda `{ count, resetAt }`.
Una petición justo en el borde puede ver la ventana nueva antes de tiempo y
gastar hasta 2× el límite en un instante. Es el trade-off consciente de un
contador sin estado global compartido.

**Refuerzo recomendado fuera del repo** (requiere cuenta): una WAF Rate
Limiting Rule sobre la ruta del Worker actúa en el borde, **antes** de que la
petición llegue al código, y cubre también el coste de cómputo. El rate limit
de la capa 1 protege el gasto de Groq; la WAF protege al Worker. Son
complementarios, no sustitutos.

**Lo que sigue siendo del propietario:** el binding de la Durable Object se
materializa al desplegar (`npx wrangler deploy` aplica la migración `v1`).
Hasta ese deploy la capa 1 no existe en el edge y el modo real es `kv` o
`memory-degraded`. El código está completo y testeado; la validación es
**STAGING-VALIDATED, no CODE-VERIFIED**.

Tests: `worker/src/rate-limiter.test.ts` (17) ejercitan la Durable Object
contra un storage falso y la cadena DO → KV → memoria.

Configuración extra recomendada en Cloudflare (fuera del repo, requiere
cuenta): WAF Rate Limiting Rule sobre la ruta del Worker, y Alerts de coste.

### 3.9 Cookies WGER

`wger_token` = `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`.

`SameSite=Strict` + `Secure` cubren CSRF para este flujo: el navegador no
adjunta la cookie en peticiones cross-site, y el Worker además exige `Origin`
de la allowlist antes de leer la cookie. `Path=/` es amplio a propósito (el
frontend llama a rutas WGER distintas); si se quisería reducir, habría que
mover todos los endpoints a un prefijo común. **CSRF no está pendiente**, pero
cualquier cambio de `SameSite` a `None` exigiría revisar esto de nuevo.

---

## 4. Coach: remoto y fallback

- Remoto: `chatService.streamChat()` → `VITE_GROQ_PROXY_URL` → Worker → Groq.
  Si `VITE_GROQ_PROXY_URL` está vacía → no hay llamada remota.
- Fallback: `chatLocalFallback` / `fallbackAIProvider`, determinístico.
- El fallback no inventa estadísticas, historial, peso ni progreso.

Estado: **CODE-VERIFIED** (unit tests). E2E real requiere Worker desplegado.

---

## 5. Separación staging / producción

### Firebase

`.firebaserc` **no** está versionado porque necesita los project ids reales.
Plantilla versionada: `.firebaserc.example` (alias `staging`, `production`, y
targets de Hosting por site).

Los deploys pasan por un guard fail-closed (`scripts/deploy-hosting.mjs`):
exige `FIREBASE_PROJECT_ID` explícito, rechaza placeholders, imprime
`ENVIRONMENT` / `PROJECT_ID` / `SITE_ID` antes de deployar, y **exige
`ALTHEA_ALLOW_PRODUCTION_DEPLOY=1`** para producción.

```bash
# staging
set FIREBASE_PROJECT_ID=<STAGING_PROJECT_ID>
npm run deploy:hosting:staging

# production (sólo con autorización del propietario)
set FIREBASE_PROJECT_ID=<PRODUCTION_PROJECT_ID>
set ALTHEA_ALLOW_PRODUCTION_DEPLOY=1
npm run deploy:hosting:production
```

Las Firestore Rules se despliegan desde el archivo versionado
(`firebase.json` → `firestore.rules`). No editar reglas en consola: si divergen
del repo, la fuente de verdad es el repo y hay que redeployar.

### Cloudflare

| | Staging | Producción |
|---|---|---|
| Config | `worker/wrangler.staging.toml` | `worker/wrangler.production.toml` |
| Worker | `althea-proxy-staging` | `althea-proxy-production` |
| `CORS_ORIGIN` | origin de staging | origins de producción |
| KV `RATE_LIMIT` | namespace propio | namespace propio |
| `GROQ_API_KEY` | secret propio | secret propio |

`worker/wrangler.toml` (ambiguo, sin entorno) fue **eliminado**: un
`npx wrangler deploy` a secas ya no tiene a qué apuntar.

---

## 6. Headers de Hosting

En `firebase.json` → `hosting.headers`:

| Header | Valor |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | deny por defecto; permite cámara/micrófono/geo |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

CSP en `firebase.json`, bloque `source: "/index.html"` (no en `**`, para no
aplicarla a assets cacheados):
`default-src 'self'`, `script-src 'self'` (sin `unsafe-inline`: Vite externaliza
los scripts y `index.html` no contiene ningún `<script>` inline — verificado),
`style-src 'self' 'unsafe-inline' fonts.googleapis.com`,
`font-src fonts.gstatic.com`, `img-src 'self' data: blob: https:`,
`object-src 'none'`, `frame-ancestors 'self'`, `worker-src 'self' blob:`,
`upgrade-insecure-requests`.

`connect-src` lista **exactamente los origins que la app contacta en runtime**,
verificados en el código y no supuestos:

| Origin | Uso | Fuente en el repo |
|---|---|---|
| `'self'` | Hosting / assets | — |
| `*.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` | Firebase Auth + FCM push | `src/services/firebase/` |
| `*.firebaseio.com`, `*.firebaseapp.com` | Firestore | `src/services/firebase/sync.ts` |
| `cdn.jsdelivr.net` | GIFs de ejercicios (ExerciseGymGifsDB) | `src/services/exerciseGym.ts:8` |
| `*.workers.dev` | Proxy Groq + proxy WGER | `src/services/ai/groqConfig.ts`, `src/services/integrations/wger/wgerServerAuth.ts` |
| `wger.de` | **Lectura pública WGER directa desde el navegador** | `src/services/integrations/wger/wgerClient.ts:41` y clientes `stats/`, `nutrition/`, `training/`, `measurements/` |
| `nutricion-api-arg.fly.dev` | API Codulia (nutrición) | `src/services/codulia.ts:12` |

> **Trampa evitada:** `wger.de` y `nutricion-api-arg.fly.dev` son fáciles de
> olvidar porque la mayor parte del tráfico WGER pasa por el Worker, pero los
> clientes de **lectura pública** (`wgerClient`, `stats`, `nutrition`,
> `training`, `measurements`) hacen `fetch` directo a `wger.de` desde el
> navegador. Sin esas dos entradas en `connect-src` el CSP rompería en silencio
> la sincronización WGER y la búsqueda nutricional en el entorno desplegado,
> sin que ninguna alerta de compilación lo indique. Añadir un origin a
> `connect-src` cuesta una línea; quitar uno que la app usa es una rotura
> silenciosa en producción.

**Worker en `connect-src`:** se incluye `https://*.workers.dev` porque es el
host real del proxy mientras no exista dominio propio. Si en producción el
Worker pasa a un dominio custom, hay que **añadir ese dominio a la CSP** o el
Coach remoto fallará en producción (el fallback local seguiría funcionando).
Es un cambio de una línea, deliberadamente no hardcodeado a un dominio
inexistente.

`Cache-Control`: `index.html`, `sw.js` y `workbox-*.js` → `no-store`
(necesario para que el SW controle la actualización PWA);
`/assets/**` → `immutable` de 1 año.

---

## 7. Rollback

| Artefacto | Procedimiento |
|---|---|
| Frontend | `git revert <commit>` + redeploy con `npm run deploy:hosting:<env>` |
| Hosting | `firebase hosting:rollback --project <ID> [--site <SITE>]` (últimas releases) |
| Worker | `npx wrangler rollback -c wrangler.<env>.toml` |
| Rules | `firebase deploy --only firestore:rules --project <ID>` |

**No probado contra entornos reales.** Sólo disponible como procedimiento.

---

## 8. Lo que falta para STAGING-READY

Todo lo siguiente requiere credenciales/proyectos del owner (§30):

1. `firebase login`
2. Crear o seleccionar **dos** proyectos Firebase (staging y production) y
   copiar `.firebaserc.example` → `.firebaserc` con los ids reales.
3. `npm run worker:kv:staging` → pegar el id en `wrangler.staging.toml`
4. `npm run worker:secret:staging` → `GROQ_API_KEY` de staging
5. Poner el origin real de staging en `CORS_ORIGIN` de `wrangler.staging.toml`
6. `npm run worker:deploy:staging`
7. `FIREBASE_PROJECT_ID=<STAGING> npm run deploy:hosting:staging`
8. Crear USER A y USER B en el proyecto de staging
9. Ejecutar los smoke tests y las pruebas reales de Auth/Firestore/CORS/Groq

Sin estos pasos, `STAGING-READY = FALSE` aunque el código esté completo.

### Guard de CSP en CI

`src/config/hostingHeaders.test.ts` (13 tests) mantiene la CSP de
`firebase.json` coherente con los origins que la app usa en runtime, y
comprueba en los dos sentidos:

- todo origin en runtime está en `connect-src`;
- todo origin declarado en código sigue existiendo (impide acumular hosts
  muertos);
- la CSP está en `/index.html` y no en `**`;
- sin wildcard en `connect-src`, `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'self'`, `upgrade-insecure-requests`;
- `script-src` sin `unsafe-inline`, y `index.html` sin `<script>` inline;
- headers de Hosting: nosniff, referrer-policy, HSTS, X-Frame-Options;
- `index.html`, `sw.js` y `workbox-*.js` sin caché (necesario para el update
  de la PWA) y `/assets/**` inmutable.

Comprobado que **falla** si se quita un origin en uso: al eliminar `wger.de`
de `connect-src` el test reporta el origin ausente. Sin este guard, esa rotura
sólo aparecería en el entorno desplegado.

> Añadir un cliente externo nuevo obliga a tocar dos sitios: la CSP y la lista
> `RUNTIME_ORIGINS` del test. Eso es intencionado.

### Qué NO queda pendiente en código

Todo lo que esta sección lista es del propietario porque necesita sus cuentas,
sus project ids o sus credenciales. En código **no** queda pendiente:

- Worker: CORS fail-closed, métodos, Content-Type, body limit, validación de
  payload, timeout, sanitización de errores y rate limiting en tres capas con
  Durable Object — implementados y con 73 tests (`worker/src`).
- Separación staging/production para Firebase y Cloudflare, con guard de deploy
  fail-closed verificado en 4 escenarios.
- CSP y headers de Hosting, con guard de CI contra regresiones.
- `.env*` ignorados; `.env.example` documenta ambos entornos.
- Rollback documentado por artefacto (§7).

---

## 9. Claves históricas

| Credencial | Estado verificado | Efecto |
|---|---|---|
| Groq (clave histórica de desarrollo) | **NOT REVOKED** (no verificable sin acceso a la consola) | bloquea producción |
| CalorieNinjas | **NOT REVOKED** (ídem) | bloquea producción |

Debe revocarlas/rotarlas el owner en las consolas de los proveedores. No se
afirma revocación sin comprobarla allí.

---

## 10. Validación live ejecutada

Todo lo de esta sección se ejecutó **contra el Worker desplegado**, no contra
código ni tests unitarios. Reproducible con:

```bash
npm run staging:worker:live-check -- <WORKER_URL> <ALLOWED_ORIGIN>
```

Resultado: **28 PASS / 0 FAIL / 4 NOT VALIDATED**.

| Grupo | Comprobado | Resultado |
|---|---|---|
| CORS | OPTIONS con origin permitido → 204 + ACAO correcto | PASS |
| CORS | OPTIONS con origin no permitido → 403 | PASS |
| CORS | POST con origin no permitido → 403 | PASS |
| CORS | el 403 no filtra información interna | PASS |
| Métodos | GET / PUT / PATCH / DELETE → 405 | PASS |
| Métodos | 405 incluye `Allow: POST, OPTIONS` | PASS |
| Content-Type | sin header y `text/plain` → 415 | PASS |
| Content-Type | `application/json; charset=utf-8` aceptado | PASS |
| Body limit | > 64 KB → 413 | PASS |
| Payload | campo inesperado (`api_key`) → 422 | PASS |
| Payload | rol no permitido → 422 | PASS |
| Payload | > 40 mensajes → 422 | PASS |
| Payload | array vacío → 422 | PASS |
| Payload | `model`/`temperature` del cliente no rompen el proxy | PASS |
| Secret | sin `GROQ_API_KEY` → 503 fail-closed, sin revelar la clave | PASS |
| Rate limit | se alcanza el límite → 429 | PASS |
| Rate limit | `Retry-After` + `X-RateLimit-*` presentes | PASS |
| Rate limit | **`X-RateLimit-Mode: durable-object`** | PASS |

Ese último punto es el importante: confirma que la capa fuerte del rate limit
(Durable Object) está **realmente activa en el edge**, no sólo compilada. La
capa degradada en memoria sigue existiendo para desarrollo, pero en staging la
respuesta demuestra que no es la que está respondiendo.

### Lo que NO se pudo validar

| Comprobación | Motivo |
|---|---|
| Respuesta 200 con contenido del modelo | falta `GROQ_API_KEY` |
| Timeout upstream → 504 | falta `GROQ_API_KEY` |
| Error upstream → 502 sanitizado | falta `GROQ_API_KEY` |
| `frontend → Worker → Groq → frontend` | falta `GROQ_API_KEY` y el frontend en staging |

---

## 11. Corrección de la CSP: de `/index.html` a `**`

La CSP estaba declarada sólo en el bloque `source: "/index.html"`. Eso es un
riesgo real: Firebase Hosting asocia las cabeceras a la **ruta pedida**, y la
carga inicial de la app se pide como `/`, no como `/index.html`. Con la CSP
sólo en `/index.html`, la visita inicial a `https://<proyecto>.web.app/`
podía servirse **sin CSP**, y en ese caso toda la allowlist de `connect-src`
—incluida la corrección de WGER y Codulia— no se aplicaba.

Movida al bloque `**`. El navegador ignora la CSP en respuestas que no son
documentos, así que no afecta a los assets, y a cambio la política queda
garantizada en cualquier forma de entrada.

Verificado: una petición a `/` ahora recibe la CSP. El test
`src/config/hostingHeaders.test.ts` lo fija para que no vuelva a pasar.

---

## 12. Baseline de performance (medido, no citado)

Medido sobre `dist/` recién construido:

| Métrica | Valor |
|---|---|
| Initial JS (declarado en `index.html`) | **169.2 KB gzip** |
| Objetivo T032 | < 150 KB gzip |
| Total JS | 59 chunks, 2130.1 KB raw / 582.7 KB gzip |
| Mayor chunk | `vendor-firebase` 634.4 KB raw / **140.0 KB gzip** (no está en el set inicial) |
| Lighthouse Performance | 72 (sin remedir) |
| PWA | 100 |

El set inicial lo componen `index` (74.0), `vendor-react` (44.7),
`vendor-state` (31.6), `vendor-router` (13.5), `vendor-icons` (4.8) y
`vendor-utils` (0.6).

**T032 NO se cumple: 169.2 KB gzip > 150 KB.** Se registra como
`DOCUMENTED PERFORMANCE DEBT`. No se abre una refactorización global por esto:
`vendor-firebase` ya está fuera del set inicial, y mover Dexie/Auth fuera del
arranque es una decisión de producto con riesgo funcional, no un ajuste de
build. Detalle en `docs/PENDIENTES_OTRO_AGENTE.md` (P1).

---

## 13. Automatización añadida

| Script | Para qué |
|---|---|
| `scripts/staging-preflight.mjs` | 27 comprobaciones locales: archivos, CSP, rewrites, reglas, separación de ambientes, placeholders, secretos, `.env*`, CLI, datos ficticios. Salida 0/1/2. |
| `scripts/worker-staging-preflight.mjs` | Config del Worker, CLI y sesión de Cloudflare, y presencia del secret (nunca su valor). |
| `scripts/worker-live-check.mjs` | Matriz de seguridad contra el Worker **desplegado**. |
| `scripts/firestore-isolation-e2e.mjs` | Aislamiento A/B contra Firestore real usando sólo la config web pública. |
| `scripts/hosting-route-check.mjs` | Rutas, fallback SPA, assets y cabeceras contra Hosting real. |

```bash
npm run staging:preflight
npm run worker:staging:preflight
npm run staging:worker:live-check -- <WORKER_URL> <ALLOWED_ORIGIN>
npm run staging:firestore:e2e
npm run staging:hosting:check -- <HOSTING_URL>
```

Todos usan el mismo contrato de salida: **0 = PASS, 1 = FAIL (repo),
2 = BLOCKED (owner)**. Ninguno imprime secretos.

Nota sobre `hosting-route-check.mjs`: las rutas se **leen de `src/App.tsx`**,
no de una lista escrita a mano. `/inicio` y `/historial` parecen rutas pero no
lo son — Inicio vive en `/` y no existe ruta de historial — y una lista fija
habría reportado 404 falsos sobre una app que funciona.

### Guards de deploy reforzados

`scripts/deploy-hosting.mjs` ahora exige, además de `FIREBASE_PROJECT_ID`:

- `assertStagingProject()` — un deploy de staging debe coincidir con
  `FIREBASE_STAGING_PROJECT_ID`. Sin esto, un `FIREBASE_PROJECT_ID` equivocado
  desplegaría staging sobre producción sin que nada lo detenga.
- `assertProductionAuthorization()` — producción exige
  `ALTHEA_ALLOW_PRODUCTION_DEPLOY=1`.

Verificado en 5 escenarios: sin ambiente, sin `PROJECT_ID`, placeholder,
staging→producción y producción sin autorización. Los cinco abortan.
