# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
delegated: React 18 + TypeScript + Vite 6 + Tailwind CSS 3 + Dexie/IndexedDB (local-first) + Firebase Auth/Sync (cuando está configurado) + Workbox PWA

## Users
Persona que entrena de forma regular en gimnasio, desde nivel principiante hasta intermedio/avanzado, busca guía integral para planificar y registrar entrenamientos, controlar recuperación y nutrición, y analizar progreso longitudinal con apoyo de Coach IA sin depender de entrenador personal. La utiliza principalmente **antes, durante y después del entrenamiento**, y para revisar evolución. Audiencias secundarias: usuarios nuevos sin historial (estado vacío) y usuarios en modo demo.

## Product Purpose
Althea permite **planificar rutinas, ejecutar sesiones, registrar nutrición e hidratación, evaluar recuperación, visualizar progreso con mapa anatómico, y generar informes**. Existe para dar disciplina y claridad con datos reales, sin inventar métricas ni automatizar decisiones. Éxito = usuario entiende qué hacer hoy, cómo está y cómo progresa, y completa el flujo `Rutina → Sesión → SetRecord → Historial → Progreso/Informe` sin perder datos.

## Positioning
Mecanismo diferencial: **PWA offline-first local-first con Dexie como fuente de verdad, historial deduplicado, periodización versionada, y Coach IA que lee datos reales sin inventar** y genera rutina/informe sólo con ejercicios verificados. Ningún clon SaaS genérico puede copiar el historial longitudinal real + mapa muscular con carga por grupo calculada desde volumen ejecutado + informes PDF oficiales con identidad mármol/dorado manteniendo paleta.

## Operating Context
- Flujo diario: Inicio (qué hacer/ cómo estoy) → Entrenar (ver→registrar→continuar, con descanso) → Recuperación/Hidratación/Nutrición → Calendario (ficha del día) → Progreso (vista resumida) → Informes (detalle PDF)
- Entornos: gimnasio (mobile 390/375/360 touch 48px), tablet 768/834, desktop 1024/1280/1440
- Herramientas: rutinas con `trainingDays/weekMap/weekLoads`, `SessionExercise/SetRecord` con `planned vs realizado`, botellas configurables, diario `nutritionDiary`, `recoveryChecks`
- Rituales: check-in recuperación diario, registro botellas por fecha, planificación semanal con estados NORMAL/SOBRECARGA/CARGA_REDUCIDA/CARGA_CERO

## Capabilities and Constraints
**Capacidades confirmadas:** Rutinas con días/ejercicios/series/peso/reps; `TrainingSession` máquina estados `PLANNED→COMPLETED/PARTIAL` versionada; `unifiedAllCompletedSets` deduplicado; PR/1RM Epley; `muscleLoadOf/partVolumeOf`; periodización `cycleVersions`; notificaciones `unifiedNotifConfigs` con `requiredAction` pending/completed; hidratación botellas; macros con `macroStatus`; informe `generateReport(period, categorías)` client-side con `serieDiaria` (volumen por día), modos **semanal (7) / mensual (30) / personalizado** con rango real por `daysBetween`, secciones seleccionables, completadas/incompletas, distribución, observaciones, destacados, PRs y conclusiones; **gasto calórico del ejercicio** con motor único `src/services/training/exerciseEnergy.ts` (duración medida − pausas × peso registrado → MET 6.0 Compendium 2024) compartido por Inicio, historial e informes, con estados honestos `Sin datos suficientes para estimar` / `Sin sesiones registradas`; calendario ficha `Fecha→Estado→Entrenamiento→Nutrición→Recuperación→Progreso`; Dexie v20, `routineStore`, `sessionStore`, `diaryStore`; catálogo Wger sincronizable desde Biblioteca (`syncWger`, comparación `wgerComparison`, `DECISION=MANTENER_AMBAS`); carga en KG/LB con kg canónico y unidad original preservada (`loadModel`, `actualLoadText`); ErrorBoundary global y por página.

