# Feature Specification: Feedback de usuarios y bandeja privada de administración

**Feature Branch**: `003-feedback-admin`

**Created**: 2026-10-14

**Status**: Implemented (2026-10-21; completada junto con `005-panel-feedback-creador`, que resuelve la bandeja del creador y deja fuera de alcance respuestas del admin y notas internas)

**Input**: User description: "Reemplazar el botón flotante de Coach por un botón de Feedback con F grande, conservar el chat de Althea, y desarrollar conversaciones usuario↔administrador con bandeja admin privada en /admin/feedback, reglas Firestore con lista de UIDs admin y cola offline en Dexie."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enviar feedback al administrador (Priority: P1)

Como usuario autenticado, toco el botón flotante "F" y abro Feedback. Creo una conversación eligiendo categoría (error, duda de funcionamiento, propuesta de mejora, otro), un asunto opcional y un primer mensaje obligatorio. Veo el historial con autor y fecha, las respuestas del administrador en la misma conversación y el estado (pendiente, en curso, resuelta).

**Why this priority**: Es el núcleo del valor: un canal directo usuario→administrador sin cuenta colectiva.

**Independent Test**: Crear una conversación con sesión autenticada y verificar que aparece en `feedbackThreads` con `ownerId` igual al UID, un mensaje en `messages` y que el usuario solo ve sus propias conversaciones.

**Acceptance Scenarios**:

1. **Given** usuario autenticado sin conversaciones, **When** envía categoría + primer mensaje, **Then** se crea el hilo y el mensaje; la UI confirma solo tras confirmación real de Firestore.
2. **Given** mensaje con texto vacío, **When** se intenta enviar, **Then** el botón queda deshabilitado y no se escribe nada.
3. **Given** usuario con conversaciones propias y ajenas en el servidor, **When** lista sus conversaciones, **Then** solo se muestran las propias.

---

### User Story 2 - Sin conexión: borrador y reenvío sin duplicados (Priority: P1)

Como usuario sin conexión, escribo un mensaje: queda guardado localmente marcado como "no enviado" y se reintenta al volver la conexión sin duplicar mensajes.

**Why this priority**: Constitución I (offline-first) y requisito explícito: nunca informar envío exitoso antes de la confirmación de Firestore.

**Independent Test**: Simular `navigator.onLine === false` y verificar que el mensaje queda en Dexie con `syncStatus='pending'`, en la cola de salida, y que `flushOutbox()` idempotente no duplica documentos (id de cliente fijo).

**Acceptance Scenarios**:

1. **Given** modo offline, **When** el usuario envía un mensaje, **Then** la UI lo muestra como pendiente (no como enviado) y el draft se conserva.
2. **Given** mensajes pendientes en la cola, **When** vuelve la conexión, **Then** se reenvían con el mismo id de documento (sin duplicados) y pasan a `synced`.
3. **Given**Firestore responde `permission-denied`, **When** se envía, **Then** la UI muestra error real (no "pendiente") y no encola reintento ciego.

---

### User Story 3 - Bandeja administrativa privada (Priority: P1)

Como administrador autorizado (UID en la lista de Firebase Console), abro `/admin/feedback`: bandeja ordenada por actividad reciente, filtros por estado y categoría, indicadores de mensajes sin leer, vista de conversación, respuestas en nombre de la administración, cambio de estado y notas internas privadas.

**Why this priority**: Sin bandeja el canal no tiene destinatario operativo.

**Independent Test**: Con un UID no listado, `/admin/feedback` muestra "No autorizado" y las lecturas de la bandeja fallan por reglas; con el UID listado se listan todos los hilos.

**Acceptance Scenarios**:

1. **Given** admin autorizado, **When** abre un hilo, **Then** sus mensajes sin leer se marcan leídos y el contador baja.
2. **Given** cuenta normal, **When** intenta leer `internalNotes`, **Then** Firestore deniega y la UI nunca las muestra.
3. **Given** admin, **When** cambia estado a resuelta, **Then** el usuario ve "Resuelta" en su hilo.

---

### User Story 4 - Botón F reemplaza al flotante de Coach (Priority: P2)

El acceso flotante que mostraba el avatar de Coach pasa a ser un botón de Feedback con "F" visible, conservando posición, apilado sobre el menú inferior, áreas seguras y sin solaparse con el chat de Althea.

**Why this priority**: Requisito de UI de la etapa; el chat de Althea debe seguir intacto.

**Independent Test**: Verificar que no queda Link a `/coach` en el FAB de ChatWidget/FeedbackFab, que el chat abre/cierra igual y que las clases de posicionamiento usan `--mobile-nav-offset` y safe-area.

**Acceptance Scenarios**:

