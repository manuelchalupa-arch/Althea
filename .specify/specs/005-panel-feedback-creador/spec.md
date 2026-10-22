# Feature Specification: Panel de feedback para el creador (correo admin)

**Feature Branch**: `005-panel-feedback-creador`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Quiero que si me conecto con la cuenta Manuelchalu@gmail.com, al tocar Feedback obtenga un panel donde vea, de cada usuario, el nombre, el mensaje y el tipo de mensaje para poder resolverlo. Los usuarios normales mantienen la carga de mensajes tal cual está hoy. Yo no hago feedback: soy el creador, sé los cambios y los hago directo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El creador abre el panel desde el botón F (Priority: P1)

Como creador autenticado con `Manuelchalu@gmail.com`, toco el botón flotante "F" y me llega a la bandeja de admin (no al formulario): lista de TODOS los hilos de TODOS los usuarios, cada uno con nombre/correo del usuario, categoría (tipo), asunto, mensaje (preview), estado y actividad reciente. Puedo filtrar por estado/categoría, marcar en curso/resuelta y abrir la conversación completa para leer el mensaje original.

**Why this priority**: Sin esto el canal no tiene destinatario operativo: el creador no puede identificar ni resolver reportes.

**Independent Test**: Conectado con la cuenta admin, tocar F y verificar que `/feedback` muestra la bandeja con los hilos de otros usuarios (nombre, categoría, mensaje); con una cuenta normal, el mismo toque muestra el formulario de siempre.

**Acceptance Scenarios**:

1. **Given** cuenta admin, **When** abre `/feedback`, **Then** ve la bandeja con identidad del usuario, categoría, asunto, preview, estado y acciones de resolución.
2. **Given** cuenta normal, **When** abre `/feedback`, **Then** ve exactamente el formulario y "Mis hilos" de hoy (sin cambios).
3. **Given** admin, **When** marca un hilo "resuelta", **Then** el estado se persiste en Firestore y el usuario ve "Resuelta" en su lista.
4. **Given** cuenta no admin, **When** escribe `/admin/feedback` a mano, **Then** ve "No autorizado" (no una lista vacía).

---

### User Story 2 - Leer la conversación completa (Priority: P1)

Como creador, abro un hilo desde la bandeja y veo la conversación completa: cada mensaje con autor (usuario/administrador), fecha y texto íntegro; al abrir se marcan como leídos. Desde ahí cambio el estado a resuelta. El usuario también puede abrir su hilo y ver la conversación (solo lectura + estado).

**Why this priority**: El preview de 140 caracteres no alcanza para diagnosticar un problema.

**Independent Test**: Abrir un hilo con un mensaje largo (>140 chars) y verificar que se ve completo; verificar que la ruta `/feedback/thread/:id` ya no devuelve pantalla en blanco.

**Acceptance Scenarios**:

1. **Given** hilo con mensaje largo, **When** el admin lo abre, **Then** ve el texto completo, la categoría y al usuario que lo escribió.
2. **Given** hilo con mensajes sin leer, **When** el admin lo abre, **Then** `unreadForAdmin` baja a 0.
3. **Given** usuario normal, **When** abre su hilo, **Then** ve su conversación; no ve acciones de estado ni datos de otros usuarios.

---

### User Story 3 - Detección de rol administrativo por servidor (Priority: P1)

Como creador, mi rol de admin lo decide Firestore: mis reglas aceptan como admin el correo verificado del token (`Manuelchalu@gmail.com`) O un UID listado en `admins/uids`. El cliente nunca declara el rol: lo resuelve intentando una lectura exclusiva de admin (listado sin filtro con límite 1); éxito ⇒ admin, `permission-denied` ⇒ no admin.

**Why this priority**: FR-012 de la spec 003 (seguridad): ninguna variable de frontend otorga el rol. Este feature extiende el mecanismo con el correo verificado del token, que solo Firebase Auth puede garantizar.

