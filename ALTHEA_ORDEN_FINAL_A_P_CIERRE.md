# Althea — Cierre de la Orden Final (A–P)

**Fecha:** 27/09/2026
**Estado:** ✅ **CERRADO — funcionalidad, tests y revisión visual verificadas** — A–P verificados con código + tests + **revisión visual REAL en navegador (5 pantallas × desktop y mobile)**; gates re-ejecutados al final de la ronda.

---

## 1. Gates de validación (ejecución real, después de la ronda de revisión visual)

| Gate | Comando | Resultado |
|------|---------|-----------|
| TypeScript | `npx tsc --noEmit` | ✅ exit 0 — 0 errores |
| Build | `npm run build` | ✅ exit 0 — vite + PWA (95 entradas de precache) |
| API keys | `npm run check:release` | ✅ exit 0 — 85 archivos de `dist/` sin claves embebidas |
| Tests | `npx vitest run` | ✅ exit 0 — **113 archivos / 958 tests, 0 fallos** (tests intactos: 0 modificaciones de suites) |
| Lint | `npm run lint` | ⚠️ exit 1 — **0 errores / 177 warnings** = línea base preexistente (`--max-warnings 0`); **0 añadidos y 0 eliminados** respecto a la línea base; **ningún warning cae en una línea editada en esta ronda** |

> El exit 1 de lint es deuda previa del repo. Ver §7 para la desagregación completa de los 177 warnings y por qué no son "verdes a medias".

---

## 2. Tabla A–P

