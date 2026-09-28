================================================================================
  FASE 1M-A — NORMALIZACIÓN DE CLAVES DE DÍA LOCALES (ZONA UTC→LOCAL)   COMPLETA
  Proyecto: train-pwa · Criterio: util único src/utils/dates.ts (toDateKey/todayKey)
================================================================================

1. VISIÓN GENERAL
   Reemplazados 16 sitios de producción que derivaban la clave de día con
   `new Date().toISOString().slice(0,10)` (fecha UTC) y `new Date(...)` +
   `.getUTCDay()/getDay()` en anclas UTC por las utilidades LOCALES
   deterministas. `npx tsc --noEmit` LIMPIO. `npx vitest run` 67 archivos,
   551+ tests PASS (incluye dates.test). `npm run build` PASS. eslint 0 errores.
   La clave de día es ahora SIEMPRE "el día del usuario" (ancla local T12),
   no el día UTC del servidor.

2. DOMINIO DE FECHAS (util único + tests nuevos)
   - src/utils/dates.ts: toDateKey/todayKey/dayKeyOffset/daysBetween/
     weekdayOfKey(isDay) — anclas LOCALES (parse T12 local, sin UTC). Intacto.
   - NUEVO src/utils/dates.test.ts (7 tests): local-noon anchoring,
     dayKeyOffset cruza límites mes/año (bisiesto 2024-02-29, dic→ene),
     daysBetween incluye extremos cruzando año, weekday 0=dom, round-trip
     clave→fecha→clave estable, isDateKey formato estricto.
   - Tests de cliente (Calendario.recovery, Entrenar.nav, chatLocalFallback,
     coachIntegration, macroService, nutrition) convertidos de
     `new Date().toISOString().slice(0,10)` → todayKey().
   - Test de dates BOUNDARY (mes/año/fin-de-año): añadido como
     dayKeyOffset('2024-01-01','-1')='2023-12-31' etc. en dates.test.

3. COACH INSIGHTS (services/ai/coachInsights.ts)
   detectRoutineStale (edad de rutina): edad por díasBetween(local), win
   desfasado/máximo 5 días; marcaUTilRutinaStale con todayKey();
   ventana 7d y preludio 14d por dayKeyOffset/todayKey(); semana ISO (Lunes)
   por dayKeyOffset -((weekdayOfKey+6)%7) — determinista, misma-semana-safe.
   createdAt de datos → toDateKey local. IMPORT weekdayOfKey corregido.

4. COACH MEMORY / MEMORY MANAGER
   memoryManager.ts: día de semana local via weekdayOfKey(d.date) (no
   new Date().getDay()); imports actualizados.

5. PATTERN LEARNING / GLOBAL SCORE
   patternLearning.ts: toDateKey(p.sà.createdAt) local (fecha de historial
   vendría UTC). globalScore.ts: hoy via todayKey(); semana local por
   dayKeyOffset+weekdayOfKey; adherencia/gap días por daysBetween+dayKeyOffset
   (loop gapDays). Nombres de utils alineados.

6. PROGRESS ANALYZER
   analyzeExercise/analyzeGlobal: ventanas por dayKeyOffset/todayKey; semanas
   (lunes) via dayKeyOffset -((weekdayOfKey+6)%7); días entre por daysBetween.

7. GROQ USAGE / PUSH / COACH INTEGRATION
   groqUsage.ts + push.ts: límite diario por todayKey() co-drivado con
   dayKeyOffset (mismatch M/N resuelto: ambos locales).

8. CALENDARIO + TESTS
   Calendario.tsx: todayStr = todayKey() local. Tests de recuperación /
   Calendario.recovery utilizan todayKey() (local) — no UTC.

9. NUTRICIÓN / MACRO / TESTS
   Nutricion.tsx: hoy local via todayKey; desviaciones por dayKeyOffset local.
   macroService/nutrition tests fabrican "hoy" con todayKey().
   demoData.ts + migrateLocalStorage.ts: JUSTIFICADO (data demo/migración
   legacy — no tocar por regla demo/migración).

10. REPORT SERVICE / EXPORT
    reportService.ts: rango de períodos por dayKeyOffset local (loop nDays),
    todayKey import correcto; export.ts: filename día → todayKey() local.

11. RUTINA / PERIODIZATION EDITOR
    Rutina.tsx + PeriodizationEditor.tsx: defaults de ciclo (startDate) y
    secuencias semanales vía dayKeyOffset/calendario local — no UTC.

12. PERFIL / ONBOARDING / NUTRICIÓN
    Perfil.tsx, Onboarding.tsx: hoy y bodyMeasurements via todayKey() local;
    imports/demo coherentes con dates.

13. ESTADO FINAL / PENDIENTES JUSTIFICADOS
    - Gates: tsc CLEAN · tests 551 PASS (67) · build PASS · lint 0 err.
    - JUSTIFICADO por regla del plan: demoData.ts (fixtures demo),
      migrateLocalStorage.ts (migración legacy 1-vía), usar fechas UTC
      como INSTANTES (createdAt/updatedAt/completedAt) — se convierten
      con toDateKey; T12-anchored sites (coachInsights semana/selecciones)
      ya correctos.
    - NO iniciado por instrucción: FASE 1M-B (ciclos/migración), FASE 2.
    - BLOQUEADO (require autorización/tú): deploy worker 1L-S y rotación
      de la clave Groq expuesta.
================================================================================
