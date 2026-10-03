# RELEASE — Backup y rollback

Procedimiento para desplegar Althea y volver atrás si algo falla.

**Este documento no contiene secretos.** No hay `GROQ_API_KEY`, ni tokens de
Firebase ni de Cloudflare, ni contraseñas. Los secretos se inyectan por
`wrangler secret put` y por variables de entorno; nunca se registran aquí.

---

## 1. Artefactos que identifican una release

Estos cinco datos juntos identifican qué está desplegado. Registrarlos ANTES
de cualquier deploy es lo que hace posible volver atrás.

| Artefacto | Cómo se obtiene | Ejemplo |
|---|---|---|
| Commit | `git rev-parse HEAD` | `40cd9aa...` |
| Proyecto Firebase | variable `FIREBASE_*_PROJECT_ID` | `<STAGING_PROJECT_ID>` |
| Release de Hosting | `firebase hosting:releases:list --project <ID>` | `sites/<SITE>/releases/<RELEASE_ID>` |
| Versión del Worker | `npx wrangler deployments list --config worker/wrangler.<env>.toml` | version id |
| Config pública | `VITE_FIREBASE_*` + `VITE_GROQ_PROXY_URL` | (sólo URLs/ids públicos) |

Valores **ya registrados** para el Worker de staging:

```
Worker     althea-proxy-staging
URL        https://althea-proxy-staging.manuelchalupa.workers.dev
Version    f38181b8-0a9e-4f2a-9231-0dbd853d8ed6
KV         0f643e89b72743f197bd851c4dd9146e
```

Valores de Hosting: pendientes del primer deploy de staging.

---

## 2. Registro antes de desplegar

```bash
# 1. Identidad del código
git rev-parse HEAD

# 2. Estado limpio (no desplegar con cambios sin commitear)
git status --short

# 3. Gates
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run check:release

# 4. Validadores de staging
node scripts/staging/validate-staging.mjs
node scripts/staging/pwa-check.mjs

# 5. Releases de Hosting actuales (para poder volver)
npx firebase hosting:releases:list --project <PROJECT_ID>

# 6. Versiones del Worker actuales
npx wrangler deployments list --config worker/wrangler.<env>.toml
```

Guardar esa salida en el ticket/tarea del release. Sin ella, el rollback queda
a ciegas.

---

## 3. Deploy de staging

El deploy va siempre por el guard fail-closed, que exige proyecto explícito y
comprueba que el destino sea realmente el de staging.

```bash
# Worker
npm run worker:deploy:staging

# Hosting
set FIREBASE_PROJECT_ID=<STAGING_PROJECT_ID>
set FIREBASE_STAGING_PROJECT_ID=<STAGING_PROJECT_ID>
npm run deploy:hosting:staging
```

Si `FIREBASE_PROJECT_ID` ≠ `FIREBASE_STAGING_PROJECT_ID`, el guard aborta. Es
deliberado: evita desplegar staging sobre producción.

---

## 4. Detección de fallo

Qué mirar tras el deploy, en este orden:

```bash
# el sitio responde y trae la CSP
STAGING_URL=https://<STAGING_PROJECT_ID>.web.app \
STAGING_WORKER_URL=https://althea-proxy-staging.<user>.workers.dev \
STAGING_ALLOWED_ORIGIN=https://<STAGING_PROJECT_ID>.web.app \
node scripts/staging/http-smoke.mjs

# el Worker mantiene su endurecimiento
node scripts/worker-live-check.mjs \
  https://althea-proxy-staging.<user>.workers.dev \
  https://<STAGING_PROJECT_ID>.web.app
```

Criterio de fallo: cualquier `FAIL` en esos dos scripts, o una UX rota que sólo
se ve navigating la app (eso es smoke test con navegador).

---

## 5. Rollback

### 5.1 Frontend / Hosting

```bash
# Listar releases
npx firebase hosting:releases:list --project <PROJECT_ID> --limit 5

# Volver a una release concreta (requiere el release id)
npx firebase hosting:rollback --project <PROJECT_ID> --to-release <RELEASE_ID>
```

Alternativa si no se conserva el `RELEASE_ID`: clonar una release a otra activa.

```bash
npx firebase hosting:clone \
  SOURCE_SITE_ID:RELEASE_ID   \
  TARGET_SITE_ID:latest
```

**Nota sobre la PWA:** `index.html` y `sw.js` se sirven con `no-store`, así que
el rollback de Hosting **sí** llega a los clientes que ya tienen una versión
cacheada; el service worker vuelve a tomar el `index.html` nuevo en la siguiente
comprobación. Aun así, tras un rollback hay que recargar una vez con fuerza para
descartar el estado en memoria.

### 5.2 Worker

```bash
# Ver versiones
npx wrangler deployments list --config worker/wrangler.staging.toml

# Volver a una versión anterior
npx wrangler rollback --config worker/wrangler.staging.toml [VERSION_ID]
```

Si no se indica `VERSION_ID`, `wrangler rollback` vuelve al deploy anterior.

### 5.3 Reglas de Firestore

Las reglas se despliegan desde el archivo versionado del repo
(`firebase.json` → `firestore.rules`). Para volver atrás:

```bash
git revert <commit-cambio-de-reglas>
npx firebase deploy --only firestore:rules --project <PROJECT_ID>
```

**Nunca** editar reglas a mano en la consola: si divergen del repo, la fuente
de verdad deja de ser el repo y el rollback se vuelve imposible.

### 5.4 Variables de entorno

Las variables de build (`VITE_*`) entran en el bundle. Cambiarlas implica
rebuild + redeploy de Hosting; no hay "rollback" parcial. Para volver al valor
anterior, restaurar el valor anterior de la variable, reconstruir y redesplegar.

---

## 6. Verificación post-rollback

```bash
node scripts/staging/validate-staging.mjs
node scripts/staging/pwa-check.mjs
STAGING_URL=... node scripts/staging/http-smoke.mjs
```

Y comprobar en el navegador que:
- la app carga y navega;
- el Coach responde (o cae al fallback de forma esperada);
- no hay mezcla de assets de dos versiones.

---

## 7. Lo que NO tiene rollback

- **Secretos.** Si `GROQ_API_KEY` se filtró, la solución es **rotarla**, no
  volver atrás. Un rollback no revoca una clave expuesta.
- **Datos de Firestore.** Un rollback de Hosting no deshace escrituras. Si hay
  que restaurar datos, es una operación manual sobre el proyecto.
- **Claves de terceros revocadas.** Revocar una clave histórica es irreversible
  en el sentido de que "volver atrás" significa crear una clave nueva.

Por eso `docs/RELEASE_MONITORING.md` y el checklist de revocación de claves
históricas son parte del release, no opcionales.
