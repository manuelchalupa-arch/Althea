# Althea — Entrenamiento, Nutrición, Recuperación y Coach IA

PWA mobile-first y offline-first para entrenamiento, nutrición, recuperación y seguimiento. La aplicación prioriza el uso desde el teléfono y conserva el historial local.

**Producción:** https://altheafit.pages.dev/

## Stack y arquitectura

- React 18, TypeScript, Vite 6 y Tailwind 3.
- Dexie 4 / IndexedDB, **esquema v29**. Dexie es la fuente canónica de los datos personales.
- Firebase Auth y Firestore para identidad, sincronización y funciones compartidas.
- Cloudflare Pages para servir la aplicación web.
- Cloudflare Worker + Workers AI (modelo @cf/google/gemma-4-26b-a4b-it) para Coach y generación de rutinas. El navegador no contiene claves de proveedor.
- PWA con Workbox; las funciones locales siguen disponibles sin conexión. IA remota y servicios externos requieren conectividad.

### Datos y compatibilidad

- La planificación vigente se guarda en cycleVersions; las rutinas viven en routineStore.
- La ejecución canónica usa trainingSessions, sessionExercises y setRecords. Las tablas legacy se conservan para lectura y compatibilidad.
- Esta entrega **no cambia Dexie v29 ni agrega migraciones**.
- El respaldo JSON v5 incluye las tablas personales y configuraciones exportables; se aceptan formatos anteriores v1-v4.
- La restauración disponible es **Combinar**: agrega registros nuevos y conserva los locales cuando hay conflictos. El reemplazo total permanece deshabilitado para evitar borrados parciales o ambiguos.
- Los datos de prueba/demo no se usan como datos reales del usuario.

## Inicio rápido

Desde la raíz del repositorio:

~~~bash
npm ci
npm run dev
~~~

Controles locales:

~~~bash
npx tsc --noEmit
npm run lint
npm run build
npx vitest run
npm run check:release
npm run playwright -- tests/fase2-qa.spec.ts --project=chromium
~~~

La CI ejecuta esos controles y prueba las reglas de Firestore contra emuladores locales, sin escribir en staging ni producción.

## Navegación y experiencia

En móvil hay cinco destinos permanentes: **Inicio, Entrenar, Nutrición, CrossFit y Más**. Las pantallas priorizan controles táctiles amplios, navegación clara y contenido sin superposiciones. La búsqueda general permite localizar ejercicios, alimentos y rutinas.

## Variables de entorno

Copiá .env.example a .env para desarrollo local, o usá .env.staging.example / .env.production.example para cada entorno.

Las variables VITE_* son públicas y quedan dentro del bundle. No coloques claves privadas en ellas. VITE_GROQ_PROXY_URL es el nombre histórico de la variable del proxy: actualmente debe apuntar al Worker de Cloudflare que usa el binding AI de Workers AI; **no requiere una clave Groq**.

Ver docs/IA_CENTRALIZADA.md, docs/INFRAESTRUCTURA.md y docs/CIERRE_PROYECTO.md.

## Publicación

- **Frontend:** Cloudflare Pages, build npm run build, directorio de salida dist. La publicación de producción se realiza desde la rama main conectada al proyecto Pages.
- **IA:** Worker independiente. Solo desplegarlo si cambió worker/: npm run worker:deploy:production.
- **Firebase:** Auth y Firestore son servicios de backend; las reglas se versionan en firestore.rules. Para publicarlas se necesita una sesión autorizada de Firebase CLI y el proyecto explícito: firebase deploy --only firestore:rules --project althea-4b1d0.

No uses Firebase Hosting como frontend de producción. Netlify y Firebase Hosting aparecen en documentos históricos; la URL de producción vigente está indicada arriba.

## Seguridad y límites

- Nunca subir archivos .env, tokens, service accounts ni claves privadas.
- La seguridad de datos se aplica en Firestore Rules; ocultar una ruta o botón no constituye autorización.
- El escaneo npm run check:release revisa el bundle dist/ para detectar claves conocidas.
- La suite automatizada no sustituye la verificación de despliegues y servicios externos. Los resultados vigentes se registran en el PR y en GitHub Actions.
