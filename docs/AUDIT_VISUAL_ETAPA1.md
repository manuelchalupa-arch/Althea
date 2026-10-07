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
