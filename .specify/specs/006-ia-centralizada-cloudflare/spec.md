# Feature Specification: IA centralizada y gratuita con Cloudflare Workers AI

**Feature Branch**: `006-ia-centralizada-cloudflare`

**Created**: 2026-11-26

**Status**: Draft

**Input**: Reemplazar Groq por Cloudflare Workers AI en el único proxy existente, autenticar al usuario en cada petición, proteger la cuota gratuita compartida y conectar las dos funciones que realmente llaman al LLM (Coach y generador de rutinas), sin claves ni cuentas de proveedores externos para los usuarios.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar el Coach sin configurar nada (Priority: P1)

Un usuario autenticado en Althea escribe en el Coach. La app envía el mensaje y el contexto mínimo necesario al servicio central de Althea; el servicio verifica la identidad del usuario con su token de Firebase, llama a Cloudflare Workers AI y devuelve la respuesta en streaming. El usuario no ve, introduce ni configura ninguna clave de IA.

**Why this priority**: Es la función de IA más usada y la que hoy depende de Groq.

**Independent Test**: Iniciar sesión, enviar un mensaje y verificar que la respuesta llega por SSE y que la petición al Worker incluye `Authorization: Bearer <idToken>` con un payload sin credenciales.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión de Firebase, **When** envía un mensaje al Coach, **Then** recibe una respuesta streamed con el prompt del Coach y su contexto autorizado.
2. **Given** un usuario sin sesión, **When** intenta usar el Coach, **Then** ve un mensaje claro pidiendo iniciar sesión y no se llama al proveedor.
3. **Given** un token inválido o expirado, **When** llega al Worker, **Then** responde 401 sin reenviar nada a Cloudflare.

---

### User Story 2 - Generar rutinas con ejercicios reales (Priority: P1)

Un usuario pide una rutina en lenguaje natural. La app envía el pedido, el contexto autorizado y el catálogo de ejercicios permitidos; el servicio central usa salida JSON estructurada y la app valida los IDs contra la biblioteca real antes de aceptar la rutina.

**Why this priority**: Es la única función que requiere formato estructurado y donde un ID inventado rompe la app.

**Independent Test**: Generar una rutina con `exId` inventado inyectado en la respuesta y verificar que se descarta y se rellena desde el catálogo.

**Acceptance Scenarios**:

1. **Given** un pedido válido, **When** la IA responde, **Then** la respuesta es JSON parseable con `cycle`, `dayExercises` y `explanation`.
2. **Given** un `exId` que no está en la whitelist, **When** se normaliza, **Then** el ejercicio se reemplaza por uno real del catálogo.
3. **Given** una respuesta HTTP 429 o de cuota agotada, **When** falla la generación, **Then** se muestra un mensaje de limitación temporal con opción de reintentar; no se muestra una respuesta de IA simulada.

---

### User Story 3 - Proteger la cuota gratuita compartida (Priority: P1)

La cuenta de Cloudflare tiene 10.000 neuronas/día. El servicio central limita por usuario, limita el total de la cuenta, controla concurrencia y devuelve errores claros antes de agotar la cuota de todos.

**Why this priority**: Sin esto, un solo usuario puede dejar sin IA a los demás.

**Independent Test**: Ejecutar más peticiones que el límite por usuario y verificar 429 con `Retry-After`, y verificar que el contador global diario se incrementa con cada petición.

**Acceptance Scenarios**:

1. **Given** un usuario que superó 20 peticiones/minuto, **When** vuelve a pedir IA, **Then** recibe 429 con `Retry-After` y no se consumen neuronas.
2. **Given** un consumo global que supera el presupuesto diario configurado, **When** llega otra petición, **Then** responde 429 `quota_exhausted` indicando que se renueva a las 00:00 UTC.
3. **Given** una respuesta 429 de Cloudflare, **When** llega al Worker, **Then** se traduce a 429 `quota_exhausted` sin filtrar el cuerpo del proveedor.

---

### User Story 4 - Privacidad y mínimos datos (Priority: P2)

La IA recibe solo el contexto de la función solicitada. Credenciales y prompts no se exponen en el navegador ni en logs.

**Why this priority**: Requisito de la constitución (privacidad, nunca secretos en frontend).

**Independent Test**: Revisar el bundle por secretos y verificar que los logs del Worker contienen solo códigos de estado.

**Acceptance Scenarios**:

1. **Given** una petición al Worker, **When** se procesa, **Then** los logs contienen únicamente códigos de error/status, nunca mensajes ni respuestas.
2. **Given** los dos llamadores de IA, **When** se inspeccionan sus peticiones, **Then** ambos usan el mismo transporte central con el token del usuario y ninguno incluye claves de proveedor.
3. **Given** dos usuarios distintos, **When** usan la IA, **Then** cada uno recibe solo su propio contexto.

---

### Edge Cases

- Usuario sin sesión de Firebase: 401 con mensaje guiado, sin llamada al proveedor.
- Token expirado: 401; el frontend pide iniciar sesión de nuevo.
- Proveedor sin binding `AI` configurado: 503 `ai_not_configured`, sin respuesta simulada.
- Cloudflare devuelve 429: 429 `quota_exhausted`, sin fallback de IA.
- KV caído: se permite la petición pero se marca degradación; el presupuesto diario es un techo blando.
- Respuesta JSON inválida del generador: se mantiene el fallback determinista local (no es IA simulada) salvo que el error sea de cuota/autenticación.
- Mensajes duplicados: el cliente evita reenvíos concurrentes; el contador de ventana fija permite un pico en el borde.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El único servicio de IA de Althea debe ser el Worker existente, usando el binding `AI` de Cloudflare Workers con `@cf/google/gemma-4-26b-a4b-it` fijado en servidor.
- **FR-002**: El cliente no debe contener credenciales de proveedor; solo la URL pública del Worker y el token de Firebase del usuario.
- **FR-003**: El Worker debe verificar el ID token de Firebase en cada petición (firma RS256, `aud`, `iss`, `exp`) y usar `sub` como identidad.
- **FR-004**: El Worker debe aceptar solo `messages`, `task` (`chat`|`routine`) y parámetros legacy ignorados; `task=routine` fuerza salida `json_object` y `stream=false`.
- **FR-005**: El Worker debe desactivar el modo reasoning (`enable_thinking:false`) y el almacenamiento (`store:false`).
- **FR-006**: Debe existir límite por usuario (20 req/min), límite global (240 req/min), presupuesto diario de neuronas y control de concurrencia por isolate.
- **FR-007**: Los errores del proveedor deben sanitizarse; 429 → `quota_exhausted` con `Retry-After`; sin binding → 503; timeout → 504.
- **FR-008**: Los logs del Worker no deben incluir prompts, respuestas ni tokens.
- **FR-009**: `chatService.ts` y `routineBuilderIA.ts` deben compartir un único helper de autenticación y la misma URL de proxy.
- **FR-010**: La respuesta del generador debe validarse contra la biblioteca de ejercicios; los IDs inexistentes se descartan.
- **FR-011**: Ante cuota agotada o error de autenticación, el generador de rutinas debe mostrar el error al usuario y no caer silenciosamente al fallback local; el Coach debe mostrar el error y permitir reintentar.
- **FR-012**: El contexto enviado por cada función debe ser el que ya construye cada módulo; no se envía el perfil completo de forma indiscriminada.

### Key Entities

- **AIRequest**: `{ messages, task }` validado por el Worker; `task` determina formato y presupuesto de tokens.
- **AIIdentity**: `{ uid }` obtenido del ID token de Firebase verificado.
- **DailyQuota**: contador UTC por día de neuronas estimadas reservadas, con presupuesto por defecto de 9000 (margen bajo el límite gratuito de 10.000).
- **GeneratedRoutine**: estructura ya definida en `routineBuilderIA.ts`, validada contra la biblioteca de ejercicios.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% de las llamadas al proveedor pasan por el Worker y llevan un token verificado.
- **SC-002**: Cero credenciales de IA en el bundle del navegador.
- **SC-003**: Ninguna petición supera el límite global de 240 req/min ni el presupuesto diario configurado cuando los bindings están disponibles.
- **SC-004**: Las dos funciones de IA existentes conservan su comportamiento funcional y formatos de respuesta.
- **SC-005**: Todos los tests de IA y del Worker pasan, incluidos los nuevos de autenticación, cuota y JSON estructurado.

## Assumptions

- El proyecto ya tiene un Worker desplegable y Firebase Auth; se reutilizan, no se crea infraestructura nueva.
- El plan de Cloudflare es Free; no se activa facturación ni AI Gateway de pago.
- Los usuarios aceptan iniciar sesión en Althea (cuenta propia del proyecto) para usar IA; no se les pide cuenta en ningún proveedor de IA.
- Los valores reales de configuración del Worker (`FIREBASE_PROJECT_ID`, bindings) los aplica el propietario al desplegar.