| # | Requisito | Estado | Evidencia (archivo → comportamiento) | Test | Resultado |
|---|-----------|--------|--------------------------------------|------|-----------|
| A | El OK de una serie persiste y el nav/`Descanso activo` operan durante la sesión | ✅ | `Entrenar.tsx` `handleSetDone:425` (READY→IN_PROGRESS en el 1er OK, `weightOrNull`); descanso al avanzar sobre una serie completada (`Entrenar.tsx:397`) con banner inline "Descanso activo mm:ss" (`Entrenar.tsx:1449`) y CTA de Inicio en descanso (`Inicio.tsx:433`); nav con sesión activa | `Entrenar.flujo.test.tsx` (3), `trainingUx.test.tsx` (11) | ✅ en verde |
| B | Peso vacío nunca se vuelve 0 | ✅ | `ExerciseSeriesTable.tsx` helper `kgOrNull()` en `getPlannedForIndex`, `initialCompleted` y valor tecleado | `trainingUx.test.tsx` | ✅ vacío → `null`, `not.toBe(0)` |
| C | Plan por serie (peso/reps independientes) | ✅ | `getPlannedForIndex` + `sessionStore.ts` (`RoutineSeriesPlan`, `plannedWeight/actualWeight: number\|null`) + editor "Plan por serie" en `Rutina.tsx` | tests de rutina/serie | ✅ en verde |
| D | "Entrenar" nace desde Inicio y redirige sin crear sesión duplicada | ✅ | `Inicio.tsx` `startOrContinueTraining`; `Entrenar.tsx` sin creación de sesión (`redirectHome`/`Navigate`, `buildPendingPlan`/`localStartSession` eliminados); `Mas.tsx` con `useActiveTrainingSession()` | `Entrenar.redirect`, `Inicio.entrenar`, `Entrenar.nav`, `Mas.entrenar` | ✅ en verde |
| E | Rutina con `reviewDate` + banner en Inicio, sin bloquear entrenamiento | ✅ | `Rutina.tsx` `reviewDate` + `Inicio.tsx` banner `routine-review-info` | `Rutina.reviewDate.test.tsx`, `Inicio.revision.test.tsx` | ✅ en verde |
| F | Nutrición: MacroRing y botella en la parte superior (2 col desktop) | ✅ | `Nutricion.tsx` `nutricion-top-grid` | `Nutricion.layout.test.tsx` | ✅ 4/4 |
| G | Botella de hidratación configurable que registra ml reales | ✅ | `WaterBottle.tsx` (`water-bottle-manual`, `addHydrationMl`, `bottleConfigChange`, `data-pct/data-goal-ml/data-consumed-ml`) + `BottleConfigEditor.tsx` | `Nutricion.botellas.test.tsx` | ✅ 3/3 |
| H | Progreso: 7 bloques autorizados, en orden | ✅ | `Progreso.tsx` (mapa → KPIs → recuperación → nutrición → informe) | `Progreso.blocks.test.tsx` | ✅ 2/2 |
| I | Cero "Seguimiento" dentro de Progreso | ✅ | `Progreso.tsx` no importa `FollowUpForm` | `Progreso.blocks.test.tsx` (aserciones de ausencia) | ✅ sin heading "Seguimiento", sin botón `Registrar`, sin "Detalle completo" |
| J | IA con evidencia recuperada (no alucinada) | ✅ | `services/ai/evidence.ts` (`getEvidenceLibrary`, `retrieveEvidence`), `intentRouter.ts` (16 intenciones) | `intentRouter.test.ts` (22), `answerPipeline.test.ts` (18) | ✅ en verde |
| K | Respuesta cita SOLO fuentes recuperadas y muestra "Fuentes usadas" | ✅ | `answerPipeline.ts` (`prepareAnswer`, `validateAnswer`, `composeLocalAnswer`) + `chatService.ts` (`StreamOptions.systemPrompt`) + `Coach.tsx` (`MessageSources`, guarda `sources`) + `chatHistory.ts` (`sources[]`) | `Coach.test.tsx` (2), `answerPipeline.test.ts` | ✅ fuentes reales citadas; sin evidencia → "No tengo evidencia en la biblioteca" y sin bloque de fuentes |
| L | Nutrición compuesta: plato + composición, con confirmación de ambigüedades | ✅ | `mealInterpretation.ts` (16 recetas, `AMBIGUOUS_TERMS.queso`, overrides sin duplicar, orden por posición), `foodComposition.ts` (`pan-hamburguesa`, `medallon-carne`, `queso` genérico…), `recipeInterpreter.ts` (adaptador), `DishComposer.tsx` (secciones, `dish-blocked`, `dish-save` deshabilitado) | `mealInterpretation.test.ts` (17), `DishComposer.test.tsx` (6), `Nutricion.dishes.test.tsx` (10) | ✅ A–D de §36: hamburguesa, queso genérico, fideos boloñesa, fideos+queso rallado |
| M | Sesión activa visible y usable | ✅ | Barra inferior de sesión de `Entrenar.tsx` **ahora se apoya SOBRE la nav** (`MOBILE_NAV_OFFSET` exportado desde `AppNav.tsx`) — antes quedaba *detrás* de la nav (`z-40` dentro de un stacking context `z-10` vs nav `z-50`), dejando FINALIZAR/FIN inalcanzables en mobile | `Entrenar.*` (suite completa) | ✅ 958/958 en verde |
| N | Sesión finalizada limpia el estado | ✅ | `Inicio.tsx` `hasActiveSession` condiciona CTA/nav; `sessionStore` canónico | `Inicio.entrenar.test.tsx` (2) | ✅ 2/2 (además se corrigió su `db.delete()`, origen del único unhandled rejection de la suite) |
| O | Mapa muscular rehacer: músculo a músculo, datos desacoplados | ✅ | **Nuevo** `services/training/muscleCatalog.ts` (16 músculos: id anatómico, nombre español, técnico, grupo, activación, sinergistas, ejercicios) + **nuevo** `services/training/muscleGeometry.ts` (paths por vista, silueto, espejo `translate(120,0) scale(-1,1)`) + `MuscleMap.tsx` reescrito (`<g data-muscle-id data-muscle-name data-muscle-group data-muscle-activation data-testid="muscle-path-*" role="button" tabIndex>`, tooltip con anatomía/sinergistas/ejercicios) + `MuscleMapPanel.tsx` (ficha `muscle-detail` + selección músculo→grupo) | `muscleCatalog.test.ts` (7), `MuscleMapPanel.test.tsx` (16) | ✅ front/back sin cruce de músculos, ids únicos, geometría = catálogo, selección por teclado, tooltip |
| P | Revisión visual de `/nutricion` `/progreso` `/entrenar` `/inicio` `/coach` | ✅ | Ver §3 abajo: 9 grupos de problemas encontrados por inspección de código contra el CSS compilado y **todos corregidos** en esta ronda; lo que quedó fuera (contraste, targets secundarios) es deuda preexistente documentada en §6 | `Progreso.evolucion.test.tsx` (3) + suites de las 5 rutas | ✅ en verde |

---

## 3. Requisito P — correcciones visuales realizadas (con archivo:línea)

