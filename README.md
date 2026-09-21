# Althea — Entrenamiento, Recuperación y Coach IA

PWA móvil-first offline-first instalable en Android (iOS compatible). Coach virtual con motor determinístico + IA opcional vía proxy.

> Responde: **"¿Qué tengo que hacer hoy?"** sin internet.

## Stack
React 18 + TS + Vite 6 + Tailwind 3 + Dexie (IndexedDB, v18) + Zustand + Recharts + vite-plugin-pwa (Workbox) + react-router-dom

## Inicio rápido
```bash
cd train-pwa
npm install
npm run dev      # http://localhost:5173
npm test -- --run
npm run build    # build + SW precache
npm run lint
npm run preview  # http://localhost:5173 con PWA activa
```

## Arquitectura (fuente de verdad)
- **Dexie = fuente canónica del dominio** (entrenamiento, rutinas, historial, recuperación, nutrición, perfil, Coach, notificaciones, sync queue).
- Lectura unificada y deduplicada del historial (`services/history.ts`): oficial + legacy sin contar dos veces.
- Planificado vs ejecutado siempre separados; el historial es inmutable.
- Versionado: planificación (`cycleVersions`) y rutinas (snapshots `vN`) preservan el pasado.
- Zustand/localStorage solo para preferencias UI y cachés; nunca dominio.
- Firebase solo transporte/backup con cola idempotente y política de conflictos por entidad.

## Flujo PWA
- `public/manifest.webmanifest` + icons 192/512/maskable + shortcuts
- Service Worker precache shell (Workbox generateSW)
- Offline: todos los flujos críticos funcionan (Dexie); banner de modo offline
- Al recuperar conexión: sube operaciones pendientes sin duplicar
- Update prompt: banner "Nueva versión disponible"

## Estructura
`src/pages` (Inicio, Entrenar, Progreso, Coach, Más, Biblioteca, Rutina, Calendario, Nutricion, Recuperacion, Perfil, Onboarding, Login)
`src/services/storage/db.ts` (Dexie: sesiones, sets, rutinas, recovery, nutrición, perfil, coach, notificaciones, sync)
`src/services/training/` (sessionStore, metrics, prs, muscleAttribution, customExercises)
`src/services/ai/` (motores determinísticos + contexto Coach + memoria Dexie)
`src/services/sync/` (cola idempotente + motor) y `src/services/firebase/` (transporte)
`src/services/notifications/` (scheduler Dexie + gates por datos reales)

## Export/Import
Perfil → Exportar JSON (backup con versión/schema) / Importar JSON (merge idempotente por id, con verificación). Nunca dependés del servidor.

## Deploy estático
`dist/` listo para Cloudflare Pages / Vercel / Netlify / GitHub Pages (sin backend obligatorio).
