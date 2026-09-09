# Tasks: PWA Entrenamiento MVP

**Input**: spec.md, plan.md, research.md, data-model.md, contracts/
**Prerequisites**: plan aprobado, Dexie como SSOT

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Crear estructura proyecto `train-pwa/` con Vite+React+TS (vite.config.ts con PWA, tailwind.config.js, tsconfig.json)
- [ ] T002 [P] Instalar dependencias: dexie, zustand, vite-plugin-pwa, recharts, react-router-dom, date-fns, lucide-react, zod, @dnd-kit/sortable, uuid
- [ ] T003 [P] Configurar Tailwind + ESLint + manifest.webmanifest + icons 192/512

## Phase 2: Foundational (Bloqueante)

- [ ] T004 Implementar `src/services/storage/db.ts` Dexie v1 con 13 tablas + liveQuery helpers
- [ ] T005 [P] Implementar `src/types/index.ts` + Zod validators + utils `volume`, `recoveryScore`, `format`
- [ ] T006 [P] Crear `src/data/exercises.json` seed 80+ ejercicios + `src/services/storage/seeds.ts`
- [ ] T007 Crear stores Zustand base: `useProfileStore`, `useUIStore` con persist prefs
- [ ] T008 Configurar `src/App.tsx` router + `components/layout/BottomNav.tsx` (Inicio|Entrenar|Progreso|Coach|Más) + ServiceWorker register
- [ ] T009 [P] Configurar `vite-plugin-pwa` Workbox precache + prompt actualización + tests unitarios volume/recoveryScore

**Checkpoint**: `npm run dev` levanta shell vacía offline, Dexie abre sin errores, BottomNav navega.

## Phase 3: US1 – Entrenar offline y ver progreso (P1) 🎯 MVP

- [ ] T010 [P] [US1] Implementar `features/training/services/sessionService.ts` (startSession, logSet, finishSession, historial) + cálculo volumen/tonelaje/PR
- [ ] T011 [P] [US1] Crear página `pages/Inicio.tsx` dashboard "¿Qué hacer hoy?" (rutina del día, progreso, hidratación, fatiga)
- [ ] T012 [US1] Crear `pages/Entrenar.tsx` + `features/training/components/ActiveSession.tsx` (lista ejercicios, input peso/reps/RPE, botón completar, muestra última vez + objetivo sugerido)
- [ ] T013 [US1] Crear `pages/Progreso.tsx` con Recharts (volumen por sesión, evolución por ejercicio) + `pages/Calendario.tsx` mensual
- [ ] T014 [US1] Implementar `utils/progression.ts` sugerencia determinística (última sesión vs promedio vs PR) + tests

**Checkpoint US1**: En modo avión, registrar sesión completa, verificar persistencia tras reload y gráficos.

## Phase 4: US2 – Rutinas y biblioteca con variantes (P1)

- [ ] T015 [P] [US2] Crear `pages/Biblioteca.tsx` + `features/training/components/ExerciseCard.tsx` con búsqueda/filtros (grupo, equipo, nivel)
- [ ] T016 [US2] Crear `pages/Rutinas.tsx` + `features/training/components/RoutineBuilder.tsx` con @dnd-kit/sortable + fallback ↑/↓
- [ ] T017 [US2] Implementar `services/ai/variantService.ts` (mismo patrón/grupo/equipo) + `features/training/components/VariantPicker.tsx`
- [ ] T018 [US2] Implementar `features/training/components/PainToggle.tsx` + PainLog + advertencia si dolor severo

## Phase 5: US3 – Hidratación, nutrición y recuperación (P2)

- [ ] T019 [P] [US3] Crear `features/hydration/components/HydrationWidget.tsx` (presets 250/500/750/custom) + `features/hydration/store.ts`
- [ ] T020 [P] [US3] Crear `features/nutrition/pages/Nutricion.tsx` (registro cualitativo + macros opcionales)
- [ ] T021 [P] [US3] Crear `features/recovery/pages/Recovery.tsx` check-in diario + `utils/recoveryScore.ts` 0-100 + semáforo
- [ ] T022 [US3] Crear `features/recovery/components/SleepForm.tsx` (bed/wake, calidad, tendencias)

## Phase 6: US4 – Coach y periodización (P2)

- [ ] T023 [P] [US4] Implementar `services/ai/localEngine.ts` (LocalAIEngine) + `utils/deload.ts` + `features/coach/pages/Coach.tsx`
- [ ] T024 [US4] Crear `components/RecommendationCard.tsx` con "¿Por qué?" + guardar decisión accepted/rejected/modified
- [ ] T025 [US4] Implementar `features/training/components/PeriodizationEditor.tsx` (micro/meso/macro bloques)

## Phase 7: US5 – PWA instalable y primer uso (P1)

- [ ] T026 [P] [US5] Crear `pages/Onboarding.tsx` 7 pasos (objetivo, nivel, días, equipo, horario, coach, notifs) sin cuenta
- [ ] T027 [US5] Configurar `public/manifest.webmanifest` (name, short_name, icons 192/512 maskable, shortcuts, screenshots) + `public/icons/*`
- [ ] T028 [US5] Implementar `services/storage/demoData.ts` (Cargar/Eliminar datos demo multi-semana) + `services/storage/exportImport.ts` JSON/CSV

## Phase 8: Polish & Cross-Cutting

- [ ] T029 [P] Accesibilidad (contraste, 44px targets, ARIA, teclado) + responsive audit
- [ ] T030 [P] Notificaciones `services/notifications/push.ts` (máx 2/día, suppress si completado) + `notificationLog`
- [ ] T031 [P] Tests integración: offline flow, import/export roundtrip, recoveryScore
- [ ] T032 Validar `quickstart.md` + Lighthouse PWA≥90 + bundle <150KB gzip + `npm run build` sin errores

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1/US2/US5 en paralelo tras checkpoint → US3 → US4 → Polish
- Dentro de cada US: models/stores → services → components/pages → integración

## Parallel Opportunities

- T002, T003 en paralelo
- T005, T006 tras T004
- Tras Phase 2, T010/T015/T026 pueden ir en paralelo (distintos archivos)
