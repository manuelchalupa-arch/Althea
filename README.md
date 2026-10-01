# Althea — Entrenamiento, Nutrición, Recuperación y Coach IA

PWA mobile-first, offline-first e instalable. Responde **"¿Qué tengo que hacer hoy?"** sin internet: Dexie (IndexedDB) es la fuente de verdad local; Firebase solo es transporte/backup por usuario.

## Stack

React 18 + TypeScript + Vite 6 + Tailwind 3 + Dexie 4 (IndexedDB, v21) + vite-plugin-pwa (Workbox) + react-router-dom + Firebase 12 + lucide-react + uuid + zod.

## Inicio rápido

```bash
cd train-pwa
npm ci
npm run dev      # http://localhost:5173
npm test         # vitest run
npx tsc --noEmit
npm run lint
npm run build    # tsc + vite build + SW precache
npm run preview  # sirve dist/ con PWA activa
npm run check:release  # verifica que dist/ no contenga claves
```

## Arquitectura (fuente de verdad)

- **Dexie = fuente canónica del dominio** (entrenamiento, rutinas, historial, recuperación, nutrición, perfil, Coach, notificaciones, sync queue).
- **Planificación canónica**: `db.cycleVersions` (`savePlanning`/`getActiveVersion`). `profile.cycle` es snapshot legacy de solo lectura; el contenido de cada rutina vive versionado en `routineStore`.
- **Ejecución canónica**: `trainingSessions` + `sessionExercises` + `setRecords` (una sola sesión activa; se readopta si queda huérfana). `sessions`/`setLogs` son capa legacy de solo lectura.
- **Historial honesto**: sin registros reales no se inventa nada (`null`/`[]`/estados vacíos). Los generadores `seeder`/`demoData` son fixtures exclusivos de tests.
- **Coach**: contexto real → Groq mediante proxy (`VITE_GROQ_PROXY_URL`, Cloudflare Worker con `GROQ_API_KEY` server-side) → fallback determinístico local. Sin modelos descargables, sin secretos en el cliente.
- **WGER**: integración externa cerrada (pull público + sync con auth vía Worker); Dexie sigue siendo la fuente de verdad.
- localStorage solo para preferencias UI, cachés y `althea:lastUid`; nunca dominio.
- Cambio de cuenta Firebase en el mismo navegador limpia los datos locales del usuario anterior (multi-dispositivo por `users/{uid}` en Firestore con rules por uid).

## Variables necesarias

Copiar `.env.example` a `.env`. Públicas (`VITE_*`, van al bundle): `VITE_GROQ_PROXY_URL`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`. Ningún secreto va en `VITE_*`.

## Despliegue

`dist/` es estático. Netlify: build `npm run build`, publish `dist`, SPA fallback `public/_redirects`. Firebase Hosting: `public: dist` + rewrites a `/index.html` en `firebase.json` (definir proyecto con `firebase use --add`). PWA: manifest + icons + Workbox precache; offline total salvo IA remota y APIs externas.

## Limitaciones externas reales (no se resuelven desde el repositorio)

- Clave histórica de Groq expuesta: revocar en consola de Groq (y rotar secret del Worker si se genera una nueva).
- Clave de CalorieNinjas: rotar en la consola de la cuenta.
- Validación WGER contra instancia real: requiere cuenta de prueba en wger.de (tests `REQUIRES_CREDENCIALES`).
- Umbrales T032 (Performance ≥85, JS inicial <150 KB gzip): bloqueados por arquitectura (Firebase + Dexie + React en el arranque); ver `docs/PENDIENTES_OTRO_AGENTE.md`.
