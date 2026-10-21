# Feature Specification: Mejora visual del dashboard de Inicio y Dashboard PC

**Feature Branch**: `004-mejora-visual-pc`

**Created**: 2026-10-21

**Status**: Approved

**Input**: Mejorar la vista de inicio (Dashboard / Inicio) de Althea para aprovechar al máximo el espacio disponible, especialmente en monitores de 17 pulgadas y superiores, y mantener una distribución clara, compacta y funcional en dispositivos móviles. No un simple cambio de colores, sino una reorganización estructural del dashboard.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dashboard de Inicio reorganizado con CSS Grid (Priority: P1)

Como usuario de escritorio (monitor 1366-1920px), al abrir /entrenar veo los tres elementos prioritarios (hidratación, macronutrientes, gasto calórico) en la primera fila, sin scroll horizontal, con distribución en 3-4 columnas y tarjetas de tamaño adecuado.

**Why this priority**: Es el núcleo de la solicitud: aprovechar el espacio de pantalla grande.

**Independent Test**: Renderizar en viewport 1920x1080 y verificar que water-bottle, mapa muscular y gasto calórico están en la primera fila sin desplazamiento vertical necesario.

**Acceptance Scenarios**:

1. **Given** viewport 1920x1080, **When** se carga Inicio, **Then** los tres elementos prioritarios aparecen en grid de 3 columnas en la primera fila.
2. **Given** viewport 320x568, **When** se carga Inicio, **Then** los tres elementos se apilan en una sola columna al comienzo del dashboard.
3. **Given** cualquier viewport, **When** se renderiza, **Then** no existe scroll horizontal.

---

### User Story 2 - Gráfico circular de macronutrientes en Inicio (Priority: P1)

Como usuario, al abrir Inicio veo el gráfico circular de consumo de macronutrientes (MacroPlate) junto con barras de progreso por proteína, carbohidratos y grasas, con datos reales de macroService.

**Why this priority**: El usuario pidió específicamente que el gráfico circular de macros aparezca en Inicio.

**Independent Test**: Renderizar Inicio y verificar que el componente MacroSummary incluye el mapa circular de macro porcentajes.

**Acceptance Scenarios**:

1. **Given** datos de macros cargados, **When** se renderiza Inicio, **Then** aparece el gráfico circular con porcentajes de proteína/carbohidratos/grasas.
2. **Given** sin datos, **When** se renderiza Inicio, **Then** se muestra estado de carga o vacío sin error.

---

### User Story 2 - Eliminación de restricciones de ancho artificiales (Priority: P1)

Como usuario de escritorio, las páginas no tienen `max-w-[1440px]` ni `max-w-[720px]` que limiten innecesariamente el ancho, usando en su lugar padding responsive que crece con el ancho de pantalla.

**Why this priority**: El dashboard debe ocupar el ancho útil completo en monitores grandes.

**Independent Test**: Verificar que ningún archivo en src/pages/ contiene `max-w-[1440px]` o `max-w-[720px]`.

**Acceptance Scenarios**:

1. **Given** búsqueda en código, **When** se busca `max-w-\[1440px\]` o `max-w-\[720px\]` en src/pages/, **Then** no hay coincidencias.
2. **Given** viewport 1920px, **When** se renderiza Entrenar, Progreso, Mas, Inicio, **Then** el contenido usa el ancho completo con padding responsive.

---

### User Story 4 - Touch targets y accesibilidad móvil (Priority: P2)

Como usuario móvil (320px-768px), todos los botones y elementos interactivos tienen al menos 44px de tamaño táctil, y la fuente es legible (mínimo text-base en cuerpo, text-sm en labels).

**Why this priority**: Requisito de accesibilidad y usabilidad móvil.

**Independent Test**: Ejecutar tests de Playwright en viewport 320x568 y verificar que ningún elemento interactivo tiene ancho o alto menor a 44px.

**Acceptance Scenarios**:

1. **Given** viewport 320x568, **When** se carga Inicio, **Then** todos los botones y enlaces tienen al menos 44px de ancho y alto.
2. **Given** viewport móvil, **When** se carga cualquier página, **Then** el texto base es al menos text-sm (1rem) y las etiquetas son legibles.

---

### Edge Cases

