# IA centralizada (Cloudflare Workers AI)

## Proveedor y modelo

- Proveedor: **Cloudflare Workers AI**, llamado solo desde el Worker mediante el binding `AI`.
- Modelo: **`@cf/google/gemma-4-26b-a4b-it`** (fijado en servidor; el cliente no puede cambiarlo).
- Sin AI Gateway de pago, sin facturación automática y sin claves personales.

## Funciones conectadas

| Función | Archivo | Formato |
|---|---|---|
| Coach conversacional | `src/services/ai/chatService.ts` | SSE en streaming |
| Generador de rutinas | `src/services/ai/routineBuilderIA.ts` | JSON estructurado, validado contra la biblioteca de ejercicios |

Ambas usan el mismo transporte (`src/services/ai/groqConfig.ts` + `src/services/ai/aiAuth.ts`). Las recomendaciones de `aiService.ts` son determinísticas y no consumen el proveedor.

## Cuota gratuita verificada (documentación oficial, 2026-11)

- Plan Workers Free: **10.000 neuronas/día**, reset a las **00:00 UTC**.
- Text generation: **300 peticiones/minuto por cuenta**.
- Gemma 4 26B A4B: **9.091 neuronas / M tokens de entrada** y **27.273 / M de salida**; no está en la lista de modelos que exigen plan de pago.
- El Worker reserves una estimación conservadora antes de cada llamada, con presupuesto diario por defecto de **9.000 neuronas** (margen del 10 %).

## Límites aplicados en el Worker

- 20 peticiones/minuto por `uid` verificado y 240/minuto globales, en un **Durable Object** (contador serializado: vale entre isolates).
- Presupuesto diario de neuronas reservado de forma **atómica** en el mismo Durable Object (`budget:AAAA-MM-DD`, UTC); KV queda solo como degradación best-effort.
- 6 inferencias simultáneas **globales**, con slots que expiran por TTL si una petición muere sin liberarlos.
- `enable_thinking:false` y `store:false` para no gastar tokens en razonamiento ni almacenar salidas.
- 401 sin sesión, 429 con `Retry-After` al agotar límites, 503 sin binding, 504 por timeout, 502 sanitizado.
- Logs: solo códigos de estado; nunca prompts, respuestas ni tokens.

## Configuración externa pendiente (la aplica el propietario al desplegar)

1. Habilitar Workers AI en la cuenta de Cloudflare (plan Free) y desplegar:
   - `npm run worker:deploy:staging`
   - `npm run worker:deploy:production`
2. Verificar en los TOML el binding `[ai] binding = "AI"` y `FIREBASE_PROJECT_ID` (`althea-stg` / `althea-4b1d0`).
3. La URL pública del proxy se mantiene en `VITE_GROQ_PROXY_URL` (o el default embebido). No hay secretos que cargar.
4. Opcional: ajustar `AI_DAILY_NEURON_BUDGET`, `AI_MAX_CONCURRENCY` y `AI_TIMEOUT_MS` en los TOML.
5. El antiguo secret `GROQ_API_KEY` ya no se usa: puede revocarse en la consola de Groq.

## Pruebas

- `npx vitest run worker/src` — autenticación JWT, proveedor, cuota, concurrencia y sanitización.
- `npm test` — suite completa (incluye el generador de rutinas y el Coach).
- `node scripts/worker-live-check.mjs <URL> <ORIGIN>` con `ALTHEA_AI_ID_TOKEN=<idToken>` para validar el Worker desplegado.
