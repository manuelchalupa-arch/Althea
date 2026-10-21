# Tasks: 004-mejora-visual-pc

## 1. Diseño system global

- [x] 1.1 tailwind.config.js: aumentar fontSize (body-md 1rem→1.125rem, headline-lg 1.875→2.75rem, headline-md 1.375→2.125rem, headline-sm 1.125→1.875rem, label-caps 0.6875→0.8125rem)
- [x] 1.2 althea-tokens.css: aumentar fuentes base (body-lg 1rem→1.5rem, body-md 0.875→1.375rem, body-sm 0.75→1rem, label 0.6875→1rem)
- [x] 1.3 althea-components.css: reducir padding paneles (space-5→space-4), aumentar métricas (difficulty-index, display-md), aumentar etiquetas (body-md), iconos 32→36px
- [x] 1.4 index.css: aumentar body font-size 1rem→1.125rem, aumentar text-title/section/subtitle/body/aux, ajustar line-height

### Fase 2: Rediseño de Inicio.tsx

- [x] 2.1 Hero compacto con saludo, estado del día, acciones (sin mapa muscular vacío)
- [x] 2.2 Top-grid: hidratación, macros (con MacroPlate), gasto calórico en primera fila
- [x] 2.3 Secondary-grid: entrenamiento, actividad libre, registros de virtud
- [x] 2.3.1 Entrenamiento: tabla de ejercicios con series, reps, peso, descanso
- [x] 2.3.2 Actividad libre: tarjeta con color teal
- [x] 2.3.3 Registros de virtud: 4 AltheaMetric con texto más grande

### Fase 3: Componente MacroSummary

- [x] 3.1 Crear src/components/nutrition/MacroSummary.tsx con MacroPlate (gráfico circular)
- [x] 3.2 Barras de progreso por proteína/carbohidratos/grasas con texto grande
- [x] 3.3 Línea de calorías totales vs objetivo

### Fase 4: Eliminar restricciones de ancho (12 páginas)

- [x] 4.1 App.tsx: quitar max-w-[1440px] shell-content
- [x] 4.2 Inicio.tsx: sin restricciones de ancho
- [x] 4.3 Progreso.tsx: quitar max-w-[1440px]
- [x] 4.4 Mas.tsx: quitar max-w-[720px]
- [x] 4.5 Actividad.tsx: quitar max-w-[720px]
- [x] 4.6 AdminFeedback.tsx: quitar max-w-[1440px]
- [x] 4.7 Biblioteca.tsx: quitar max-w-[1440px]
- [x] 4.8 Calendario.tsx: quitar max-w-[1440px]
- [x] 4.9 Entrenar.tsx: quitar max-w-[1440px] (3 ocurrencias)
- [x] 4.10 Feedback.tsx: quitar max-w-[1440px] (2 ocurrencias)
- [x] 4.11 Recuperacion.tsx: quitar max-w-[1440px]
- [x] 4.12 Rutina.tsx: quitar max-w-[1440px]

### Fase 4b: Login y Onboarding (touch targets y ancho)

- [x] 5.1 Login.tsx: quitar max-w-lg/md:max-w-3xl, min-w/min-h [44px] en botones de texto
- [x] 5.2 Onboarding.tsx: quitar max-w-lg/md:max-w-3xl, min-w/min-h [44px] en todos los botones de objetivo, nivel, días, equipamiento, sexo, dolor, áreas de dolor, restricciones

### Fase 4c: Corrección de encoding en Entrenar.tsx

- [x] 6.1 Corregir caracteres corruptos: sesión, navegación, visualización, qué, día

### Fase 5: Verificación

- [x] 6.2 `npx tsc --noEmit` pasa sin errores
- [x] 6.3 `npm run lint` pasa sin warnings
- [x] 6.4 `npx vitest run`: 1646 tests pasan (2 fail preexistentes en Coach.test.tsx no relacionados)
- [x] 6.5 `npm run build` pasa exitosamente
- [x] 6.6 Playwright: touch targets 4/4 pasan en móvil; 18/18 tests de carga pasan
