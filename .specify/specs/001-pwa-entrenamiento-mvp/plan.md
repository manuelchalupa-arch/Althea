# Implementation Plan: PWA Entrenamiento MVP

**Branch**: `001-pwa-entrenamiento-mvp` | **Date**: 2026-09-07 | **Spec**: `spec.md`

**Input**: spec 001 con 30 FRs, offline-first, local-first, mobile-first, motor determinístico + IA opcional.

## Summary

Construir PWA React+TS+Vite offline-first que responda "¿Qué tengo que hacer hoy?" en <1s sin internet. F1 MVP entrega: shell instalable, Dexie/IndexedDB como fuente de verdad, biblioteca ejercicios, constructor rutinas drag&drop, registro de series con volumen/PR, dashboard, calendario, historial y progresión determinística. IA y sync quedan como módulos stub para F3/F4.

## Technical Context

**Language/Version**: TypeScript 5.7, React 18.3, Vite 6, Node 20
**Primary Dependencies**: Dexie 4, Zustand 5, Tailwind 3.4, vite-plugin-pwa 0.21 (Workbox), Recharts 2.x, react-router-dom 7, date-fns, lucide-react
**Storage**: IndexedDB via Dexie (tablas versionadas), CacheStorage via Workbox, localStorage solo prefs
**Testing**: Vitest + Testing Library + Playwright (e2e offline)
**Target Platform**: PWA Android Chrome 110+ (primary), iOS Safari 17+ (limited), Desktop Chrome/Edge
**Project Type**: PWA SPA static + optional backend proxy (F4)
**Performance Goals**: TTI <1.5s en 3G lento Moto G4, bundle inicial <150KB gzip, Lighthouse PWA≥90 Performance≥85, IndexedDB read <50ms
**Constraints**: Sin backend obligatorio F1-F3, sin claves en frontend, sin trackers, <2 notifs/día, WCAG AA
**Scale/Scope**: 1 PWA, ~15 rutas, 80+ ejercicios seed, 10 stores, 12 componentes core, F1 ~8 semanas

## Constitution Check

- **I Offline-First**: PASS – Dexie como SSOT, SW precache shell, queue sync stub.
- **II Local-First & Privacy**: PASS – no auth obligatoria, exports, datos sensibles solo local.
- **III Mobile-First & Budget**: PASS – budget <150KB, nav inferior, SVG primero.
- **IV Rules Before AI**: PASS – `services/progression/` determinístico separado de `services/ai/` stub.
- **V User Control**: PASS – Recommendation entity con decision field, "¿Por qué?" explicable.
*Gate aprobado – continuar a Phase 0/1.*

## Project Structure

### Documentation (this feature)

```text
.specify/specs/001-pwa-entrenamiento-mvp/
├── spec.md
├── plan.md              # este archivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
└── contracts/           # Phase 1
```

### Source Code (repository root: train-pwa/)

```text
train-pwa/
├── index.html
├── vite.config.ts        # PWA + code splitting
├── tailwind.config.js
├── tsconfig.json
├── public/
│   ├── manifest.webmanifest
│   ├── icons/ (192,512,maskable)
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx            # router + layout
│   ├── components/        # ui, layout, charts
│   ├── pages/             # Inicio, Entrenar, Progreso, Coach, Mas, Onboarding
│   ├── features/
│   │   ├── training/      # exercises, routines, sessions, progression
│   │   ├── nutrition/
│   │   ├── hydration/
│   │   ├── recovery/
│   │   ├── coach/
│   │   └── progress/
│   ├── services/
│   │   ├── storage/       # db.ts (Dexie), seeds
│   │   ├── sync/          # queue stub
│   │   ├── ai/            # engine stub + rules
│   │   └── notifications/ # push stub
│   ├── stores/            # zustand slices
│   ├── hooks/
│   ├── utils/             # volume, recoveryScore, periodization
│   ├── types/
│   ├── data/              # exercises.json seed
│   └── workers/           # (futuro)
└── tests/
    ├── unit/
    └── integration/
```

**Structure Decision**: Single SPA PWA en `train-pwa/` (no backend en F1). Modular por features + services, siguiendo §47 del spec.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Dexie wrapper + multiple tables en v1 | Offline SSOT requiere migraciones controladas | localStorage no soporta volumen/queries complejas |
| vite-plugin-pwa + Workbox | Cache offline confiable y updates seguros | Service Worker manual propenso a bugs de versionado |
