# Tasks: IA centralizada y gratuita con Cloudflare Workers AI

**Feature Branch**: `006-ia-centralizada-cloudflare`

## Fase 1 — Worker

- [ ] T001 Crear `worker/src/firebase-auth.js` con verificación JWT RS256 y cache de JWKS.
- [ ] T002 Crear `worker/src/quota.js` con reserva diaria de neuronas en KV.
- [ ] T003 Modificar `worker/src/index.js`: auth, `task`, binding AI, SSE/JSON, cuota, concurrencia y errores.
- [ ] T004 Actualizar `worker/wrangler.staging.toml` y `worker/wrangler.production.toml` con binding AI, `FIREBASE_PROJECT_ID` y límites.
- [ ] T005 Actualizar `worker/src/index.d.ts`.

## Fase 2 — Frontend

- [ ] T006 Crear `src/services/ai/aiAuth.ts` con el token de Firebase del usuario.
- [ ] T007 Adaptar `src/services/ai/groqConfig.ts` y `groqUsage.ts` al nuevo contrato (sin claves).
- [ ] T008 Adaptar `src/services/ai/chatService.ts` (`task:'chat'`, errores de límite).
- [ ] T009 Adaptar `src/services/ai/routineBuilderIA.ts` (`task:'routine'`, errores de límite).
- [ ] T010 Adaptar `src/pages/Coach.tsx` para no simular IA ante límite/cuota.

## Fase 3 — Verificación

- [ ] T011 Reescribir `worker/src/index.test.ts` y añadir tests de auth/cuota.
- [ ] T012 Añadir tests frontend de token y errores de cuota.
- [ ] T013 Ejecutar `npm test`, `npm run lint`, `npm run build`.
- [ ] T014 Entregar resumen con configuración externa pendiente y límites verificados.
