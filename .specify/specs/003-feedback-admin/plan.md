# Implementation Plan: Feedback de usuarios y bandeja admin

**Branch**: `003-feedback-admin` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/003-feedback-admin/spec.md`

## Summary

Reemplazar el FAB de Coach por un FAB de Feedback ("F") y construir un canal de conversaciones usuario↔administrador: colección top-level `feedbackThreads` con subcolecciones `messages` e `internalNotes`, autorización admin por lista de UIDs en `admins/uids` (solo Console), cola offline idempotente en Dexie (v22 aditiva) y bandeja `/admin/feedback`.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3

**Primary Dependencies**: firebase ^12 (Auth + Firestore), dexie ^4, react-router-dom ^7, vitest ^5, Tailwind 3

**Storage**: Dexie `trainPWA` v22 aditiva: `feedbackThreads`, `feedbackMessages`, `feedbackOutbox` (espejo local del usuario + cola). Firestore: `feedbackThreads/{id}`, `.../messages/{id}`, `.../internalNotes/{id}`, `admins/uids`.

**Testing**: vitest + jsdom + fake-indexeddb; mocks de `firebase/firestore` y `./config` (patrón de `isolation.test.ts`).

**Target Platform**: PWA (móvil-first + escritorio)

**Constraints**: sin secretos en cliente; éxito de envío solo tras ack de Firestore; ids de documento fijos en cliente para idempotencia.

**Scale/Scope**: una etapa; alcance limitado (no biblioteca muscular, cronómetro, nutrición, mapa muscular ni deportes).

## Constitution Check

*GATE passed before Phase 0.*

| Principio | Cumplimiento |
|-----------|--------------|
| I. Offline-First | Espejo local + outbox idempotente; sin conexión el borrador se conserva y se marca "no enviado". Feedback es síncrono con el server (no hay server opcional real), por eso la UI distingue explícitamente pendiente vs confirmado. |
| II. Local-First & Privacy | Mensajes de feedback solo salen del dispositivo cuando el usuario los envía; notas internas jamás llegan al cliente usuario. |
| III. Mobile-First | FAB reutiliza el posicionamiento existente (safe-area + `--mobile-nav-offset`); bandeja admin responsive (una columna en móvil). |
| IV. Deterministic Rules Before AI | Sin IA en el flujo. |
| V. User Control | Estados y mensajes visibles; nada se envía en silencio. |

## Project Structure

### Documentation (this feature)

```text
.specify/specs/003-feedback-admin/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── chat/ChatWidget.tsx        # se retira SOLO el Link flotante a /coach
│   ├── feedback/FeedbackFab.tsx   # nuevo: FAB "F"
│   └── brand/temple.tsx           # sección 'feedback' en header/backdrop
├── pages/
│   ├── Feedback.tsx               # nuevo: UI usuario
│   ├── AdminFeedback.tsx          # nuevo: bandeja /admin/feedback
│   └── Mas.tsx                    # acceso "Feedback" en accesos
├── services/
│   └── feedback/
│       ├── feedbackTypes.ts       # tipos, categorías, estados, límites
│       ├── feedbackAuthz.ts       # modelo puro de permisos (UI + tests)
│       ├── feedbackService.ts     # Firestore + Dexie + outbox
│       ├── feedbackService.test.ts
│       └── feedbackAuthz.test.ts  # modelo + aserciones sobre firestore.rules
├── services/storage/db.ts         # versión Dexie v22 aditiva
├── index.css                      # .fab-feedback-stack
├── App.tsx                        # rutas /feedback y /admin/feedback + FAB
firestore.rules                    # admins/uids + feedbackThreads + subcolecciones
```

**Structure Decision**: servicios en `src/services/feedback/` siguiendo la convención de dominio (ai, sync, notifications); páginas en `src/pages/`; FAB propio para no acoplar Feedback al chunk de IA.

## Complexity Tracking

| Violación | Por qué | Alternativa más simple rechazada |
|-----------|---------|----------------------------------|
| Ninguna | — | — |
