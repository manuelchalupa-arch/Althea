# Implementation Plan: Mejora visual del dashboard de Inicio y Dashboard PC

**Branch**: `004-mejora-visual-pc` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `.specify/specs/004-mejora-visual-pc/spec.md`

## Summary

Rediseño del dashboard de Inicio con CSS Grid (fila 1: hidratación, macros con gráfico circular, gasto calórico; fila 2: entrenamiento, actividad, registros de virtud), eliminación de restricciones de ancho máximo (`max-w-[1440px]`, `max-w-[720px]`) en 11 páginas, fuentes más grandes en todo el sistema de diseño, y botones con touch target ≥44px en Login y Onboarding.

## Technical Context

**Language/Version**: TypeScript 5.7 / React 18.3

**Primary Dependencies**: React 18.3, React Router DOM ^7, Vitest ^5, Tailwind 3, Dexie ^4, Firebase ^12

**Target Platform**: PWA (mobile-first + desktop)

**Constraints**: Sin alterar cálculos ni modelos de datos de negocio; solo presentación visual; mantener compatibilidad con pruebas existentes.

**Scale/Scope**: Una etapa; afecta a 12 páginas + 2 archivos de estilo globales + 1 componente nuevo + 1 componente modificado.

## Constitution Check

*GATE passed before Phase 0.*

| Principio | Cumplimiento |
|-----------|--------------|
| I. Offline-First | No se toca capa de datos; solo presentación visual. |
| II. Local-First & Privacy | Sin cambios en almacenamiento de datos. |
| III. Mobile-First | Touch targets ≥44px en móvil; tipografía legible en 320px-1920px. |
| IV. Deterministic Rules Before AI | Sin IA en el flujo. |
| V. User Control | Interfaz más clara y legible; nada se oculta ni se oculta información. |

## Project Structure

### Documentation (this feature)

```text
.specify/specs/004-mejora-visual-pc/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx                             # shell-content: quitar max-w-[1440px], padding responsive
├── src/pages/Inicio.tsx               # rediseño con CSS Grid (top-grid + secondary-grid)
├── src/pages/Mas.tsx                  # quitar max-w-[720px]
├── src/pages/Entrenar.tsx             # quitar max-w-[1440px] (3 ocurrencias)
├── src/pages/Progreso.tsx             # quitar max-w-[1440px]
├── src/pages/Actividad.tsx            # quitar max-w-[720px]
├── src/pages/AdminFeedback.tsx        # quitar max-w-[1440px]
├── src/pages/Biblioteca.tsx           # quitar max-w-[1440px]
├── src/pages/Calendario.tsx           # quitar max-w-[1440px]
├── src/pages/Recuperacion.tsx         # quitar max-w-[1440px]
├── src/pages/Rutina.tsx               # quitar max-w-[1440px]
├── src/pages/Feedback.tsx             # quitar max-w-[1440px]
├── src/pages/Login.tsx                # quitar max-w, touch targets 44px
├── src/pages/Onboarding.tsx           # quitar max-w, touch targets 44px
├── src/components/nutrition/MacroSummary.tsx | nuevo: gráfico circular MacroPlate + barras de progreso
├── src/tailwind.config.js             # fuentes base más grandes
├── src/styles/althea-tokens.css       -- fuentes base del sistema aumentadas
├── src/styles/althea-components.css   -- paneles con menos padding, métricas con fuentes más grandes
└── src/index.css                      -- body font-size 1rem→1.125rem, tipografía más grande
```

**Structure Decision**: Todos los cambios son de presentación visual; no hay nueva lógica de negocio ni nuevas dependencias.

## Complexity Tracking

| Violación | Por qué | Alternativa más simple rechazada |
|-----------|---------|----------------------------------|
| Ninguna | — | — |

## Plan de implementación (ya implementado)

### Fase 1: Diseño system global

- [x] 1.1 tailwind.config.js: aumentar fontSize (body-md 1rem→1.125rem, headline-lg 1.875→2.75rem, label-caps 0.6875→0.8125rem)
- [x] 1.2 althea-tokens.css: aumentar fuentes base (body-lg 1rem→1.5rem, body-md 0.875→1.375rem, body-sm 0.75→1rem, label 0.6875→1rem)
- [x] 1.3 althea-components.css: reducir padding paneles (space-5→space-4), aumentar métricas (difficulty-index, display-md), etiquetas font-weight 700, iconos 32→36px
- [x] 1.4 index.css: body font-size 1rem→1.125rem, text-title/section/subtitle/body/aux más grandes

### Fase 2: Rediseño de Inicio.tsx

- [x] 2.1 Hero compacto con saludo, estado del día, acciones (sin mapa muscular vacío)
- [x] 2.2 Top-grid: hidratación, macros (con MacroPlate), gasto calórico
- [x] 2.3 Secondary-grid: entrenamiento, actividad libre, registros de virtud
- [x] 2.3.1 Entrenamiento: tabla de ejercicios con series, reps, peso, descanso
- [x] 2.3.2 Actividad libre: tarjeta con color teal
- [x] 2.3.3 Registros de virtud: 4 AltheaMetric

### Fase 3: Componente MacroSummary

- [x] 3.1 Crear src/components/nutrition/MacroSummary.tsx con MacroPlate (gráfico circular)
- [x] 3.2 Barras de progreso por proteína/carbohidratos/grasas
- [x] 3.3 Línea de calorías totales vs objetivo

### Fase 4: Eliminar restricciones de ancho (11 páginas)

- [x] 4.1 App.tsx: quitar max-w-[1440px] shell-content
- [x] 4.2 Inicio.tsx: ya sin max-w restrictivo
- [x] 4.3 Progreso.tsx: quitar max-w-[1440px]
- [x] 4.4 Mas.tsx: quitar max-w-[720px]
- [x] 4.5 Actividad.tsx: quitar max-w-[720px]
- [x] 4.6 AdminFeedback.tsx: quitar max-w-[1440px]
- [x] 4.7 Biblioteca.tsx: quitar max-w-[1440px]
- [x] 4.8 Calendario.tsx: quitar max-w-[1440px]
- [x] 4.9 Entrenar.tsx: quitar max-w-[1440px] (3 ocurrencias)
- [x] 4.10 Feedback.tsx: quitar max-w-[1440px]
- [x] 4.11 Recuperacion.tsx: quitar max-w-[1440px]
- [x] 4.12 Rutina.tsx: quitar max-w-[1440px]

### Fase 4b: Login y Onboarding (touch targets)

- [x] 5.1 Login.tsx: quitar max-w-lg/md:max-w-3xl, min-w/min-h [44px] en botones de texto
- [x] 5.2 Onboarding.tsx: quitar max-w-lg/md:max-w-3xl, min-w/min-h [44px] en todos los botones de objetivo/nivel/días/equipamiento/sexo/dolor/áreas de dolor/restricciones

### Fase 6: Corrigir errores de encoding

- [x] 6.1 Entrenar.tsx: arreglar caracteres corruptos (sesión, navegación, visualización, qué, día)

## Pending Verification

- [x] 6.2 `npx tsc --noEmit` pasa sin errores
- [x] 6.3 `npm run lint` pasa sin warnings
- [x] 6.4 `npx vitest run`: 1646 tests pasan (2 fail preexistentes en Coach.test.tsx no relacionados)
- [x] 6.5 `npm run build` pasa exitosamente
- [x] 6.6 Playwright: touch targets 4/4 pasan en móvil
