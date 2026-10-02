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

Dos capas, con honestidad explícita:

| Capa | Mecanismo | Garantía |
|---|---|---|
| Distribuida | KV namespace (binding `RATE_LIMIT`) | Best-effort. KV es eventualmente consistente ⇒ **no** es un contador exacto. |
| Fallback | In-memory por isolate | **NO** es boundary de seguridad en un edge distribuido. |

- Groq: **20 req / 60 s** por IP (`CF-Connecting-IP`).
- WGER: **60 req / 60 s** por IP.
- Al exceder → **429** + `Retry-After`, `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- `X-RateLimit-Mode: kv | memory-degraded` — la respuesta **declara** con qué
  capa se respondió, para no presentar el fallback como protección real.
- Si KV falla → fail-**open** (el Coach no se cae por un fallo de rate limit).

**Limitación que no se debe maquillar:** para un techo estricto hace falta
una Durable Object (contador serializado) o una WAF Rate Limiting Rule de
Cloudflare. El código y los wrangler configs dejan la KV preparada, pero
**mientras no se despliegue con el binding, el rate limit real es el
degradado.** No se afirma protección robusta sin ese deploy.

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

---

## 9. Claves históricas

| Credencial | Estado verificado | Efecto |
|---|---|---|
| Groq (clave histórica de desarrollo) | **NOT REVOKED** (no verificable sin acceso a la consola) | bloquea producción |
| CalorieNinjas | **NOT REVOKED** (ídem) | bloquea producción |

Debe revocarlas/rotarlas el owner en las consolas de los proveedores. No se
afirma revocación sin comprobarla allí.