**Independent Test**: Una cuenta normal debe recibir `permission-denied` en la sonda y nunca ver la bandeja aunque escriba la ruta; la cuenta admin debe pasar la sonda sin figurar en `admins/uids`.

**Acceptance Scenarios**:

1. **Given** cuenta con el correo admin verificado, **When** se resuelve el rol, **Then** la sonda (list sin filtro) tiene éxito sin que exista `admins/uids`.
2. **Given** cuenta normal, **When** se resuelve el rol, **Then** la sonda recibe `permission-denied` y el rol queda en false (cacheado 60 s).
3. **Given** error de red en la sonda, **When** se resuelve el rol, **Then** no se cachea falso definitivo: el próximo montaje reintenta.
4. **Given** el formulario de usuario, **When** se envía un mensaje, **Then** el documento del hilo incluye `ownerName`/`ownerEmail` denormalizados para que el panel identifique al usuario.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `/feedback` renderiza la bandeja de admin si el servidor confirma el rol; caso contrario renderiza el formulario actual sin cambios (mismo componente, mismas funciones).
- **FR-002**: El rol admin en reglas se evalúa como: sesión iniciada Y (`request.auth.token.email == 'manuelchalu@gmail.com'` O UID en `admins/uids`). El chequeo de correo va primero para cortocircuitar el `get()`.
- **FR-003**: El cliente resuelve el rol con una sonda `getDocs` sin filtro + `limit(1)` sobre `feedbackThreads`: éxito ⇒ true; `permission-denied` ⇒ false cacheado 60 s; otros errores ⇒ false sin cachear.
- **FR-004**: Al crear un hilo se denormalizan `ownerName` y `ownerEmail` (perfil local / Firebase Auth). Las reglas de create no restringen claves extra: no requieren cambio adicional.
- **FR-005**: La bandeja muestra por hilo: identidad del usuario (`ownerName` ‖ `ownerEmail` ‖ prefijo de UID), `CategoryBadge`, asunto, preview, estado (`StatusBadge`), actividad, y acciones "en curso" / "resuelta".
- **FR-006**: Existe la ruta `/feedback/thread/:id`: conversación completa (autor, rol, fecha, texto íntegro); admin cambia estado; al abrir, el lector marca sus mensajes sin leer (`markThreadRead`).
- **FR-007**: `/admin/feedback` con cuenta no admin muestra "No autorizado" explícito.
- **FR-008**: La bandeja distingue carga / vacío / error de permiso (mensaje legible, nunca lista vacía silenciosa).
- **FR-009**: Fuera de alcance: caja de respuesta del admin, notas internas, borrado de mensajes y notificaciones (el creador resuelve directo en el código).

### Key Entities

- **FeedbackThread** (delta): + `ownerName?: string`, `ownerEmail?: string`. El resto del esquema de la spec 003 no cambia.
- **admins/uids**: se conserva como mecanismo alternativo (OR), gestionado solo desde Console.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build` pasan.
- **SC-002**: Tests cubren la sonda admin (éxito / permission / red sin cachear) y la denormalización de identidad en `createThread`.
- **SC-003**: `firestore.rules` desplegadas a `althea-4b1d0` con el correo admin; una cuenta normal sigue recibiendo `permission-denied` en la bandeja.
- **SC-004**: El formulario de usuario (envío, "Mis hilos") funciona igual que antes (tests preexistentes en verde).

## Assumptions

- El correo exacto de la cuenta creadora es `Manuelchalu@gmail.com` (confirmado por el usuario el 2026-10-21).
- Las rules vivas de `althea-4b1d0` eran idénticas al archivo del repo al momento de esta spec (verificado vía Firebaserules API el 2026-10-21): desplegar no pisa cambios manuales de consola.
- El usuario aprobó el despliegue de rules a producción.
- Los hilos antiguos sin `ownerName`/`ownerEmail` muestran fallback (correo no disponible ⇒ prefijo de UID); no hay migración.
- El idioma de la UI es español rioplatense, consistente con la app.
