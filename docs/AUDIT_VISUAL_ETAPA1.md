# ALTHEA — AUDITORÍA VISUAL Y UX (Etapa 1)

Fecha: 2026-10-07
Método: inspección de código + **validación visual real** con Chrome headless vía
DevTools Protocol (CDP, WebSocket nativo de Node 24, sin dependencias).
Rutas capturadas: `/login` `/onboarding` `/` `/mas` `/nutricion` `/perfil`
Viewports: 390×844 y 1440×900.

> Estado de la validación visual: **HABILITADA**. Antes de esta auditoría se
> pakan que la inspección visual no era posible en este entorno. Chrome está
> instalado y el pipeline CDP funciona. Queda como deuda menor: no hay captura
> automática en CI.

---

## 0. Corrección sobre un hallazgo mal atribuido

La primera captura mostró palabras inglesas crudas dondeiban iconos
(`favorite`, `schedule`, `water_drop`, `local_fire_department`, `spa`,
`date_range`, `swap_horz`).

**No son claves de i18n filtradas.** La sonda en la página dio:

| Métrica                                                            | Valor   | Lectura                |
| ------------------------------------------------------------------ | ------- | ---------------------- |
| `document.fonts.check('18px "Material Symbols Outlined"')`         | `false` | la fuente **no** cargó |
| `document.fonts.check('16px "Playfair Display"')`                  | `true`  | la otra sí             |
| ancho de `<span class="material-symbols-outlined">favorite</span>` | 75px    | es **texto**, no glifo |
| `clavesVisibles` en la sonda                                       | `[]`    | intermitente           |

Material Symbols usa ligaduras: el texto `favorite` se sustituye por el glifo
sólo si la fuente está cargada. Sin ella, el usuario ve la palabra inglesa.
La carga fue intermitente entre corridas, lo que confirma que es una condición
de carrera de red, no determinista.

**Conclusión:** el hallazgo válido no es "textos sin traducir", sino
**la interfaz depende de un CDN externo para un sistema de iconos completo, y
su modo de falla es mostrar palabras inglesas en lugar de iconos** — en
algunos casos dentro de títulos de sección con tipografía display.

---

## 1. CRÍTICOS — impiden presentar el producto

### C1. Los iconos de Material Symbols no tienen respaldo

`<span class="material-symbols-outlined">favorite</span>` (Inicio:623,
Calendario:212/222/371, WaterBottle:213, y 40+ sitios más). Si la fuente no
carga, el usuario ve la palabra inglesa. En `Inicio.tsx:623` ese span hereda
`font-display` y se convierte en el **título de sección más grande de la
pantalla**.

Riesgo: red lenta, ad-blocker, CSP restrictive, o primer vuelo offline —que es
el caso de uso principal de la app—.

Mitigación de bajo riesgo: no migrar la librería (lo prohíbe §14), sino
**dar respaldo**: que el span no muestre el literal cuando la fuente no está, y
que su `font-family` incluya un fallback vectorial.

### C2. El layout de Inicio deja un hueco vacío en desktop

A 1440px la card "¿QUÉ TENGO QUE HACER HOY?" ocupa ~2/3 del ancho y **no llena
la altura**: queda un rectángulo vacío de ~450px bajo "Descanso activo". Se lee
como pantalla rota, no como diseño.

Causa: grid de 2 columnas con la columna izquierda corta y sin mecanismo de
relleno ni de reparto.

### C3. Doble entrada de "Progreso" en la navegación

A 1440px el sidebar muestra **"Progreso"** (primario) y **"Progreso y
estadísticas"** (en MÓDULOS). Son el mismo destino. El filtro de duplicados de
`AppNav.tsx` no está funcionando.

Impacto: el usuario no sabe si son dos cosas distintas.

---

## 2. IMPORTANTES — reducen la calidad percibida

### I1. Densidad excesiva de contenedores anidados (§13)

Inicio apila: card del microciclo → card con sub-card de la sesión → panel con
dos sub-paneles → dos cards de métricas. Cada nivel tiene su propio borde.
La directiva lo prohíbe explícitamente: "evitar exceso de bordes, exceso de
cajas".

### I2. El FAB del Coach se superpone con el contenido

El botón del busto queda sobre "NUTRICIÓN ?" en 1440px y sobre texto en 390px.
`MOBILE_NAV_OFFSET` existe pero no se aplica al FAB.

### I3. Jerarquía tipográfica rota por un dato técnico

`local_fire_department` se renderiza con la tipografía display como el título
más grande de la columna derecha. Compite visualmente con "Día de Recuperación
Sacra", que es la información que de verdad responde "¿qué hago hoy?".

### I4. Mayúsculas como mecanismo de etiqueta (§30 / skill frontend-design)

