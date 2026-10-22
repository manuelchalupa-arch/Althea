# Implementation Plan: Panel de feedback para el creador

## Summary

El creador (correo `manuelchalu@gmail.com`) abre el botón F y recibe la bandeja admin con todos los hilos: identidad del usuario, categoría, mensaje y acciones de resolución; los usuarios normales conservan el formulario actual. El rol admin pasa a resolverse en el servidor (correo verificado del token OR UID listado) y el cliente lo confirma con una sonda de lectura admin. Se agrega la ruta de detalle `/feedback/thread/:id` (hoy inexistente) para leer la conversación completa.

## Technical Context

- React 18 + TS + Vite + Tailwind; react-router; Firebase Auth + Firestore (reglas en `firestore.rules`, deploy con `firebase deploy --only firestore:rules`, CLI autenticado).
- Estado local: Dexie (`feedbackThreads`, `feedbackMessages`, `feedbackOutbox` v22). Sin nuevas tablas.
- Tests: Vitest con mocks de `firebase/firestore` (`feedbackService.test.ts`).
- Spec previa: `.specify/specs/003-feedback-admin` (feature a medio construir: bandeja rota, ruta detalle inexistente).

## Constitution Check

- **I Offline-First**: la bandeja/detalle requieren conexión (`listAllThreads` ya lanza `network` offline); el formulario de usuario no se toca. ✓
- **II Privacy**: `ownerName`/`ownerEmail` salen del dispositivo SOLO dentro de `feedbackThreads` (lectura: dueño o admin, por reglas). ✓
- **III Mobile-First**: UI con clases existentes (`btn-primary`, `bg-surface-container`, badges), sin assets nuevos. ✓
- **V Seguridad (spec 003 FR-012)**: el rol lo decide Firestore; el cliente solo hace sonda. El correo está en `firestore.rules` (server-side, token verificado por Firebase Auth), nunca en variables de frontend. ✓

## Technical Decisions

1. **Detección de rol (rules)**: `isFeedbackAdmin()` → `signedIn() && (request.auth.token.email == 'manuelchalu@gmail.com' || request.auth.uid in get(...).data.uids)`. El correo va primero: cortocircuita el `get()` (sin costo y sin error si `admins/uids` no existe).
2. **Detección de rol (cliente)**: `fetchIsFeedbackAdmin` deja de leer `admins/uids` (imposible: solo un UID listado puede leerlo). Pasa a sonda: `getDocs(query(feedbackThreads, limit(1)))` sin filtro — las reglas solo permiten ese listado a admin. Éxito ⇒ true (cache 60 s); `permission-denied` ⇒ false (cache 60 s); red/caída ⇒ false **sin cachear** (reintenta en el próximo montaje).
3. **Gate de ruta**: componente `FeedbackEntry` (página lazy propia) que resuelve `useFeedbackActor()` y renderiza `AdminFeedback` o `Feedback`. `/feedback` y `/admin/feedback` apuntan a él (`adminOnly` fuerza la bandeja). Se evita importar Firebase en el bundle inicial de `App.tsx`.
4. **Identidad denormalizada**: `buildThread` agrega `ownerName`/`ownerEmail` desde `db.userProfile.get('me')` con fallback a `currentUser()`. Las reglas de `create` no usan `hasOnly`: aceptan claves extra sin cambio de rules.
5. **Detalle**: nueva página `FeedbackThreadPage` + `getThread()` en el servicio (getDoc con fallback local). Marca leído al abrir (`markThreadRead`) y ofrece acciones de estado solo al admin. Sin caja de respuesta (FR-009).
6. **Limpieza de bandeja**: se eliminan los botones rotos ("Eliminar mensaje" con id inexistente, "Marcar leído" sin ids, bloque `internalNotes` inexistente) y se agrega estado explícito carga / vacío / no autorizado.

## Project Structure

### Documentation (this feature)

- `.specify/specs/005-panel-feedback-creador/{spec.md, plan.md, tasks.md}`

### Source Code (repository root)

- `firestore.rules` — `isFeedbackAdmin()` con OR de correo (único cambio de seguridad).
- `src/services/feedback/feedbackService.ts` — sonda admin, `getThread`, `buildThread` con identidad.
- `src/services/feedback/feedbackTypes.ts` — `ownerName?`, `ownerEmail?`.
- `src/pages/FeedbackEntry.tsx` (nuevo) — gate admin/usuario.
- `src/pages/AdminFeedback.tsx` — panel con identidad+categoría, estados de carga/error/no autorizado.
- `src/pages/FeedbackThreadPage.tsx` (nuevo) — conversación completa + resolver.
- `src/App.tsx` — rutas `/feedback` y `/admin/feedback` vía `FeedbackEntry`.
- `src/services/feedback/feedbackService.test.ts` — tests de sonda y denormalización.

## Complexity Tracking

Ninguna desviación: sin dependencias nuevas, sin tablas nuevas, sin Cloud Functions.
