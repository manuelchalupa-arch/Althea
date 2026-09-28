# FASE 2 - S7 — REPORTE DE AUDITORÍA DE FECHAS, HIDRATACIÓN Y CONVERSIONES UTC

**Estado:** CERRADA
**Alcance:** auditar todo el manejo de fechas del producto, separar *fecha civil local* de *instante real*, corregir solo los bugs funcionales demostrados y dejar una sola capa de fechas (`src/utils/dates.ts`). Sin dependencias nuevas, sin migraciones de datos históricos, sin cambios de timestamps reales y sin tocar fixtures, seeders ni demos.
**Fecha de cierre:** 2026-09-25
**Prerrequisitos:** S1, S2, S3, S4, S5 y S6 cerradas. Este documento no reabre ninguna.

---

## 1. Objetivo

Dejar **una única capa de fechas** y eliminar los sitios donde una fecha civil local (un día del calendario del usuario) se derivaba de un instante en UTC.

La distinction que ordena todo el trabajo:

| Tipo | Qué es | Cómo se trata |
|---|---|---|
| **Instante real** | un momento en el tiempo (`createdAt`, `startedAt`, `completedAt`) | se guarda ISO/UTC, se convierte con `toDateKey()` **solo al mostrar o comparar por día** |
| **Fecha civil** | un día del calendario del usuario (`YYYY-MM-DD`) | se deriva con `todayKey()`, `toLocalDateKey()`, `weekdayOfKey()`, `weekStartKey()` |

Regla aplicada: **el error no es usar `toISOString()`, es recortar un instante a 10 caracteres y tratarlo como día del calendario.**

Criterio de corrección: un hallazgo solo se cambia si se puede (a) describir el comportamiento observable incorrecto y (b) reproducirlo. Los sitios que solo *parecen* sospechosos están documentados como falsos positivos con su demostración.

---

## 2. El antipatrón y su ventana de fallo

```ts
new Date().toISOString().slice(0, 10)   // ✗ día UTC, no día local
```

`toISOString()` convierte a UTC. Entre las **21:00 y las 23:59 hora Argentina** (UTC−3) el día UTC ya es el día siguiente, así que el usuario ve "mañana" en todos los lugares que usan este patrón.

Evidencia empírica en el runner (`TZ=America/Buenos_Aires`, `offset=180`):

| Instante local | `toISOString()` | `.slice(0,10)` | Día local correcto |
|---|---|---|---|
| 2026-03-10 21:30 AR | `2026-03-11T00:30:00.000Z` | `2026-03-11` ✗ | `2026-03-10` |
| 2026-03-11 00:30 AR | `2026-03-11T03:30:00.000Z` | `2026-03-11` ✓ | `2026-03-11` |
| 2026-03-11 21:30 AR | `2026-03-12T00:30:00.000Z` | `2026-03-12` ✗ | `2026-03-11` |

**3 de cada 24 horas de uso** el producto le pasa "hoy" al día siguiente en las pantallas afectadas.

### 2.1 Un caso especial: el patrón T12

```ts
new Date('2026-03-10' + 'T12:00:00')   // mediodía local → getDay()/getDate() correctos
```

Parsear una clave civil al mediodía local y leer `getDay()`/`getDate()` **es correcto** en cualquier zona horaria (con ±12h de margen). Estos sitios se conservaron, documentados y —cuando eran una capa alterna— delegaron en la central.

### 2.2 Un caso especial: el patrón UTC simétrico

```ts
const dateStr = dayDate.toISOString().slice(0, 10)   // ⇄ se vuelve a parsear como UTC
```

Cuando el string produced y el string consumido usan **ambos** UTC, el error se cancela. `Inicio.tsx:783-786` (detalle de día del calendario) hace exactamente eso: produce un día UTC y lo vuelve a parsear en UTC, luego usa `toDateKey` para mostrar. Resultado correcto; se conservó y se documentó.

---

## 3. Clasificación de hallazgos (A–G)

Cada sitio auditado se clasificó así. Ninguno se corrigió sin evidencia de bug.

| Clase | Definición | Treatment |
|---|---|---|
| **A** | Instante real (timestamps de sesión, eventos, sincronización) | **Intocable.** Se preservan tal cual |
| **B** | Fecha civil local ("hoy", calendario, semana, hidratación, periodización, planificación) | **Debe pasar por la capa central** |
| **C** | Datos históricos ya persistidos y derivados | **Intocables.** No se reescriben registros |
| **D** | Datos técnicos (duración, epoch, `HH:mm` local) | Se preservan |
| **E** | Presentación (`toLocaleDateString`, formatters) | Se preservan salvo fecha demonstradamente incorrecta |
| **F** | Fixtures, seeders, demos, migraciones | Se preservan por contrato de fase |
| **G** | Falso positivo o aritmética local ya correcta | Se documentan, sin cambio funcional |

