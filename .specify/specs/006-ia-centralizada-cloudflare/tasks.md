# Tasks: IA centralizada y gratuita con Cloudflare Workers AI

**Feature Branch**: `006-ia-centralizada-cloudflare`

## Fase 1 — Worker

- [x] T001 Crear `worker/src/firebase-auth.js` con verificación JWT RS256 y cache de JWKS.
- [x] T002 Crear `worker/src/quota.js` con reserva diaria de neuronas en KV.
- [x] T003 Modificar `worker/src/index.js`: auth, `task`, binding AI, SSE/JSON, cuota, concurrencia y errores.
- [x] T004 Actualizar `worker/wrangler.staging.toml` y `worker/wrangler.production.toml` con binding AI, `FIREBASE_PROJECT_ID` y límites.
- [x] T005 Actualizar `worker/src/index.d.ts` y añadir declaraciones de los módulos nuevos.

## Fase 2 — Frontend

- [x] T006 Crear `src/services/ai/aiAuth.ts` con el token de Firebase del usuario.
- [x] T007 Verificar `groqConfig.ts` y `groqUsage.ts`: URL pública del proxy y guardia local de UX, sin credenciales. Se mantienen los nombres por compatibilidad.
- [x] T008 Adaptar `src/services/ai/chatService.ts` (`task:'chat'`, errores de límite).
- [x] T009 Adaptar `src/services/ai/routineBuilderIA.ts` (`task:'routine'`, errores de límite).
- [x] T010 Adaptar `src/pages/Coach.tsx` para no simular IA ante límite/cuota.

## Fase 3 — Verificación

- [x] T011 Reescribir `worker/src/index.test.ts` y añadir tests de auth/cuota.
- [x] T012 Añadir tests frontend de token y errores de cuota.
- [x] T013 Ejecutar tests del Worker y de IA (55 + 19 pasan). Suite completa: 1642 pasan, 2 fallos preexistentes en `Entrenar.dolor` (fuera de alcance).
- [x] T014 Entregar resumen con configuración externa pendiente y límites verificados.
