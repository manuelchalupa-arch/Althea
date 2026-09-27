# Guía de release: credenciales y proxy de Groq

Fecha de auditoría: 2026-09-24 (Fase 1L / cierre técnico).

## Estado actual (verificado sobre el bundle de producción)

- El bundle `dist/` embebe la clave real de Groq (`gsk_…`, 56 caracteres) en 5 ocurrencias
  dentro de los chunks minificados, junto con `api.groq.com` (llamada directa).
- El repositorio está limpio: `.env.local` y `dist/` están en `.gitignore` (verificado).
  El riesgo no es el código fuente: es **cualquier build generado desde un entorno que
  defina `VITE_GROQ_API_KEY` o `VITE_NINJA_API_KEY`**.

## Regla de oro

Vite reemplaza en tiempo de build toda referencia a `import.meta.env.VITE_*` por el valor
literal dentro del bundle. **No importa si el código solo lo usa condicionalmente**: el
valor viaja igual en el JavaScript publicado. Por lo tanto:

> Nunca definir secretos en variables `VITE_*` para builds de producción.

## Matriz de variables

| Variable | ¿Dónde debe vivir? | ¿Secreto? | Estado actual |
|---|---|---|---|
| `VITE_GROQ_PROXY_URL` | Frontend (`.env` de build) | No (es una URL pública de un worker) | Ausente: el código cae a llamada directa |
| `VITE_GROQ_API_KEY` | **Solo en el servidor/proxy (secret)** | **Sí** | **Corregido en FASE 1L-S: el código ya no la lee → no entra al bundle** |
| `VITE_NINJA_API_KEY` | **Solo en el servidor/proxy (secret)** | **Sí** | Definida en `.env.local` → embebida en el bundle |
| `VITE_FIREBASE_API_KEY` | Frontend (obligatoria) | No (clave pública de cliente por diseño de Firebase) | OK |
| `VITE_FIREBASE_AUTH_DOMAIN` / `PROJECT_ID` / `STORAGE_BUCKET` / `MESSAGING_SENDER_ID` / `APP_ID` | Frontend | No (config pública de cliente) | OK |
| `VITE_FIREBASE_VAPID_KEY` | Frontend | No (clave pública de Web Push) | OK |

Consumidores en el código:

- `src/services/ai/groqConfig.ts:2` lee únicamente `VITE_GROQ_PROXY_URL` (sin `Authorization`,
  la clave la agrega el proxy).
- `src/services/ai/chatService.ts:43` y `src/services/ai/routineBuilderIA.ts:42` consideran
  "disponible" si existe proxy O clave directa.
- `src/services/nutrition/ninjaService.ts:12` usa `VITE_NINJA_API_KEY` como clave de respaldo
  cuando el usuario no aportó la suya (BYOK, `localStorage[ninja_api_key]`).

## Flujo del proxy (implementado en `worker/`)

1. El frontend configura únicamente `VITE_GROQ_PROXY_URL=https://…workers.dev`.
2. El worker (`worker/src/index.js` + `worker/wrangler.toml`) recibe las llamadas, agrega
   `Authorization: Bearer <GROQ_API_KEY>` desde su secret
   (`npx wrangler secret put GROQ_API_KEY`) y reenvía a
   `https://api.groq.com/openai/v1/chat/completions` (soporta streaming).
3. `groqConfig.getGroqHeaders()` ya no tiene ninguna clave: sin proxy no hay llamada
   directa a Groq y Coach usa el fallback local. El bundle queda sin secretos.

## Checklist para publicar

1. **Rotar la clave Groq actual**: la versión de hoy quedó expuesta en `dist/` (girar en
   consola de Groq y reemplazar el secret en el proxy + `.env.local` de desarrollo).
2. Desplegar el worker ya implementado (`worker/`): `cd worker && npx wrangler deploy`
   y poner `GROQ_API_KEY` como secret (`npx wrangler secret put GROQ_API_KEY`).
3. En el build de producción, el entorno **no debe definir** `VITE_GROQ_API_KEY` ni
   `VITE_NINJA_API_KEY`. Solo `VITE_GROQ_PROXY_URL` + `VITE_FIREBASE_*`.
4. Verificar el bundle antes de publicar (automatizado por FASE 1L-S):

```bash
npm run check:release   # 0 secretos Groq en dist/, sale con código 1 si hay hits
```
```powershell
# 0 hits esperados:
Get-ChildItem -Path "dist" -Recurse -File | Select-String -Pattern "gsk_" -SimpleMatch | Measure-Object
Get-ChildItem -Path "dist" -Recurse -File | Select-String -Pattern "VITE_GROQ_API_KEY" | Measure-Object

# 1 hit esperado (resultado del reemplazo en tiempo de build de VITE_GROQ_PROXY_URL):
Get-ChildItem -Path "dist" -Recurse -File | Select-String -Pattern "workers\.dev" -SimpleMatch | Measure-Object
```

5. Navegar la app en producción y validar que el chat y la generación de rutinas funcionen
   vía proxy (network → llamadas a `workers.dev`, sin llamadas a `api.groq.com`).

## Notas

- Desarrollo local: sin proxy configurado, Coach usa el fallback local determinista. Para
  probar IA real en dev, configurá `VITE_GROQ_PROXY_URL` apuntando al worker desplegado.
- El BYOK de nutrición (`VITE_NINJA_API_KEY` de respaldo) es aceptable si se omite la
  variable en producción: quien quiera búsqueda de alimentos aporta su propia clave en
  runtime (se guarda en `localStorage`, borrado por la desinstalación de cuenta).
- No se rotaron ni modificaron credenciales en esta auditoría (requiere autorización).