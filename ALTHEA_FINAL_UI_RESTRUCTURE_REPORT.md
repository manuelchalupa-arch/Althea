# ALTHEA — REESTRUCTURACIÓN GLOBAL DE UI

Reestructuración visual y funcional de todas las pestañas de Althea, cerrando en una sola sesión la consolidación de Nutrición, el mapa muscular real de Progreso, la hidratación de botella única, el formulario de seguimiento y el informe por secciones.

**Identidad visual:** marble / gold / Playfair, conservada en todas las pantallas. Sin cambios de marca.

**Regla de datos:** ninguna función crea una fuente de verdad nueva. Todo lee y escribe Dexie y los servicios existentes.

---

## 1. NUTRICIÓN — consolidada

Orden exacto exigido, sin secciones eliminadas:

1. Círculo de macros (segmentos independientes, calorías al centro)
2. Tabla `CALORÍAS | GRASAS | CARBOHIDRATOS | PROTEÍNAS` con filas `OBJETIVO DIARIO` y `CONSUMO DIARIO`
3. Entrada **¿Qué vas a comer?**
4. Resultado editable con cantidades y macros
5. Comidas del día (editar / eliminar)

- Estados de la tabla: `cerca`, `alcanzado`, `excedido`.
- Días locales vía `todayKey()` / `filterEntriesByDay`; nunca `toISOString().slice(0,10)`.
- Objetivos desde `getMacroGoals()`, con metas de referencia rotuladas como tales.
- Persistencia ampliada: `foodId`, `time`, `ingredients`, `updateDiaryEntry()`, `diaryEntryTime()`, `nowLocalTime()`.
- Codulia queda como búsqueda opcional, nunca como fuente única.

## 2. PROGRESO — mapa muscular real

- `MuscleMapPanel` a ancho completo como protagonista, bajo la fila de KPIs.
- Mapa frontal/posterior SVG con los cinco grupos: `PECHO`, `ESPALDA`, `PIERNAS`, `BRAZOS`, `HOMBROS`.
- Semántica de semanas: la **primera semana completa** del ciclo es `BASE`; cada semana posterior se compara con la anterior; el **estado actual** se muestra aparte, en vivo.
- Tendencias: rojo = descenso, amarillo = estable (±5 % con `STABLE_THRESHOLD_PCT`), verde = aumento.
- Comparación construida sobre **todo el historial** (`unifiedAllCompletedSets()` + `getCanonicalCycle()`), no sobre el filtro de período de la pantalla.
- Atribución: `custom → seed → biblioteca activa → id "muscle/slug"`, con `sourceOf()` visible en el modelo.
- `abs`, `cardio` y ejercicios desconocidos **no se imputan** a un grupo; las series sin atribución se informan aparte (`unmappedSets`).
- Raíl derecho compacto con medidas, peso, resumen nutricional y recuperación; el mapa inline duplicado fue eliminado.

## 3. HIDRATACIÓN — una sola botella

- `WaterBottle` SVG con cuello, tapa, cuerpo, marcas y clip de llenado proporcional a `consumido / objetivo`.
- Lectura `1.200 ml / 2.000 ml` con objetivo real de `getCalculatedHydrationGoal()`; nunca 2.5 L hardcodeado.
- Quick-add por botella activa contra `completeBottle()`; actualización inmediata.
- `BottleConfigEditor` separado: solo capacidades, nombres y estado activo.
- Integrada en `Nutricion` (por `activeDate`) y en `Recuperacion`.
- `Inicio` dejó de dibujar su propio widget de 5 cuadrados con objetivo fijo: ahora usa la misma botella y el mismo objetivo calculado.
- **Escritura única:** `addHydrationMl()` es el único punto de alta. `addHydration()` delega ahí, así que un "+250 ml" se ve igual en la botella, en Inicio, en los informes y en las notificaciones. El volumen suelto usa el bucket sintético `MANUAL_BOTTLE_ID`: suma al total del día sin inventar una botella en el desglose.
- **Duplicidad eliminada:** `HydrationBottlesWidget.tsx`, `HydrationWidget.tsx` y el store de caché `src/stores/profile.ts` fueron borrados. No queda una segunda interfaz, una segunda caché ni una segunda ruta de escritura.

## 4. INFORME — 4 secciones, 3 períodos

- Períodos: `SEMANAL → '7'`, `MENSUAL → '30'`, `PERSONALIZADO → 'custom'`. Se eliminaron los botones de 90 días, año y "todo".
- Secciones independientes: `MEDICIONES`, `ENTRENAMIENTO`, `NUTRICIÓN`, `RECUPERACIÓN`.
- `ENTRENAMIENTO` se expande internamente a `['entrenamiento','fuerza','musculos']` mediante `categoriesForSection()`, conservando los cálculos ya existentes.
- Las cuatro secciones juntas producen **`INFORME COMPLETO`** (`isCompleteReport()`), visible como badge en la UI y en el encabezado del informe.
- `mediciones` es una categoría nueva calculada desde `db.bodyMeasurements`: peso (inicial, final, delta, mín, máx), % grasa, masa muscular y perímetros de pecho/cintura/cadera. Sin datos → sección ausente, nunca ceros inventados. Los registros `isDemo` se excluyen.