**Restricciones duraderas:** Preservar gama cromática Althea (mármol/blanco roto/grises cálidos/grafito/dorado-bronce + acentos verde/azul suaves, sin neón/violeta), tipografía Cormorant Garamond (marca) + Inter (datos), no inventar datos, `Dexie → Servicios → Cálculos → UI` (nunca `UI → números escritos`), no segunda fuente de verdad, no tocar lógica sesiones/estados/historial/PR/periodización/Coach memoria/sync/migraciones, no borrar tablas Dexie, no modificar Firebase/auth innecesariamente, rutas `/`, `/entrenar`, `/progreso`, `/calendario`, `/nutricion`, `/recuperacion`, `/rutina`, `/biblioteca`, `/perfil`, `/coach`, `/mas` se mantienen.

**Terminología:** `Rutina → Día → Ejercicio → Serie` (SessionExercise/SetRecord), `plannedSets/plannedReps/plannedWeight` vs `actualReps/actualWeight`, `Sesiones = días únicos`, `Sin datos suficientes` como estado vacío.

**Indecisos explícitos:** Ninguno material pendiente; estética puede evolucionar libremente salvo paleta.

## Brand Commitments
Nombre `Althea`, paleta actual mármol/blanco roto/grises cálidos/negro-grafito/dorado-bronce + acentos verde/azul suaves discretos, tipografía Cormorant Garamond (serif marca) + Inter (sans datos), estética clásica+deportiva+tecnológica+elegante, sin neón/gradientes agresivos/violeta/gamer/cyberpunk/glassmorphism excesivo. Referencia visual: imagen clásica anatómica mármol + dorado, limpia editorial, con datos.

## Evidence on Hand
- Código: `src/pages/Entrenar.tsx`, `src/pages/Progreso.tsx`, `src/pages/Calendario.tsx`, `src/pages/Nutricion.tsx`, `src/services/training/sessionMetrics.ts`, `src/services/training/exerciseFilter.ts`, `src/services/training/exerciseEnergy.ts` (motor único de gasto calórico), `src/utils/cycle.ts`, `src/services/report/reportService.ts`, `src/components/entrenar/ExerciseSeriesTable.tsx`, `src/services/integrations/wger/wgerComparison.ts`
 - Datos: `src/services/storage/db.ts` v20, `src/data/exercises.json` (10 ejercicios locales, catálogo real remoto `ExerciseGymGifsDB`), `ExerciseGymGifsDB` v1.1.0, catálogo Wger sincronizable
 - Tests: 124 archivos de test / 1041 tests declarados / 1041 ejecutados / 1041 aprobados / 0 fallidos (gates: `tsc` 0 errores, `vitest` verde, `build` PASS, `lint` **exit 0 — 0 errores / 0 warnings**; los 166 warnings históricos fueron corregidos el 2026-09-28 sin tocar la config de ESLint)
 - Informes: `docs/INFORMES_PDF.md` (modos, contenido, fuente única de gasto)
 - Lighthouse (2026-09-28, LH 11.7.1 sobre `npm run preview`): **PWA 100/100 ✓**, Performance 75/100 (SC-001 pide ≥85), JS inicial ≈400 KB gzip (objetivo <150 KB) → T032 **PARCIAL**; ver `docs/history/althea/ALTHEA_FINAL_CLOSURE.md` §14
 - Credenciales: verificación local completa en `docs/history/althea/ALTHEA_FINAL_CLOSURE.md` §13; pendientes sólo 2 revocaciones externas (§11)
 - Cierre: `docs/history/althea/ALTHEA_CIERRE_COMPLETO_FASE_A_B_C.md` (decisiones y sustituciones)
- Demo: tablas con `isDemo` flag, identificables

## Product Principles
1. **Dato real sobre estética** — nunca inventar métrica para que un gráfico se vea lleno.
2. **Planificado vs realizado separados** — la planificación no se reescribe por la ejecución.
3. **Local-first y reversible** — Dexie es verdad, cada cambio es editable y versionado.
4. **Claridad antes que densidad** — una pregunta por gráfico, jerarquía L1→L4, no "todo es una card".
5. **Coach asiste, no decide** — recomienda con contexto, el atleta decide.

## Accessibility & Inclusion
Contraste suficiente, focus visible `ring-primary/30`, `prefers-reduced-motion` respetado, touch 48px en Entrenar, no depender solo de color (iconografía+texto+forma), labels claros y aria, gráficos con equivalente textual, legible en 360-1440px.

