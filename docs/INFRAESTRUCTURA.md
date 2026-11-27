# Infraestructura vigente de Althea

**Última revisión:** 27 de noviembre de 2026  
**Producción:** https://altheafit.pages.dev/

## 1. Arquitectura actual

| Capa | Servicio | Responsabilidad |
|---|---|---|
| Frontend de producción | Cloudflare Pages | Aplicación web, PWA, assets y headers |
| API y Coach IA | Cloudflare Workers | Autenticación de peticiones, límites de uso y acceso a Workers AI |
| Identidad | Firebase Authentication | Inicio de sesión con correo y Google |
| Datos compartidos | Cloud Firestore | Biblioteca compartida y feedback |
| Datos personales | Dexie / IndexedDB | Perfil local, rutinas, sesiones e historial |

Firebase Hosting no es el frontend de producción. Su configuración de staging se conserva para validaciones aisladas; el guard de deploy rechaza cualquier intento de usarlo para producción.

## 2. Publicación del frontend

- El sitio de producción es Cloudflare Pages: https://altheafit.pages.dev/.
- El repositorio se integra mediante Pull Request hacia main.
- La CI debe aprobarse antes de integrar.
- La publicación de main en Cloudflare Pages es el mecanismo de despliegue de frontend.
- La política de cabeceras y CSP se mantiene en public/_headers; public/_redirects conserva el fallback de rutas.
- No ejecutar comandos de Firebase Hosting para publicar producción.

## 3. Cloudflare Worker y Coach IA

- Configuración de staging: worker/wrangler.staging.toml.
- Configuración de producción: worker/wrangler.production.toml.
- El Worker usa Workers AI mediante el binding AI; el cliente web no envía modelo ni parámetros de proveedor.
- El modelo y los límites se definen en el Worker, no en el navegador.
- Los origins de Worker autorizados por CSP son:
  - https://althea-proxy-staging.manuelchalupa.workers.dev
  - https://althea-proxy-production.manuelchalupa.workers.dev
- Los secretos de despliegue se configuran en Cloudflare; nunca se versionan.

## 4. Firebase y permisos

- Las reglas versionadas están en firestore.rules.
- La CI las prueba con emuladores locales de Authentication y Firestore.
- La administración de feedback requiere ambas condiciones:
  1. request.auth.token.email_verified == true.
  2. El UID figura en el documento privado admins/uids, campo uids (array).
- Los clientes no pueden leer ni modificar admins/uids.
- Antes de desplegar las reglas en producción, el propietario debe provisionar los UID autorizados desde Firebase Console o Admin SDK. La guía está en docs/CIERRE_PROYECTO.md.

## 5. Datos locales y compatibilidad

- Rutinas, sesiones, historial y datos personales permanecen en Dexie / IndexedDB.
- Esta entrega no introduce migraciones destructivas ni cambios de esquema Dexie.
- La importación de respaldos combina datos de forma conservadora y conserva registros locales en conflicto.
- No ejecutar limpiezas de IndexedDB ni reinicios de onboarding como parte de un despliegue.

## 6. Variables y secretos

- .env.example, .env.staging.example y .env.production.example son plantillas; reemplazar los valores de ejemplo en los entornos correspondientes.
- Los archivos reales .env.* permanecen ignorados por Git.
- Las variables VITE_* son visibles en el navegador: nunca incluir tokens privados ni credenciales administrativas.
- Las claves de Cloudflare, credenciales de Firebase Admin y secretos de CI se guardan en sus respectivos gestores de secretos.

## 7. CI y criterio de publicación

El workflow .github/workflows/ci.yml ejecuta, en este orden:

1. Instalación reproducible con npm ci.
2. Auditoría completa de dependencias con umbral low.
3. TypeScript y ESLint.
4. Build de producción.
5. Pruebas unitarias e integración, incluido Worker.
6. npm run check:release.
7. Playwright responsive en Chromium.
8. Reglas Firestore en emuladores locales.

No integrar si alguna comprobación falla.

## 8. Despliegue y rollback

- .github/workflows/deploy-pages.yml espera el evento workflow_run del workflow CI y solo despliega cuando la ejecución de main terminó con éxito. Usa el SHA exacto que pasó las pruebas, Node 24 y falla antes de publicar si falta el token o algún valor de configuración pública Firebase.

1. Aprobar CI y revisión del diff.
2. Provisionar el UID administrativo en Firebase si aún no existe.
3. Desplegar firestore.rules mediante Firebase CLI o la integración autorizada.
4. Integrar a main; Cloudflare Pages publica el frontend.
5. Verificar inicio, navegación, búsqueda, datos locales, login y Coach IA en producción.
6. Si falla el frontend, revertir el commit y volver a publicar la versión anterior de Pages. Si falla una regla, restaurar la versión anterior de firestore.rules y desplegarla.

**No desplegar Firebase Hosting como producción.** El único comando de Hosting conservado es para staging y rechaza el modo production.
