# Tasks: 003-feedback-admin

## 1. Auditoría y base

- [x] 1.1 Auditar App.tsx, ChatWidget, AppNav, icons.ts, Mas.tsx, db.ts, auth.ts, config.ts, firestore.rules, servicios/tests de sync
- [x] 1.2 Registrar línea base de `npm test` (4 fallos preexistentes fuera de alcance)

## 2. Datos y reglas

- [x] 2.1 Tipos y constantes (`feedbackTypes.ts`)
- [x] 2.2 Modelo puro de permisos (`feedbackAuthz.ts`)
- [x] 2.3 Versión Dexie v22 aditiva (feedbackThreads, feedbackMessages, feedbackOutbox)
- [x] 2.4 `firestore.rules`: admins/uids (solo Console), feedbackThreads + messages + internalNotes

## 3. Servicio

- [x] 3.1 Alta de hilo + primer mensaje (batch, getAfter en reglas)
- [x] 3.2 Envío con estados sent / pending / error (sin falso éxito)
- [x] 3.3 Outbox idempotente + flush al recuperar conexión
- [x] 3.4 Lecturas: mis hilos (ownerId==uid), bandeja admin, mensajes, notas
- [x] 3.5 Marcado de lectura, cambio de estado, notas internas

## 4. UI usuario

- [x] 4.1 FeedbackFab con "F" (misma posición que el FAB de Coach, sin solape con chat)
- [x] 4.2 Página /feedback: lista, alta, hilo, envío, pendientes, errores
- [x] 4.3 Acceso en Más + sección 'feedback' en temple

## 5. UI admin

- [x] 5.1 Ruta /admin/feedback con gate de admin
- [x] 5.2 Bandeja + filtros + orden por actividad + indicadores sin leer
- [x] 5.3 Respuestas, cambio de estado, notas internas

## 6. Verificación

- [x] 6.1 Tests de permisos (modelo + aserciones sobre firestore.rules)
- [x] 6.2 Tests del servicio (confirmado, offline pendiente, error, flush sin duplicados)
- [x] 6.3 `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