"SIN DATOS", "MICROCICLO", "VOLUMEN", "HISTORIAL →", "SESIÓN PRINCIPAL". El
skill marca el all-caps en labels como tell de página generada.

### I5. Microciclo ilegible a 390px

Siete tarjetas de día en 390px se comprimen a ~45px de ancho: el texto queda en
3 líneas truncadas ("Є spa / De… / Ayu…"). No es información, es ruido.

### I6. Identidad duplicada en el header

A 1440px "ALTHEA" aparece dos veces: en el header superior y en el sidebar
("ALTHEA / PALAESTRA VIRTUE").

---

## 3. MENORES

| #   | Hallazgo                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `VOLUMEN: —` truncado en el borde derecho del microciclo                                                                                                          |
| M2  | Chevrons `‹ ›` de "Esta semana" desalineados respecto al texto                                                                                                    |
| M3  | "0 kcal / Sin sesiones registradas" repetido en Hoy y Semana                                                                                                      |
| M4  | Cita en itálica gris ("La recuperación es donde se forja…") ocupa más espacio que la acción principal                                                             |
| M5  | `NUTRICIÓN ?` con signo de interrogación literal                                                                                                                  |
| M6  | `theme_color` del manifest (`#1D4B38`) difiere del `<meta>` claro (`#F7F3EC`) — se documentó variantes por `prefers-color-scheme`, falta verificar en dispositivo |

---

## 4. Lo que YA está bien (no tocar)

- **Tokens**: `--althea-*` con fuente única en `althea-tokens.css`, 0 duplicados.
- **Safe-area**: corregido; desktop es no-op correcto.
- **Dark mode**: `system` implementado, sigue el SO en vivo.
- **Assets**: 3,93 MB → 1,97 MB tras la purga; 0 assets muertos.
- **Tipografía de marca**: Playfair Display + Inter validada por el catálogo.
- **Estructura de datos**: 48 tablas, migraciones aditivas, nada destructivo.
- **Gates**: tsc 0 · lint 0 · 135 archivos / 1303 tests · build limpio.

---

## 5. Orden de ataque propuesto

| #   | Acción                                                              | Tipo        | Riesgo |
| --- | ------------------------------------------------------------------- | ----------- | ------ |
| 1   | Respaldo de Material Symbols (que no muestre el literal sin fuente) | robustez    | bajo   |
| 2   | Duplicado de "Progreso" en el nav                                   | corrección  | bajo   |
| 3   | Hueco vacío del layout de Inicio a 1440px                           | composición | medio  |
| 4   | Colisión del FAB del Coach                                          | corrección  | bajo   |
| 5   | Jerarquía: sacar el dato técnico del título display                 | composición | medio  |
| 6   | Microciclo legible a 390px                                          | responsive  | medio  |
| 7   | Aplanar contenedores anidados de Inicio                             | composición | medio  |
| 8   | All-caps → sentence case                                            | sistema     | bajo   |

Ninguno de estos toca lógica de negocio, persistencia ni la máquina de
estados de entrenamiento (§3).

---

## 6. ETAPA 2 — Estado de resolución y evidencia

Fecha: 2026-10-10.

> **Método y limitación honesta.** El agente que ejecutó esta etapa **no puede
> inspeccionar imágenes** (modelo sin entrada visual). Por lo tanto la
> verificación no se hizo "mirando PNG" sino por **geometría del DOM vía CDP**:
> `getBoundingClientRect()`, `scrollWidth`/`clientWidth` (detección de
> truncado), `gridTemplateColumns`, conteo de columnas y overflow horizontal de
> página. Los PNG (`althea-shots/*.png`) se regeneraron y quedan para **revisión
> humana**. Toda afirmación de "resuelto" abajo está respaldada por una medición,
> citada.

### Estado por hallazgo

