# Implementation Plan: IA centralizada y gratuita con Cloudflare Workers AI

**Feature Branch**: `006-ia-centralizada-cloudflare`

**Created**: 2026-11-26

## Technical Context

- **Frontend**: React 18 + TS + Vite. Dos únicos llamadores al LLM: `chatService.ts` (SSE) y `routineBuilderIA.ts` (JSON).
- **Backend**: Cloudflare Worker existente (`worker/src/index.js`) con CORS fail-closed, validación de esquema, rate limiter DO→KV→memoria y deploys Wrangler por entorno.
- **Auth**: Firebase Auth; `currentUser()` y `user.getIdToken()` ya disponibles.
- **Proveedor**: Cloudflare Workers AI binding `AI`, modelo `@cf/google/gemma-4-26b-a4b-it`.
- **Cuota verificada (docs oficiales, 2026-11-26)**: 10.000 neuronas/día gratis, reset 00:00 UTC; text generation 300 req/min por cuenta; Gemma 4 = 9.091 neuronas/M input + 27.273 neuronas/M output; no requiere plan de pago.
- **Tests**: Vitest; mocks de `fetch` en el Worker y de `import.meta.env` en frontend.

## Plan de implementación

1. **Worker — proveedor**
   - Sustituir el fetch a Groq por `env.AI.run(MODEL, input)`.
   - Modelo, `enable_thinking:false`, `store:false`, `max_completion_tokens` y `response_format` fijados por servidor según `task`.
   - `task=chat` → `stream:true`, 512 tokens, `response_format:{type:'text'}`.
   - `task=routine` → `stream:false`, 8192 tokens, `response_format:{type:'json_object'}`.
   - Transmitir SSE tal cual para chat; devolver `Response.json` para routine. Nunca reenviar el body de errores del proveedor.

2. **Worker — autenticación**
   - Nuevo `worker/src/firebase-auth.js`: verifica JWT RS256 con JWKS de Google, valida `iss`, `aud` (`FIREBASE_PROJECT_ID`), `exp`, `sub`; cachea claves por 1 h en memoria; devuelve `uid`.
   - Header `Authorization: Bearer <idToken>` obligatorio. Sin/token inválido → 401 `unauthorized`.
   - CORS: añadir `Authorization` a `Access-Control-Allow-Headers`.

3. **Worker — cuota y concurrencia**
   - Nuevo `worker/src/quota.js`: estimación conservadora de neuronas (caracteres/4 como tokens de entrada + `max_completion_tokens` como salida), presupuesto diario en KV con clave UTC (`ai:neurons:YYYY-MM-DD`), default 9000, fail-open si KV falla.
   - Límites: 20 req/min por `uid` (DO/KV/memoria existente), 240 req/min global, concurrencia máxima por isolate (default 6).
   - Mapear 429 del proveedor → 429 `quota_exhausted` con `Retry-After`; 503 sin binding; 504 por timeout; 502 sanitizado.
   - Logs: solo códigos/status; nunca prompts ni respuestas.

4. **Frontend — transporte único**
   - `groqConfig.ts`: conservar la URL del proxy (misma variable pública) y añadir helper de headers con el ID token de Firebase (`aiAuth.ts`), sin claves de proveedor.
   - `chatService.ts`: petición con `task:'chat'`; manejo de 401/429 con mensajes claros y prefijo de error de límite para que Coach no responda con IA local.
   - `routineBuilderIA.ts`: petición con `task:'routine'`, sin `stream`, con token; 401/429 se propagan al UI; otros errores mantienen el fallback determinista actual.
   - `Coach.tsx`: en errores de límite/autenticación mostrar error + reintento en vez de respuesta local.
   - `groqUsage.ts`: ajustar textos para que no mencionen Groq (la lógica local se mantiene como guardia de UX).

5. **Configuración**
   - Wrangler staging/production: binding `[ai]`, `FIREBASE_PROJECT_ID`, timeouts y límites; quitar vars/secret de Groq de la config (sin borrar el Worker desplegado hasta migrar).
   - `package.json`: sustituir los comandos `worker:secret:*` de Groq por documentación de AI binding; el secreto de Groq ya no se usa.
   - Documentar la configuración externa pendiente en la entrega.

6. **Pruebas**
   - Reescribir `worker/src/index.test.ts` para el nuevo contrato (auth, task, proveedor, cuota, errores).
   - Añadir tests de `firebase-auth.js` y `quota.js`.
   - Añadir tests frontend de headers con token y de errores de cuota.
   - Ejecutar `npm test`, `npm run lint`, `npm run build` y `npx vitest run worker/src`.

## Decisiones (ponytail)

- Se reutiliza el Worker, el rate limiter y el validador existentes; no se crea un segundo servicio.
- No se añade AI Gateway ni facturación. `response_format:{type:'json_object'}` + la validación `normalizeRoutine` existente bastan; no se duplica un esquema JSON en el servidor.
- El presupuesto diario se estima por reserva conservadora: evita llamadas extra para medir tokens y mantiene el consumo por debajo del límite real.
- La concurrencia se controla por isolate; el techo global real lo pone el límite de 240 req/min con Durable Object.