1. **Given** cualquier página principal, **When** se mira la esquina inferior derecha, **Then** hay un botón "F" que navega a `/feedback` y el botón del chat sigue funcionando.
2. **Given** el chat abierto, **When** se renderiza el FAB de Feedback, **Then** no se superpone con el panel del chat.

---

### Edge Cases

- Firebase sin configurar (modo 100% local): Feedback informa que requiere cuenta; no rompe la app.
- Cambio de cuenta en el mismo navegador: las tablas locales de feedback se limpian junto con el resto de Dexie (`db.delete()` en accountWipe).
- Hilo recién creado con primer mensaje en batch: las reglas usan `getAfter()` para validar el padre en el mismo lote.
- Lista `admins/uids` inexistente: nadie es admin (deny por default).
- Texto > 2000 caracteres o asunto > 120: rechazo en cliente y en reglas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El botón flotante de Coach (avatar) se reemplaza por un botón de Feedback con "F" visible, manteniendo posición adaptativa (móvil/escritorio/safe-area/nav inferior).
- **FR-002**: El chat independiente de Althea (FAB, historial, servicios) no se modifica.
- **FR-003**: La ruta `/coach` y sus accesos de menú se conservan provisionalmente sin cambios.
- **FR-004**: Usuario autenticado puede crear conversaciones con categoría, asunto opcional y primer mensaje obligatorio.
- **FR-005**: Cada usuario ve y consulta exclusivamente sus propias conversaciones (sin cuenta colectiva).
- **FR-006**: El historial muestra autor y fecha por mensaje; las respuestas del administrador aparecen en la misma conversación.
- **FR-007**: Estados de conversación: `pendiente`, `en_curso`, `resuelta`.
- **FR-008**: La UI informa éxito solo tras confirmación de Firestore; sin conexión conserva el borrador y marca el mensaje como no enviado.
- **FR-009**: Cola local de reenvío con ids de documento fijos generados en cliente (idempotente, sin duplicados).
- **FR-010**: Ruta `/admin/feedback` con bandeja general, orden por actividad reciente, filtros por estado y categoría, vista de conversación, respuestas, cambio de estado, notas internas privadas e indicadores de mensajes sin leer.
- **FR-011**: Autorización administrativa por lista de UIDs en documento Firestore `admins/uids`, gestionada solo desde Firebase Console; clientes no pueden crearlo, modificarlo ni eliminarlo.
- **FR-012**: Prohibido cualquier mecanismo de admin basado en variable de frontend, correo declarado en cliente u ocultación de ruta.
- **FR-013**: Estructura de datos explícita: `feedbackThreads/{id}` con subcolecciones `messages` e `internalNotes`.
- **FR-014**: Reglas que validan propietario, remitente y operaciones permitidas; `internalNotes` es admin-only (ni lectura ni escritura para usuarios normales).
- **FR-015**: Nuevas tablas locales solo mediante versión aditiva de Dexie (sin recrear la base); no se incorporan a la sincronización genérica `users/{uid}`.
- **FR-016**: No se agregan credenciales ni claves de servicio al cliente.

### Key Entities

- **FeedbackThread**: conversación usuario↔admin. `id, ownerId, category, subject, status, createdAt, updatedAt, lastActivityAt, lastMessagePreview, lastMessageAuthorRole, messageCount, unreadForOwner, unreadForAdmin`.
- **FeedbackMessage**: mensaje de una conversación. `id, threadId, authorId, authorRole('user'|'admin'), text, createdAt, readByOwner, readByAdmin`.
- **FeedbackInternalNote**: nota privada del admin. `id, threadId, authorId, text, createdAt`. Solo legible/ editable por admin.
- **AdminUids**: documento `admins/uids` con `uids: string[]`. Solo Console.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build` pasan (los 4 tests preexistentes en rojo por fuera de este alcance se documentan).
- **SC-002**: Tests automatizados cubren el modelo de permisos (dueño/admin/no-autorizado) y el servicio de Feedback (envío confirmado, pendiente offline, error y flush sin duplicados).
- **SC-003**: El chat de Althea abre, cierra y responde igual que antes (tests existentes de ChatWidget en verde).
- **SC-004**: El botón F no se superpone con el chat ni con la nav inferior en 390px ni en 1440px (clases de apilado existentes).
- **SC-005**: Una cuenta normal no puede listar la bandeja completa ni leer `internalNotes` (reglas + tests del modelo).

## Assumptions

- La lista de admins se crea manualmente en Firebase Console como documento `admins/uids` con campo `uids` (array de UIDs); esto se documenta como paso manual, no se ejecuta en esta etapa.
- Las reglas nuevas no están desplegadas en Firebase real en esta etapa: se validan localmente (tests del modelo + revisión), no se afirma validación en nube.
- El idioma de la UI es español rioplatense, consistente con la app.
- `/admin/feedback` se sirve dentro del shell normal (requiere sesión); la seguridad real está en las reglas, no en la ruta.