| # | Hallazgo | Estado | Evidencia / verificación |
| - | -------- | ------ | ------------------------ |
| C1 | Iconos Material Symbols sin respaldo | **Resuelto** | Codemod de 94 spans en 19 archivos → `SemanticIcon` (SVG inline, `data-icon`). Eliminado el link CDN y `iconFont.ts`. Guardado por `src/components/ui/semantic-icon.test.tsx`. |
| C2 | Hueco vacío en Inicio desktop | **Resuelto** | Antes (1440): card "¿Qué tengo…?" w=**186px** junto a columna de widgets de **1564px** → hueco ~1378px. Después: card w=**1130px** (ancho completo). CDP `probe-c2.json`. |
| C3 | Doble "Progreso" en nav | **Ya estaba resuelto** | `AppNav.tsx` dedupea por icono; "Progreso" aparece **1** vez (1440). |
| I1 | Exceso de contenedores/bordes anidados | **Resuelto** | Eliminado el bento 8/4 (un nivel de caja menos) y el borde interno de las filas de gasto (`GastoRow`). |
| I2 | FAB del Coach se superpone | **Resuelto** | `--mobile-nav-offset` + clases `.fab-chat-stack`/`.fab-coach-stack`. CDP 390: chat FAB bottom=**84px**, coach=**148px** (nav 74px); 1440: ambos 32px. Sin solape. |
| I3 | Jerarquía rota por icono como título | **Resuelto** (por C1) | `SemanticIcon` ya no aporta texto; los títulos display se alimentan de texto real. |
| I4 | All-caps en labels | **Resuelto (alcance Inicio)** | Quitado `uppercase` y sentence-case en: microciclo, volumen, "Historial →", "Sesión principal", badge de recuperación (SIN DATOS→Sin datos). Otras pantallas **no** se tocaron (por indicación). |
| I5 | Microciclo ilegible a 390px | **Resuelto** | En el árbol móvil (≤767px) el strip muestra día+número+icono, sin truncado ni overflow (390: `hasHOverflow=false`). El problema real estaba en el árbol desktop a **768px** (celdas 85px, nombres truncados: "Espalda + bíceps" 98px, "Hombros + abdomen" 121px). Corregido permitiendo **wrap** (`break-words`, sin `truncate`). Re-medido a 768: **0 truncados**, sin overflow. |
| I6 | "ALTHEA" duplicado | **Resuelto** | Header ALTHEA `lg:hidden`; visible 1× a 1440 (sidebar) y 1× a 390 (header). |
| M1 | "VOLUMEN: —" truncado | **Resuelto / no reproducido** | Con `whitespace-nowrap`: sw=cw=**72** → no trunca a 1440. |
| M2 | Chevrons `‹ ›` desalineados | **Resuelto** | `inline-flex items-center justify-center` en los 4 botones. |
| M3 | "0 kcal / Sin sesiones" repetido | **Resuelto** | Helper `sinSesiones()`: la fila "Semana" oculta la nota vacía cuando "Hoy" ya está vacío. Testids de `Inicio.gasto.test.tsx` intactos. |
| M4 | Cita itálica domina la acción | **Resuelto** | Cita de día de descanso a `text-[11px]`, sin itálica, `pt-2.5`. |
| M5 | "NUTRICIÓN ?" literal | **Resuelto** | Eliminados todos los `?` literales (`Nutrición →`, `↑/↓/→`, `Ajuste:`, `· actual`, `‹ Anterior`/`Siguiente ›`). Probe: `nutritionQ: []`. |
| M6 | `theme_color` manifest ≠ meta | **Abierto (documentado)** | Requiere verificación en dispositivo real; no reproducible por CDP. Sin cambios. |

### Verificación de C2/I1 (reflow) — geometría CDP

| Viewport | workout card | banda de widgets | overflow horizontal |
| -------- | ------------ | ---------------- | ------------------- |
| 1440×900 | w=**1130px** (full) | **3** columnas (368px), 5 widgets | `false` |
| 1024×800 | w=**714px** (full) | **2** columnas (351px), 5 widgets | `false` |
| 768×1024 | w=**658px** (full) | **2** columnas (323px), 5 widgets | `false` |
| 390×844  | árbol móvil | — | `false` |

**Composición:** se eliminó el bento `lg:grid-cols-12` (causa del hueco de C2);
la workout card pasó a ancho completo y los 5 widgets (Gasto, Recuperación,
Hidratación, Oráculo, Coach) a `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` con
`items-start` (sin forzar alturas). No se alteró lógica, cálculos, persistencia
ni rutas.

**Nota de composición (deuda menor):** el widget de Hidratación mide ~724px de
alto (WaterBottle + `BottleConfigEditor` + botón) y en `xl` comparte fila con
tarjetas bajas (Gasto ~242px, Recuperación ~178px), dejando espacio libre bajo
éstas. Se mantiene el grid aprobado (sin forzar alturas). Una futura mejora es
un layout tipo *masonry* (`columns`) o plegar el editor de botellas, pero
fragmenta widgets interactivos y queda **fuera del alcance de esta etapa**.

### Gates tras la etapa 2

- `tsc --noEmit`: **0 errores**
- `eslint . --max-warnings 0`: **0**
- `vitest run`: **134 archivos · 1289 pass · 12 skip** (WGER sin credenciales)
- `npm run build`: OK · `npm run check:release`: OK (sin claves en `dist/`)

### Abiertos / acciones del owner

- M6: verificar `theme_color` del manifest en dispositivo real.
- Deuda: evaluación de *masonry* para la banda de widgets (no bloqueante).
- Acciones externas (no ejecutables por el agente): revocar claves Groq/CalorieNinjas
  históricas, `firebase login` + proyectos, KV de producción del Worker, secretos
  del Worker, CORS real, deploy Worker+Hosting+`firestore:rules`, usuarios A/B
  staging, smoke tests post-deploy.

