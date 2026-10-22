# Tasks: 005-panel-feedback-creador

## 1. Datos y reglas

- [x] 1.1 `firestore.rules`: `isFeedbackAdmin()` acepta `request.auth.token.email == 'manuelchalu@gmail.com'` (primero, cortocircuito) OR UID en `admins/uids`; actualizar comentarios.
- [x] 1.2 `feedbackTypes.ts`: `FeedbackThread` + `ownerName?: string`, `ownerEmail?: string`.

## 2. Servicio

- [x] 2.1 `feedbackService.ts`: `fetchIsFeedbackAdmin` pasa a sonda `getDocs` sin filtro + `limit(1)`; cache 60 s solo en resultados definitivos.
- [x] 2.2 `buildThread`/`createThread`: denormaliza `ownerName`/`ownerEmail` (perfil Dexie → Auth).
- [x] 2.3 Nuevo `getThread(threadId)`: getDoc remoto, fallback local, `permission` tipado.

## 3. UI admin

- [x] 3.1 `FeedbackEntry.tsx`: gate loader → `AdminFeedback` si `actor.isAdmin`, si no `Feedback`; prop `adminOnly`.
- [x] 3.2 `App.tsx`: rutas `/feedback`, `/admin/feedback` y `/feedback/thread/:id`.
- [x] 3.3 `AdminFeedback.tsx`: estados carga / vacío / no autorizado / error de permiso; tarjeta con identidad del usuario, `CategoryBadge`, asunto, preview, `StatusBadge`, actividad; acciones "en curso" / "resuelta"; eliminar botones rotos (eliminar mensaje, marcar leído sin ids, notas internas).

## 4. Detalle de conversación

- [x] 4.1 `FeedbackThreadPage.tsx`: carga hilo + mensajes (`getThread` + `listThreadMessages`), muestra autor/rol/fecha/texto íntegro; `markThreadRead` al abrir; admin: acciones de estado; usuario: solo lectura.
- [x] 4.2 Ruta `/feedback/thread/:id` en `App.tsx`.

## 5. Tests y verificación

- [x] 5.1 Test sonda admin: éxito ⇒ true; `permission-denied` ⇒ false cacheado; error de red ⇒ false sin cachear.
- [x] 5.2 Test `createThread` escribe `ownerName`/`ownerEmail` en el documento del hilo.
- [x] 5.3 Mock de `firebase/firestore`: exportar `limit` y controlar modos de `getDocs`.
- [x] 5.4 `npm test` (1649 ok), `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 6. Despliegue

- [x] 6.1 `firebase deploy --only firestore:rules` a `althea-4b1d0` y verificación del release activo (ruleset con el correo admin confirmado vía API).

## 7. Cierre de pendientes heredados (ronda 2, 2026-10-21)

- [x] 7.1 `App.tsx`: `flushOutbox()` con consumidor real — al volver la conexión (`onOnline`) y periódicamente en el scheduler (003 US2).
- [x] 7.2 `Feedback.tsx` y `ChatWidget.tsx`: envío informa estado real (pendiente conserva borrador; error muestra motivo) y la lista se refresca tras enviar (003 FR-008).
- [x] 7.3 `feedbackAuthz.test.ts`: modelo de permisos completo + aserciones estáticas de `firestore.rules` (003 SC-002).
- [x] 7.4 `staging-preflight.mjs`: falla si las rules pierden `feedbackThreads` o el correo admin (guarda de configuración).
- [x] 7.5 Docs: `PENDIENTES_OTRO_AGENTE.md` (P4 resuelto, feedback cerrado, deuda P5.1 actualizada) y estado de la spec 003 → Implemented.
