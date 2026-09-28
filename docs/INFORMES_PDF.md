# Informes PDF — modos, contenido y fuente única de gasto calórico

Estado: vigente (2026-09-28). Código: `src/services/report/reportService.ts`, `src/services/report/reportPdf.ts`, `src/components/report/ReportModal.tsx`.

## 1. Modos

`ReportModal` ofrece tres modos de período, todos generados en el dispositivo, sin conexión:

| Modo | Selector | Rango |
|---|---|---|
| Semanal | `period='7'` | últimos 7 días incluyendo hoy |
| Mensual | `period='30'` | últimos 30 días incluyendo hoy |
| Personalizado | `period='custom'` | `customStart` → `customEnd` (obligatorios) |

Los modos predefinidos calculan su rango real con `daysBetween` (ya no se asume 30/365 fijos). Cada informe declara `range.start/range.end`, `periodLabel` y `isEmpty` cuando el rango no contiene datos reales.

## 2. Secciones y contenido

Categorías seleccionables (`categoriesForSection`): entrenamiento, fuerza, musculos, recuperacion, nutricion.

- **Entrenamiento**: días entrenados, sesiones, volumen, series, repeticiones, adherencia, rendimiento, frecuencia, duración medida, **completadas / incompletas**, **gasto calórico del ejercicio**, distribución por día de la semana, días de mayor y menor actividad, comparación 1.ª vs 2.ª mitad del período, observaciones y destacados.
- **Fuerza**: peso máximo, PRs/1RM (Epley) con columna «Marca» y flag `enPeriodo`, evolución por grupo muscular.
- **Recuperación / Nutrición**: medias del período con estados honestos.
- **Conclusiones** (`buildConclusiones`): sólo hechos derivados de los datos del propio informe. Cuando falta información se escribe explícitamente «Datos insuficientes…»; nunca se rellena con 0 salvo que 0 sea el valor real (p. ej. cero sesiones en el rango).

**Estados vacíos**: «Sin datos» / «Datos insuficientes para estimar» / «Período vacío — no hay datos reales en este rango». No se pintan gráficos ni páginas vacías: cada sección se omite si no tiene contenido real.

**Portada / resumen**: cabecera con identidad Althea, rango, fila de KPIs (volumen, sesiones, adherencia, **gasto del ejercicio**), y secciones en el orden entrenamiento → fuerza → recuperación → nutrición → conclusiones.

## 3. Fuente única de gasto calórico

El gasto del ejercicio se calcula **una sola vez** en `src/services/training/exerciseEnergy.ts` y se consume desde:

1. **Inicio** — tarjeta `inicio-gasto-calorico` (gasto de hoy + acumulado de la semana en curso, lunes→hoy).
2. **Historial** — detalle de día en `Calendario` (`sesion-gasto`, `dia-gasto-total`).
3. **Informes** — `reportService` llama a `computeExpenditure` con el rango del informe; `reportPdf` sólo lo imprime.

Cadena: sesión (`startedAt` → `completedAt|endedAt|completingAt`, o `now` si está en curso) − pausas → duración medida → peso corporal vigente en la fecha (última `bodyMeasurements.weightKg` no demo ≤ fecha) → fórmula MET (Compendium 2024, `EXERCISE_MET = 6.0`, `kcal/min = MET × 3,5 × kg ÷ 200`).

Reglas:

- Se excluyen sesiones demo y `PLANNED/READY/CANCELLED/ABANDONED`.
- Sin duración o sin peso → `null` con motivo (`SIN_DURACION`, `SIN_PESO`, `SESION_NO_REAL`) y texto «Sin datos suficientes para estimar». Nunca se inventan calorías.
- Sin sesiones reales en el rango → `motivo='SIN_SESIONES'` y «Sin sesiones registradas» (0 kcal es correcto aquí).
- Precisión 0,1 kcal en cada sesión y en los totales, para que día, semana e informe coincidan.

**Definición**: es el gasto del ejercicio registrado, **no** el gasto diario total ni el metabolismo basal (BMR/`nutritionEngine` son indicadores distintos y se muestran aparte).

## 4. Tests

- `src/services/training/exerciseEnergy.test.ts` — motor (duración, pausas, fórmula, peso por fecha, motivos, consistencia día/semana).
- `src/pages/Inicio.gasto.test.tsx` — tarjeta de Inicio (hoy + semana, estados vacíos, sin hardcodeo).
- `src/pages/Calendario.gasto.test.tsx` — historial (sesión, día, sin datos).
- `src/services/report/reportService.test.ts` — datos del informe (gasto, completadas/incompletas, conclusiones).
- `src/services/report/reportPdf.test.ts` — PDF (KPI, tabla, distribución, gasto, PRs, conclusiones).
- `src/components/report/ReportModal.test.tsx` — modos 7/30/custom y preview.