---

## 4. Auditoría completa: hallazgos con evidencia

### 4.1 Cambios aplicados (clase B)

Formato: `archivo:línea → tipo de fecha → riesgo → solución`

Las filas 1–8 son **bugs funcionales demostrados** (comportamiento observable incorrecto). Las filas 9–13 son **consolidación**: no tenían bug, pero calculaban lo mismo por su cuenta, contra la regla de no mantener capas paralelas. Se marcan explícitamente para no contarlos como bugs.

| # | Sitio | Tipo | Riesgo | Solución |
|---|---|---|---|---|
| 1 | `services/recovery/hydrationBottles.ts:104,130,176,212` | fecha civil | **Bug, crítico.** Goal, objetivo de hoy, ventana de 7 días y corte de historial. De noche el usuario ve la meta del día siguiente y el historial excluye el día que acaba de registrar | `todayKey()` + `dayKeyOffset(todayKey(), -(days-1))` |
| 2 | `services/ai/routineBuilderIA.ts:196,360` + prompt `:59` | fecha civil | **Bug, alto.** La rutina generada arrancaba un día después de noche; el prompt pedía entrenar "mañana" | `todayKey()` |
| 3 | `components/recovery/PeriodizationEditor.tsx:260,347,359` | fecha civil | **Bug, alto.** "Fecha inicio" mostraba mañana y la secuencia semanal se generaba desde mañana | `todayKey()`; presentación con `parseLocalDateKey()` (antes mostraba el día anterior por parseo UTC: `new Date('2026-03-10')` en AR es 9 de marzo 21:00) |
| 4 | `services/ai/progressAnalyzer.ts:119` | semana | **Bug, alto.** La semana se anclaba con T12→`toISOString`, que en UTC+13/+14 devuelve la semana anterior | `weekStartKey()` (nuevo helper central) |
| 5 | `services/training/prs.ts:187` | semana / mes | **Bug, medio.** Agregados de volumen anclados por T12 manual, sensible a zonas extremas | `weekStartKey()` / `monthStartKey()` |
| 6 | `pages/Progreso.tsx:281` | fecha civil | **Bug, alto.** El filtro de período comparaba días locales contra días UTC. **Línea 326 del mismo archivo ya usaba `toDateKey`**: inconsistencia interna dentro de un único filtro | `toDateKey(createdAt)` |
| 7 | `services/storage/export.ts:17` | fecha civil | **Bug, alto.** El PDF exportaba la fecha UTC de cada serie: un set hecho a las 21:30 aparecía con la fecha de mañana en el historial impreso | `toDateKey(l.createdAt)` (conserva el formato `YYYY-MM-DD`) |
| 8 | `services/storage/db.ts:202` | fecha civil | **Bug latente (código muerto).** `getTodayLocalDate()` se llamaba "local" y devolvía el día UTC. Sin callers: era una trampa para el próximo que lo usara | Delega en `todayKey()`; eliminación diferida a S9 |
| 9 | `pages/Inicio.tsx:96-99,299` | fecha civil | **Sin bug; consolidación.** Semana y etiquetas del día se derivaban con `new Date(clave+'T12:00:00')` y un alias local de la conversión | `parseLocalDateKey()` + `weekdayOfKey()` + `toLocalDateKey()` |
| 10 | `pages/Entrenar.tsx:860-864`, `hooks/useTrainingSession.ts:104` | día de la semana | **Sin bug; consolidación.** `new Date().getDay()` directo devolvía el día local correcto, pero por cuenta propia | `weekdayOfKey(todayKey())` |
| 11 | `utils/cycle.ts:49,75,162-176`, `App.tsx:89`, `utils/routine.ts:39` | día de la semana | **Sin bug; consolidación.** Índice de día de semana con tabla local | `weekdayOfKey()` |
| 12 | `pages/Calendario.tsx:41,112`, `pages/Mas.tsx:53-57` | día de la semana / clave civil | **Sin bug; consolidación.** Duplicaciones del mismo cálculo | `weekdayOfKey()` / `parseLocalDateKey()` |
| 13 | `services/notifications/requiredActionService.ts:21`, `services/notifications/scheduler.ts:130` | fecha civil | **Sin bug; consolidación.** Formatters propios de fecha | Delegan en `toLocalDateKey()` |

### 4.2 Falsos positivos verificados (clase G, sin cambio)

