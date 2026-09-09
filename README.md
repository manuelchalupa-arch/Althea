# Train PWA — Entrenamiento, Recuperación y Coach IA

PWA móvil-first offline-first instalable en Android (iOS compatible). Coach virtual con motor determinístico + IA opcional vía proxy.

> Responde: **"¿Qué tengo que hacer hoy?"** en <1s sin internet.

## Stack
React 18 + TS + Vite 6 + Tailwind 3 + Dexie (IndexedDB) + Zustand + Recharts + vite-plugin-pwa (Workbox) + react-router-dom 7

## Inicio rápido
```bash
cd train-pwa
npm install
npm run dev      # http://localhost:5173
npm run build    # build + SW precache
npm run preview  # http://localhost:5173 con PWA activa
```

## Flujo PWA
- `public/manifest.webmanifest` + icons 192/512/maskable + shortcuts
- Service Worker precache shell (Workbox generateSW)
- Offline: todos los flujos críticos funcionan (Dexie SSOT)
- Update prompt: banner "Nueva versión disponible"

## Estructura
`src/pages` (Inicio, Entrenar, Progreso, Coach, Más, Biblioteca, Rutinas, Calendario, Nutrición, Recuperación, Onboarding)
`src/services/storage/db.ts` (Dexie v1, 9 tablas, seeds)
`src/utils/calc.ts` (volume, tonnage, recoveryScore determinístico)
`src/stores/profile.ts` (Zustand + persist)

## Constitución
`.specify/memory/constitution.md` — 5 principios: Offline-First, Local-First, Mobile-First, Rules Before AI, User Control

## Spec → Plan → Tasks
`.specify/specs/001-pwa-entrenamiento-mvp/` contiene spec.md (30 FR), plan.md, research.md, data-model.md, contracts/, tasks.md

## Export/Import
Más → Exportar JSON (backup) / Importar JSON (restore con migración) — nunca dependés del servidor.

## Fases
F1 MVP ✅ (PWA, Dexie, ejercicios, rutinas, registro, historial, progresión, calendario, dashboard)
F2 (hidratación/nutrición/recuperación UI ya starter)
F3 motor recomendaciones + periodización, F4 push+sync+IA proxy, F5 export avanzado + gamificación

## Deploy estático
`dist/` listo para Cloudflare Pages / Vercel / Netlify / GitHub Pages (sin backend obligatorio).
