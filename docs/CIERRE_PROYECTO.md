# Cierre técnico del proyecto Althea

**Objetivo:** dejar una base mantenible para las próximas mejoras, sin cambiar el esquema local ni comprometer datos de usuarios.

## Etapas de trabajo

| Etapa | Alcance | Evidencia de aceptación |
|---|---|---|
| 0. Auditoría y línea base | Revisión de arquitectura, datos, navegación, accesibilidad, seguridad y rendimiento | Hallazgos registrados; ningún cambio destructivo |
| 1. Interfaz móvil | Jerarquía visual, tamaños táctiles, espaciado, safe areas y controles | Playwright en 360, 375, 390, 393, 412 y 430 px; tablet y escritorio |
| 2. Navegación | Cinco destinos permanentes: Inicio, Entrenar, Nutrición, CrossFit y Más | Prueba de orden, visibilidad y un único landmark de navegación |
| 3. Propiedad y respaldo | Exportación v5, compatibilidad v1-v4, validación de manifiesto, combinación segura y rollback transaccional | Tests de conteos, integridad, conflictos, marcadores de borrado y reversión |
| 4. Firestore | Propiedad de datos, reglas de administración verificadas y biblioteca compartida | Firebase Emulator Suite: aislamiento A/B, anónimo, propiedad y correo verificado |
| 5. Búsqueda general | Ejercicios, alimentos y rutinas; apertura del resultado elegido | Pruebas de resultado exacto, navegación y registro de alimento |
| 6. Inicio y CrossFit | Resúmenes reales en Inicio y herramientas CrossFit agrupadas | Datos provenientes de Dexie; estados vacíos honestos; pruebas E2E |
| 7. Coach IA | Contexto permitido de entrenamiento, nutrición, mediciones y recuperación | Tests de contexto/prompt; Worker valida Auth, payload, cuotas y errores |
| 8. Calidad y accesibilidad | Foco, diálogos, teclado, responsive, lint y bundle | TypeScript, ESLint, Vitest, Playwright y check:release |
| 9. Publicación y mantenimiento | Documentación, integración y verificación de producción | CI verde sobre SHA final; merge; despliegue Pages; smoke test; verificación Firebase/Worker |

## Reglas de integridad de datos

1. **Dexie permanece en v29.** No agregar migraciones ni cambiar claves primarias en esta entrega.
2. No vaciar tablas ni borrar datos existentes como efecto de iniciar sesión, cambiar de pantalla o actualizar la app.
3. El respaldo JSON v5 debe contener el manifiesto y el conteo de cada tabla exportada. Los formatos v1-v4 se migran en memoria antes de importar.
4. La restauración disponible es merge: inserta registros que faltan, conserva el dato local en conflictos y combina syncDeletes por identidad lógica.
5. El reemplazo total queda deshabilitado hasta tener una estrategia completa, transaccional y verificable. No presentarlo como función disponible.
6. Toda restauración se realiza en una transacción Dexie y se verifica después. Un error debe revertir el conjunto completo.
7. No enviar al Coach nombre, email ni identificadores. Solo se incluye contexto pertinente a las categorías autorizadas por el usuario.

## Administración de feedback en Firebase

La autorización administrativa no usa correos escritos en el repositorio. Antes de desplegar las reglas en producción:

1. Obtener el UID de la cuenta propietaria desde Firebase Authentication del proyecto althea-4b1d0.
2. Crear desde Firebase Console o Admin SDK el documento privado admins/uids con el campo uids como array que contenga ese UID.
3. La cuenta debe tener email_verified=true en el token de Firebase Auth.
4. Los clientes no pueden leer ni modificar admins/uids; la lista solo se consulta desde las reglas de Firestore.

La CI prepara una lista temporal en el emulador con credenciales de propietario y prueba ambos requisitos por separado. No modifica el proyecto Firebase real.

## Dependencias y cadena de suministro

- Firebase Web SDK actualizado a 13.4.0.
- gRPC JS fijado por override en 1.14.7 y RE2JS actualizado a 2.10.0 para resolver avisos de seguridad transitivos de Firestore.
- Workbox Build conserva su versión compatible 7.4.1 y usa overrides acotados: Glob 14.0.6 y Minimatch 11.0.9 en la cadena de precache.
- Zod 3 dejó de ser dependencia directa porque no tenía importaciones en el código fuente; la versión transitiva resuelta es 4.6.7.
- Vite y Vitest se actualizaron dentro de sus rangos compatibles.
- La CI ejecuta npm audit sobre el árbol completo con umbral low. No se permite ignorar ni rebajar el umbral para obtener una ejecución verde.

## Comandos de validación

~~~bash
npm ci
npx tsc --noEmit
npm run lint
npm run build
npx vitest run
npm run check:release
npm audit --audit-level=low
npm run playwright -- tests/fase2-qa.spec.ts --project=chromium
~~~

La CI ejecuta además las reglas de Firestore en emuladores Auth y Firestore. El proyecto de emulador es demo-althea; no se conecta a recursos reales.

## Publicación

- El workflow .github/workflows/deploy-pages.yml se dispara al terminar CI, pero publica únicamente si CI concluyó correctamente en main y el origen pertenece al repositorio. No ejecuta deploy en paralelo con las pruebas.
- El workflow exige CLOUDFLARE_API_TOKEN y las variables públicas VITE_FIREBASE_* en GitHub Actions Variables; si falta alguna, falla antes de publicar.
- Usa Node 24, npm ci, build y check:release antes de desplegar Worker y Pages.
- Frontend: Cloudflare Pages, salida dist/, producción en https://altheafit.pages.dev/.
- Firebase: Auth/Firestore del proyecto althea-4b1d0. Las reglas se despliegan por separado con Firebase CLI autorizado.
- IA: Worker de producción althea-proxy-production, binding AI. Desplegarlo solo cuando cambie worker/.
- No desplegar si CI falla o si el SHA de la rama cambia durante la validación.
- Después del merge, comprobar que Pages publicó el SHA correcto, abrir rutas SPA, revisar assets, PWA y respuesta del Worker. No afirmar que un servicio externo quedó validado si no se hizo una prueba autenticada real.

## Deuda técnica que se conserva deliberadamente

- Los nombres internos heredados VITE_GROQ_PROXY_URL, groqConfig y el valor histórico de origen groq se mantienen por compatibilidad; el endpoint actual es Cloudflare Workers AI. Renombrarlos requiere una migración coordinada de frontend, entorno, historial y despliegues.
- Las tablas y adaptadores legacy se conservan para leer historiales antiguos. No son candidatos a borrado sin una auditoría de uso y compatibilidad independiente.
- El reemplazo destructivo de respaldos sigue deshabilitado por diseño.
- La validación de un navegador automatizado no equivale a certificar cada modelo físico de teléfono ni la disponibilidad de servicios externos.

## Criterio de cierre

Una etapa se marca aprobada solo con evidencia verificable. La publicación se considera completa cuando el SHA final tiene CI verde, se integra en main, Cloudflare Pages sirve ese SHA y las reglas de Firebase/Worker se verifican en su entorno autorizado. Los resultados y el SHA exacto se registran en el PR y en GitHub Actions.