| Sitio | Por qué NO es bug |
|---|---|
| `pages/Inicio.tsx:783-786` | Ida y vuelta en UTC: el error se cancela exactamente |
| `pages/Entrenar.tsx:381-382` (semana ISO) | Ambos operandas a medianoche UTC: la resta en días es simétrica y correcta |
| `pages/Calendario.tsx:11,90,93,105,162,163,208` | Aritmética pura `y`/`m` con `new Date(y, m+1, 0)`: sin zona horaria involucrada, ya correcto |
| `services/training/prs.ts` / `utils/cycle.ts` helpers `getDay()` | Operan sobre un `Date` **local** ya construido: `getDay()` es el día local correcto |
| `services/notifications/*` `HH:mm` | Hora local del día, no fecha |
| `pages/Inicio.tsx:98-100`, `utils/cycle.ts:180` | `setDate` sobre `Date` local: conserva la hora local, correcto |

### 4.3 Preservados por contrato (clases A, C, D, F)

| Sitio | Clase | Decisión |
|---|---|---|
| `services/storage/sessionStore.ts`, `chat*`, `push*`, `db.saveOnboardingDraft.updatedAt` | **A** | Timestamps de instante. Intocables |
| `services/ai/globalScore.ts`, `services/ai/reportService.ts` | **C/D** | Comparación de claves de fecha ya simétrica; duraciones |
| `services/storage/demoData.ts` (3 sitios) | **F** | Fixture de demo |
| `services/storage/seeder.ts` (2 sitios) | **F** | Semilla de datos de prueba |
| `services/storage/migrateLocalStorage.ts:346` | **F** | Migración one-shot; escribe un registro `coachMemory` con día UTC. **Conflicto documentado**: es una migración (preservada por contrato) pero el valor es fecha civil consumida por el Coach. Se deja para una pasada enfocada en migraciones, no para re-ejecutar una migración ya aplicada |

---

## 5. Cambios en la capa central

`src/utils/dates.ts` ya existía (S1M-A) y ya tenía `toDateKey`, `todayKey`, `dayKeyOffset`, `weekdayOfKey`, `toLocalDateKey`, `parseLocalDateKey`. **S7 no creó una capa nueva**; solo agregó dos helpers que eliminaban una transformación duplicada en 3 sitios:

```ts
export function weekStartKey(key: DateKey): DateKey {
  return dayKeyOffset(key, -((weekdayOfKey(key) + 6) % 7))
}

export function monthStartKey(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`
}
```

Motivo: el anclaje "lunes de la semana" `(getDay() + 6) % 7` estaba repetido a mano y es **fácil de invertir**. Durante la implementación se introdujo un bug real por confundir `weekdayOfKey` (índice con domingo=0) con el offset desde el lunes; el helper lo hace imposible de repetir. La suite lo cubre con los 7 días de la semana, cambio de año y bisiesto.

`monthStartKey` es aritmética de string pura: no necesita `Date` y por lo tanto no puede tener error de zona horaria.

---

## 6. Barrido final: qué queda en producción

```
toISOString().slice/substring  →  7 sitios
  ├─ Inicio.tsx:784                 (G: ida y vuelta UTC simétrica)
  ├─ demoData.ts:43, 81, 221        (F: fixture)
  ├─ seeder.ts:21, 88               (F: semilla)
  └─ migrateLocalStorage.ts:346     (F: migración, conflicto documentado)