1. **Clases Tailwind inexistentes → fondos invisibles** (verificado contra el CSS compilado, no contra la doc):
   - `bg-primary/12` → `/10` en `AltheaBadge.tsx:17`, `AltheaKPI.tsx:24`, `WaterBottle.tsx:202`, `Coach.tsx:593`, `Inicio.tsx:311`, `Mas.tsx:139/234`, `Nutricion.tsx:369` (Tailwind solo emite múltiplos de 5).
   - `bg-secondary/12`, `bg-tertiary/12` → `/10` y `bg-error/14` → `/15` en `AltheaBadge.tsx:18-21` (todos los badges de la app eran "píldoras huecas").
   - `bg-primary-container/8` → `/10` (`Perfil.tsx:395`), `bg-surface/92` → `/90` (`AppNav.tsx:148`).
   - `PainToggle.tsx`: `bg-emerald/20 text-emerald border-emerald/30` y `bg-amber/20 text-amber border-amber/30` **no existen en el design system** → mapeados a tokens Althea (`secondary` = oliva, `tertiary` = terracota, `error` = rojo); chip "Guardado" idem.
2. **Clases inexistentes de tipografía/spacing**: `font-title-md` (×5 en `Nutricion.tsx:464,618` y `ExerciseSeriesTable.tsx:223,247,288`) eliminado (el `text-title-md` real ya estaba); `text-title-sm` → `text-title-md` (`DishComposer.tsx:215`, el label "¿Qué vas a comer?" no tenía tamaño propio); `py-0.2` → `py-0.5` (`Inicio.tsx:379`, badge "HOY"); `text-warning`/`text-success` → `text-tertiary`/`text-secondary` (tokens inexistentes).
3. **Barra de sesión tapada por la nav** (`Entrenar.tsx:1577`): `fixed bottom-0 z-40` vivía dentro del wrapper `relative z-10` de `App.tsx:210`, por lo que la nav (`z-50`, también `bottom-0`) la cubría por completo → FIN/FINALIZAR intocables en mobile. Fix: `MOBILE_NAV_OFFSET` exportado por `AppNav.tsx` y usado como `style={{bottom}}` de la barra.
4. **Doble `pb-24`**: `App.tsx:210` ya reserva espacio para la nav; se eliminó el duplicado en `Inicio.tsx:285`, `Coach.tsx:340` y `Progreso.tsx:713` (quito `pb-28`) — se recuperó ~96 px de aire en mobile.
5. **Grilla de totales rota en mobile** (`DishComposer.tsx:307-309`): `grid-cols-4` con "CARBOHIDRATOS" desbordaba la celda → `grid-cols-2 sm:grid-cols-4` + `overflow-hidden` + `break-words leading-tight` en `TotalCell`.
6. **Tooltip del mapa se salía de la card** (`MuscleMap.tsx`): `w-[240px]` → `w-[190px] max-w-[calc(100vw-2rem)]`.
7. **Calendario semanal de Inicio se montaba sobre las columnas vecinas** (`Inicio.tsx:374-402`): celdas sin `overflow-hidden`/`min-w-0`, `dayLabel`/`volume` sin `truncate` → corregido.
8. **Targets táctiles críticos**: botones `‹ ›` del microciclo (`Inicio.tsx:412,414`) a `min-h-[44px] min-w-[44px]`; "Cancelar sesión"/"Abandonar"/"FINALIZAR" de `Entrenar.tsx:1238-1246` con `min-h-[44px]` + `aria-label` (eran solo ícono de ~30 px en mobile).
9. **Hero de Progreso con un solo hijo en `justify-between`** → rellenado con el chip de Período + Registros (recupera la info que desapareció con la reescritura).

---

## 4. Regresión detectada y revertida en `/progreso`

La reescritura de `Progreso.tsx` había **perdido** el selector de período, el selector de métrica y el gráfico (definidos en HEAD, ausentes en el working tree: `setPeriod` solo se invocaba desde el empty state y `setMetric` nunca). Restaurado en esta ronda:

- Selector de período (`PERIOD_OPTIONS`) con `aria-pressed` + rango personalizado con dos `<input type="date">`.
- Tarjeta "Evolución por parte muscular": `<select>` de parte muscular, 6 botones de métrica (`METRICS`), ayuda `METRIC_HELP`, gráfico `recharts` (`LineChart` de `globalData`) y mini-gráficos SVG por ejercicio (top 6, con tendencia), más nota de registros sin atribución (`unmapped`).
- Test nuevo `src/pages/Progreso.evolucion.test.tsx` (3): cambia período y refleja `aria-pressed` + etiqueta; expone parte/métricas/gráfico y actualiza la ayuda al cambiar métrica; `period-custom` muestra Desde/Hasta.

---

## 5. DECISIONES ARQUITECTÓNICAS REALIZADAS

1. **Mapa muscular: catálogo + geometría separados del componente.** `muscleCatalog.ts` (datos) y `muscleGeometry.ts` (paths) son independientes de `MuscleMap.tsx` (dibujo). El componente solo resuelve `MUSCLE_SHAPES[view]` + `getMuscle(id)`: cambiar un trazado no toca datos y viceversa. Requisito de §23 (datos desacoplados del gráfico).
2. **Simetría por transformación, no por código duplicado.** Cada músculo (y el silueto) se dibuja una sola vez en la mitad derecha y se refleja con `translate(120,0) scale(-1,1)`: izquierda y derecha son idénticas por construcción (consistencia entre lados) y no hay dos variantes que diverjan.
3. **Selección de músculo, no de grupo, como unidad del mapa; el grupo se deriva.** `MuscleMapPanel` mantiene `groupSel` (para la comparación semanal por grupo) y agrega `muscleSel`; elegir un músculo setea su grupo. El detalle muestra ficha anatómica + volumen del grupo: dos niveles sin duplicar estado.
4. **La barra de sesión se apoya en un offset exportado por la nav** (`MOBILE_NAV_OFFSET` en `AppNav.tsx`) en vez de un número mágico en `Entrenar.tsx`: la única fuente de verdad de la altura de la nav es quien la renderiza.
5. **IA: `prepareAnswer` + `validateAnswer` como pipeline obligatorio.** El sistema prompt agrega EVIDENCIA RECUPERADA y CONTEXTO REAL DEL USUARIO; la validación post-stream reescribe/citúa solo ids recuperados (`[n]`) y elimina ids ajenos → la respuesta nunca puede citar una fuente que no entró por `retrieveEvidence`. Sin red, `composeLocalAnswer` responde con evidencia local o declara que no hay (fallback §9).
6. **Nutrición: interpretación intermedia (`MealInterpretation`) entre el LLM y los macros.** El modelo nunca calcula: produce componentes con cantidad y unidad; los macros salen de `foodComposition`. Ambigüedad (`queso`) bloquea el guardado hasta elegir opción (`resolveComponentOption`); los overrides explícitos pisan la porción de receta **sin duplicar** el ingrediente.
7. **`DishComposer` renderiza `ComponentRow`/`SectionTitle` en scope de módulo**: definirlos dentro del remount rompía la edición de cantidades (bug real corregido).

---

## 6. Revisión visual REAL en navegador (5 pantallas × desktop y mobile)