## 5. SEGUIMIENTO — formulario manual por período

- `FollowUpForm` integrado en Progreso, detrás del botón **Seguimiento**.
- Períodos `SEMANAL`, `MENSUAL`, `PERSONALIZADO` con rango visible (`desde → hasta`) y fechas propias en el caso personalizado.
- Datos manuales: peso, % grasa, masa muscular, pecho, cintura, cadera, sueño, energía, fatiga, dolor, ánimo, motivación, estrés, esfuerzo y notas.
- **No duplica datos automáticos:** no toca series, volumen, 1RM ni estimación de macros.
- Escribe en las tablas que ya consumen Progreso, informes y coach:
  - medidas → `db.bodyMeasurements` con id determinista `followup-<fecha>` (actualiza el día, no duplica filas, conserva `createdAt`);
  - recuperación → `updateRecoveryCheck()` sobre `db.recoveryChecks`.
- El índice de recuperación se calcula con la fórmula oficial `recoveryIndex()` **solo si el registro ya tiene los 7 campos**; nunca se inventan valores para completarlo.

## 6. RESTO DE PANTALLAS

- `Inicio`: hidratación unificada en `WaterBottle` + objetivo real; eliminados los 5 cuadrados de 500 ml y el objetivo 2.5 L fijo.
- Onboarding, Login y Perfil: se mantuvo el flujo y la identidad; el Perfil sigue siendo la fuente de medidas de referencia.
- `Mas`, `Entrenar`, `Coach`, `Rutina`, `Calendario`, `Biblioteca`: auditoría de duplicidades de fuente y de objetivos hardcodeados; no se introdujeron servicios nuevos.

---

## 7. LO QUE NO SE INTRODUJO

- Sin fotografía, sin análisis de imágenes, sin API Ninjas, sin CalorieNinjas, sin servicios de pago.
- Sin datos ficticios, placeholders ni botones muertos.
- Sin una segunda fuente de hidratación, nutrición o entrenamiento.
- `src/services/nutrition/foodProvider.ts` y `src/services/nutrition/ninjaService.ts` permanecen sin caller en la UI: no se conectaron.

## 8. ARCHIVOS CLAVE

| Área | Archivos |
|---|---|
| Nutrición | `src/pages/Nutricion.tsx`, `src/components/nutrition/MacroRing.tsx`, `src/components/nutrition/DishComposer.tsx`, `src/services/nutrition/*`, `src/services/storage/diaryStore.ts` |
| Progreso / músculo | `src/pages/Progreso.tsx`, `src/components/progress/MuscleMap.tsx`, `src/components/progress/MuscleMapPanel.tsx`, `src/services/training/muscleGroups.ts`, `src/services/training/muscleAttribution.ts`, `src/services/exerciseGym.ts`, `src/utils/cycle.ts` |
| Hidratación | `src/components/recovery/WaterBottle.tsx`, `src/components/recovery/BottleConfigEditor.tsx`, `src/services/recovery/hydrationBottles.ts`, `src/services/recovery/recoveryService.ts`, `src/pages/Recuperacion.tsx` |
| Informe | `src/services/report/reportService.ts`, `src/components/report/ReportModal.tsx` |
| Seguimiento | `src/components/followup/FollowUpForm.tsx`, `src/services/followup/followUpService.ts`, `src/services/followup/periods.ts` |
| Tests | `src/utils/cycleWeek.test.ts`, `src/services/training/muscleGroups.test.ts`, `src/components/progress/MuscleMapPanel.test.tsx`, `src/components/recovery/WaterBottle.test.tsx`, `src/components/report/ReportModal.test.tsx`, `src/services/followup/followUpService.test.tsx` |

## 9. GATES

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errores |
| `npx vitest run` | PASS — **811/811** tests en 91 archivos |
| `npm run build` | PASS — construido en ~9 s, PWA `generateSW` |
| `npm run lint` | 0 errores; 181 warnings (baseline previo: 204) — ninguno nuevo |
| `npm run check:release` | PASS — sin claves de API embebidas en `dist/` (98 archivos) |

`npm run lint` sigue devolviendo código de salida 1 por `--max-warnings 0` debido a warnings preexistentes del repositorio; la cantidad total bajó de 204 a 181, es decir, esta sesión no agregó ninguno.

## 10. NOTA SOBRE `ALTHEA_FINAL_CLOSURE.md`

Ese documento contiene una afirmación obsoleta: da por integrado un proveedor CalorieNinjas que la UI nunca usa. Este reporte lo corrige: el proveedor externo de comidas no está conectado; Codulia es opcional y `foodProvider.ts` / `ninjaService.ts` quedan sin caller.

REESTRUCTURACIÓN GLOBAL COMPLETADA