- Sin credenciales de Firebase: la app redirige a /login, los tests de UI verifican carga sin errores críticos de renderizado.
- Sin datos de hidratación/macros/gasto: se muestra estado vacío honesto ("Sin datos", "Cargando…"), nunca se inventan valores.
- Ventana muy estrecha (<320px): el grid colapsa a una columna y el contenido no se desborda.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `src/App.tsx`: quitar `max-w-[1440px]` del contenedor `shell-content`, usar padding responsive (`px-3 sm:px-5 lg:px-6 xl:px-8 2xl:px-10`).
- **FR-002**: `src/pages/Inicio.tsx`: rediseño con CSS Grid (dashboard-top-grid y dashboard-secondary-grid), fila 1 con hidratación + macros + gasto calórico, fila 2 con entrenamiento + actividad + registros de virtud.
- **FR-003**: `src/components/nutrition/MacroSummary.tsx`: nuevo componente con `MacroPlate` (gráfico circular anillo) + barras de progreso por macronutriente.
- **FR-004**: `src/pages/Entrenar.tsx`, `src/pages/Progreso.tsx`, `src/pages/Mas.tsx`, `src/pages/Actividad.tsx`, `src/pages/AdminFeedback.tsx`, `src/pages/Biblioteca.tsx`, `src/pages/Calendario.tsx`, `src/pages/Recuperacion.tsx`, `src/pages/Rutina.tsx`: eliminar `max-w-[1440px]` o `max-w-[720px]` restrictivos, usar padding responsive.
- **FR-005**: `src/pages/Login.tsx` y `src/pages/Onboarding.tsx`: eliminar `max-w` restrictivo, agregar `min-w-[44px] min-h-[44px]` a todos los botones de texto.
- **FR-006**: Todos los archivos de fuente CSS (`tailwind.config.js`, `althea-tokens.css`, `althea-components.css`, `index.css`) usan tipografía más grande (body-base 1.125rem, headline-lg 2.75rem, label-caps 0.9375rem).

### Key Entities

- **Dashboard Grid**: `dashboard-top-grid` (grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3) y `dashboard-secondary-grid` (grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3).
- **MacroSummary**: componente con `MacroPlate` (gráfico circular) + barras de progreso individuales por macronutriente.
- **Entrada de hilo**: `feedbackThreads` (no aplica aquí, es de otra spec).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `npx tsc --noEmit` pasa sin errores.
- **SC-002**: `npm run lint` pasa sin warnings.
- **SC-003**: `npx vitest run` pasa con 1646+ tests verdes (2 fallos preexistentes en Coach.test.tsx no relacionados).
- **SC-004**: `npm run build` pasa exitosamente.
- **SC-005**: Playwright: 4/4 tests de touch targets pasan en móvil; 18/18 tests de carga pasan en escritorio y móvil.
- **SC-006**: No hay archivos con `max-w-[1440px]` o `max-w-[720px]` en `src/pages/`.

## Assumptions

- Los datos de macros, hidratación y gasto calórico provienen de `macroService`, `hydrationBottles` y `exerciseEnergy` respectivamente (ya existentes).
- El diseño es responsivo: desktop (3 columnas) y móvil (1 columna) sin componentes duplicados.
- No se alteran cálculos ni modelos de datos de negocio; solo presentación visual.

## Design System & Style Guidelines

- **Tipografía**: fuente base 1.125rem (18px), headline-lg 2.75rem (44px), label-caps 0.9375rem (15px) con letter-spacing 0.1em.
- **Colores**: paleta existente de Althea (primary #1B4332, surface #FBFAF7, on-surface #1A1B17, outline #DEDACF).
- **Espaciado**: 4/8dp spacing rhythm, tarjetas con `rounded-2xl` y `shadow-al-sm`.
- **Componentes base**: `AltheaPanel`, `AltheaMetric`, `AltheaStatRow`, `AltheaStat`, `WaterBottle`, `MuscleAtlas` (no usado en Inicio), `MacroPlate`.

## Open Questions

- Ninguna pendiente.

## Out of Scope

- No se añaden nuevos módulos de datos (usa macrosService, hydrationBottles, exerciseEnergy existentes).
- No se añade mapa muscular en Inicio (vive en /progreso).
- No se añade gráfico circular de macros en Nutrición (ya existe).
- No se añade autenticación ni cambios de base de datos.

## Links

- Repositorio: https://github.com/manuelchalupa-arch/Althea.git
- Issue relacionado: rediseño responsive del dashboard de Inicio.