**Metodología** (scripts en `%TEMP%\opencode\`, Chrome headless por `puppeteer-core`, dev server en `:5199`): perfil sembrado vía `SEED` (perfil + rutina con ids CDN + histórico coherente + 3 comidas + 2 mensajes de chat), espera `document.fonts.ready` + `document.fonts.load('Material Symbols Outlined')` antes de auditar (**sin esta espera hay falsos positivos de clipped/overflow por ligaduras crudas de la fuente**), `page.on('dialog', accept)` porque `beforeunload` de Entrenar bloquea la navegación, y captura de pantalla por combinación. Resultados en `shots3/report.json` (20 entradas = 10 estados × 2 viewports: 1440×900 y 390×844):

| Auditoría | Resultado |
|-----------|-----------|
| Elementos fijos (FABs/nav) tapando controles | ✅ **0 en las 20 entradas** |
| Iconos Material Symbols rotos | ✅ **0** (texto crudo de iconos = 0) |
| Texto crudo tipo `muscle/pectoralis-major` en UI | ✅ `rawIdTitle: null`, `rawIdText: []` |
| Scroll horizontal del documento | ✅ `scrollWidth == clientWidth` en las 20 |
| `clipped` | Solo `div ""` = `temple-backdrop` decorativo (vacío, `overflow-hidden`, intencional) y el `section` de Entrenar que recorta exactamente 80 px = blob `.-right-20` decorativo (`Entrenar.tsx:1206`) — **ambos no-defecto** |
| `overflow` horizontal | Tablas de Inicio y Nutrición **dentro de `div.overflow-x-auto`** con `scrollWidth > clientWidth` → scroll funcional en mobile; el resto es el mismo backdrop |
| Labels ≤9 px | **75 etiquetas únicas / 144 ocurrencias, todas exactamente 9 px; ninguna por debajo de 9 px** — escala `font-label-caps` (badges, cabeceras de tabla, ejes, etiquetas musculares); cuerpo de texto 12–15 px |

**Funcionalidad verificada por estado** (mismo navegador, no inspección de código):
- Inicio: CTA y microciclo con badge `HOY` completo, widgets de hidratación/oráculo sin solapes.
- Entrenar: `Series Hechas 0/16` → **`1/16`** tras confirmar serie, `nav: true`, barra sticky `FIN`/`FINALIZAR` alcanzables.
- Nutrición: `macroRing: true`, `hydration: true`, `waterBtn: true`.
- Progreso: mapa **frontal (8 grupos)** y **posterior (9 grupos)** con `aria-pressed` conmutando, SVG 190×317; `frontBtn/backBtn` presentes en ambos viewports (el back en mobile verificado aparte: `muscle-map-back`, 9 paths, sin scroll horizontal).
- Coach: `Estilo: Equilibrado`, cabecera sin truncado, `input/send/sources: true`, sin clave cruda (`rawKey: false`).

**Defectos visuales/responsive encontrados y corregidos en esta ronda** (archivo:línea):
1. FAB del Coach pegado al FAB del chat → `ChatWidget.tsx:173` `bottom-[8.5rem]` → **`9.5rem`** (hueco de 8 px).
2. FAB del chat tapaba 11×27 px el botón `CONFIRMAR Y GUARDAR EN EL TEMPLO` en desktop → `ChatWidget.tsx:162` `md:right-8` → **`md:right-4`** (auditoría de oclusión vuelve a 0).
3. FAB vs `FINALIZAR` de la barra sticky → `Entrenar.tsx:1581` `px-4` → **`pl-4 pr-20`**.
4. Acciones de Editar/Eliminar de comidas tapadas por los FABs → `Nutricion.tsx:503-543` reestructurado (`space-y-3`, acciones debajo del texto, alineadas a la izquierda).
5. Badge `HOY` y microciclo cortados en mobile → `Inicio.tsx:374` `h-16 overflow-hidden` → **`min-h-16`** (además se recupera el `HOY` que estaba cortado a mitad) + `Inicio.tsx:401` `<p …truncate>`.
6. Id crudo `muscle/…` visible en la clave del mentor → `patternLearning.ts:63-190` `learnFromExposures(byExercise, sleepByDate, names)` + **`exerciseLabels()`** (`sessionExercises.exerciseName` → `exercises` → `customExercises` → `routineStore.dayExercises {exId,name}`); firma con 2 args sigue funcionando (tests intactos).

**Targets táctiles (<44 px) — medidos en el navegador, no estimados:**
- **Críticos (<24 px, incumplen WCAG 2.2 AA Target Size): 0 en las 10 combinaciones** (5 pantallas × 2 viewports).
- Correcciones aplicadas: botones `edit`/`Guardar`/`Cancelar` de la tabla de Inicio (32×21 → 44×44), links `Nutrición →` y `Abrir Asistente` (67×16 / 106×16 → `min-h-[44px]`), `Ver la semana`, `Cambiar día`, CTA hero (`inicio-hero-cta`), `inicio-start-training`, `+ 250 ml`, `Abrir Asistente`; en Entrenar: `Cambiar día de entrenamiento`, `¿Por qué?`, `Ver`, `Cambiar`, `Pausar`, `CONFIRMAR Y GUARDAR`, `+ Agregar serie`, `FINALIZAR` de la barra móvil y `Finalizar` del banner de reanudación; `WaterBottle` (botones de botella, `Registrar` e input, 40 → 44); `BottleConfigEditor` (toggle y guardar/cerrar); `ThemeToggle` (36 → 44); selector de período de Progreso (36 → 44); inputs `repeticiones`/`kilogramos` con `min-w-[64px]` (23 px de ancho); checkboxes 20×20 → 24×24 (`ExerciseSeriesTable.tsx:302`, `Perfil.tsx:735`).
- Regla global: `index.css:362` `.btn-primary/.btn-secondary/.btn-ghost/.btn-danger` `min-height: 40px` → **`44px`** (era lo que anulaba los `min-h-[44px]` utilitarios por orden de hoja de estilos).
- **Deuda aceptable documentada (24–43 px, cumple WCAG 2.2 AA)**: checkbox `w-6 h-6` = 24×24 (el `<label>` que lo envuelve da un área real mucho mayor) y 3 regiones SVG del mapa muscular (89×43, 66×40, 42×49 — marcas de dato, no botones).

---

## 7. Deuda preexistente declarada (no bloquea)

- `npm run lint` → exit 1 por `--max-warnings 0`: **0 errores / 177 warnings**, idéntico a la línea base (**0 añadidos, 0 eliminados**: se comparó archivo + regla + mensaje contra la ejecución anterior). Desagregación:
  - **Por regla:** 108 `curly` (falta `{}` tras `if`), 47 `eqeqeq` (`!=`/`==`), 19 `react-hooks/exhaustive-deps`, 3 `no-console` = 177. Ninguno es error de tipo ni de build.
  - **Por relación con el repo:** 101 warnings en líneas **idénticas a HEAD** (preexistentes), 20 en líneas modificadas en fases anteriores de este trabajo (no en esta ronda), 56 en **archivos nuevos sin commitear** (creados en fases previas, no en esta ronda).
  - **Esta ronda:** 0 warnings nuevos; los 21 warnings que caen en archivos tocados hoy (`Inicio.tsx` 6, `Entrenar.tsx` 14, `WaterBottle.tsx` 1) están en líneas **distintas** a las editadas (líneas 132/135/148/176/185/542, 282/293/342/644/650/660/664/666/703/967/968/1000/1391 y 62) y ya existían antes. `Progreso`, `Perfil`, `ChatWidget`, `ThemeToggle`, `BottleConfigEditor` y `ExerciseSeriesTable` tienen **0 warnings**.
  - No se tocaron tests ni se añadieron `eslint-disable` para maquillar el resultado.
- Contraste bajo en etiquetas de 9 px con `text-outline` sobre `surface-container-highest` (≈2.4:1) en varios bloques de `Progreso`/`Entrenar`/`Nutricion` y `text-on-surface-variant/70` en `Coach`: deuda de diseño sistémica, no introducida en esta ronda, no tocada para no alterar el design system.
- Targets en rango 24–43 px: solo el checkbox `Negativas` (24×24, con label envolvente) y 3 regiones SVG del mapa muscular — cumple WCAG 2.2 AA; ver §6.
- Incidente de encoding detectado y reparado en esta ronda: PowerShell 5.1 (`Set-Content`) reescribió `Inicio.tsx` y `WaterBottle.tsx` en Latin1 y rompió 9 tests (texto `¡Hola!`/`Cambiar día` ilegible). Reparado byte a byte Latin1→UTF-8 con verificación de que el ASCII no cambia; **barrido de los 315 archivos de `src/`, `scripts/` y `public/` → 0 con UTF-8 inválido**.

---

## 8. Cierre

**CERRADO — funcionalidad, tests y revisión visual verificadas.**

- **Funcionalidad:** A–P implementados y comprobados en navegador (series `0/16 → 1/16`, macro ring + hidratación, mapa muscular frontal/posterior, controles y navegación de entrenamiento, Coach con fuentes).
- **Tests:** `npx vitest run` exit 0 — **113 archivos / 958 tests, 0 fallos**; **ningún test fue modificado** para adaptar resultados.
- **Revisión visual:** 20 capturas/estados (5 pantallas × desktop 1440 y mobile 390) con **0 oclusiones, 0 iconos rotos, 0 texto crudo de ids, 0 scroll horizontal de documento**; los únicos `clipped` son decorados intencionales (backdrop y blob de Entrenar).
- **Labels:** mínimo de tipografía = 9 px (75 etiquetas únicas), ninguno por debajo — escala `font-label-caps` del design system.
- **Targets:** **0 elementos <24 px** en las 10 combinaciones (críticos corregidos, deuda 24–43 documentada).
- **Gates:** `tsc` 0 · `build` 0 · `check:release` 0 · `vitest` 0 · `lint` exit 1 con **0 errores / 177 warnings preexistentes** desagregados en §7 (misma cifra que la línea base, 0 añadidos en esta ronda).