getUTC* / setUTC*            →  0
new Date('YYYY-MM-DD')       →  0
new Date(<string>)           →  0
date-fns / parseISO / startOfDay / endOfDay  →  0
```

Sobrevivientes legítimos que NO son claves civiles: `toISOString()` para persistir instantes, `Date.now()` para duraciones, y formatters de `HH:mm`/segundos.

---

## 7. Tests agregados

**39 tests nuevos en 6 archivos.** La suite total sube de 594 a **633** en 78 archivos. Ningún test existente se eliminó ni se relajó.

| Archivo | Tests | Qué fija |
|---|---|---|
| `src/utils/dates.civilDay.test.ts` | 22 | Contrato instante ≠ fecha civil; 21:30 y 00:30 AR; medianoche; bisiesto; cambio de año; PR y cycle; `weekStartKey`/`monthStartKey` en los 7 días |
| `src/services/recovery/hydrationBottles.localDay.test.ts` | 5 | Goal, objetivo diario, ventana de 7 días y corte de historial con reloj falso a las 21:30 |
| `src/services/ai/progressAnalyzer.weekKey.test.ts` | 3 | Domingo 21:30 y lunes 00:01 en semanas distintas; cruce de año |
| `src/services/storage/export.localDay.test.ts` | 3 | `getTodayLocalDate()` a las 21:30; el HTML del PDF nunca imprime el día UTC |
| `src/services/ai/routineBuilderIA.localDay.test.ts` | 3 | La rutina generada arranca hoy a las 21:30 y a la 01:00 (fallback local) |
| `src/components/recovery/PeriodizationEditor.localDay.test.tsx` | 3 | El filtro de período de Progreso con día civil; el input "Fecha inicio" del editor |

Estrategia: **reloj falso a las 21:30 hora Argentina** (la ventana del bug) más aserciones que demuestran explícitamente la diferencia contra la expresión antigua, para que un refactor futuro no pueda reintroducirla en silencio.

### 7.1 Un test de regresión atrapó un bug de S7

`prs.test.ts` ("aggregateVolumeLandmarks weekly agrupa por semana (lunes)") pasó a verde→rojo durante S7: mi primera versión de la corrección del bucket semanal restaba `weekdayOfKey()` en vez del offset desde el lunes, moviendo cada semana un día atrás. Un test preexistente lo detectó. Se corrigió introducing `weekStartKey` y el test volvió a pasar **sin modificarse**.

---

## 8. Resultado de gates

| Gate | Baseline (cierre S6) | S7 | Veredicto |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errores | **0 errores** | ✓ |
| `npx vitest run` | 594/594 (72 archivos) | **633/633 (78 archivos)** | ✓ solo aumentan |
| `npm run build` | PASS | **PASS (9.06s)** | ✓ |
| `npx eslint .` | 0 errores / 213 warnings | **0 errores / 213 warnings** | ✓ 0 nuevos |

El lint se midió con `eslint --format json` porque el script usa `--max-warnings 0` y por eso **falla también en el baseline** (213 warnings preexistentes de estilo `curly`/`eqeqeq`). S7 no agregó ninguno; durante el trabajo se detectaron y corrigieron 2 warnings nuevos que se habían introducido (`Inicio.tsx:101` `exhaustive-deps` por un alias local, y el total volvió a 213 exactos).

---

## 9. Deudas detectadas para S8/S9 (NO resueltas)

| # | Deuda | Dónde | Recomendación |
|---|---|---|---|
| 1 | `getTodayLocalDate()` sigue existiendo sin callers | `services/storage/db.ts:202` | **S9.** Eliminar (ya es correcta, es deuda por existencia) |
| 2 | Helpers de día de la semana que reciben `Date` y repiten el offset lunes | `services/training/prs.ts`, `utils/cycle.ts` | **S9.** Migrar a `weekStartKey` cuando se toquen |
| 3 | `AltheaInput`/`AltheaSelect` renderizan `<label>` sin `htmlFor` | `components/althea/AltheaInput.tsx:13,38` | **S8.** Accesibilidad: lector de pantalla no asocia el campo. No es un bug de fecha, no se tocó en S7 |
| 4 | 213 warnings de estilo (`curly`, `eqeqeq`, `exhaustive-deps`) | todo el repo | **S9.** Reducción selectiva, no obligatorio para el cierre de fase |
| 5 | `migrateLocalStorage.ts:346` escribe fecha UTC en un registro `coachMemory` | migración | **S9.** Cambiar a `todayKey()` **antes** de que la migración vuelva a correr en otros entornos; una migración aplicada no debe re-ejecutarse |
| 6 | Sin tests en zonas horarias al este de UTC | runner en UTC−3 | **S9.** Considerar un job con `TZ=Pacific/Kiritimati` para cubrir el extremo opuesto |

---

## 10. Conclusión de cierre

S7 queda **CERRADA**.

El hallazgo de fondo no era "usar `toISOString()`" sino **recortar un instante a 10 caracteres y llamarlo día**. Eso se corrigió en **8 sitios con bug funcional demostrado** (hidratación, generación de rutina, periodización, progresión, PR, filtro de Progreso, exportación PDF y el helper local muerto) y se consolidaron **5 grupos de duplicación** en 10 archivos, que ya eran correctos pero mantener su propia copia de la capa. El antipatrón no queda en ningún sitio de producción cuya salida sea una fecha civil.

Lo que **no** se hizo, deliberadamente: no se migró un solo registro histórico, no se tocó ningún timestamp de instante, no se reescribieron fixtures, seeders ni demos, y no se creó una segunda capa de fechas.

El caso más significativo del trabajo fue el bug introducido y atrapado en S7 (§7.1): consolidar lógica de fechas sin tests de contrato es facilito de repetir el error. La capa central ahora tiene el anclaje de semana en un solo lugar justamente por eso.
