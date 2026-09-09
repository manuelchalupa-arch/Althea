# Feature Specification: PWA Agenda Inteligente (Prompt Maestro)

**Feature Branch**: `002-pwa-agenda`
**Created**: 2026-09-07
**Status**: Draft (evolución de 001)
**Concepto**: "Abrir y saber qué toca hoy" — agenda del día, no dashboard saturado.

## Cambios respecto a 001

| Área | Antes | Ahora (Maestro) |
|---|---|---|
| Pantalla principal | Dashboard con módulos | Agenda diaria: fecha → Día N° → rutina → ejercicios → histórico → recomendación |
| Días | Lunes/Martes fijos | Día N°1..N configurables + calendario con inicio de ciclo y descansos flexibles |
| Rutinas | Semana fija | Ciclo: usuario define N días y mapa semanal (ej: Lun→1, Mar→2, Mie→descanso…) |
| Visual | Slate/indigo genérico | Paleta maestro: #0B1014 fondo, #1F272A tarjetas, #144D37 destacado, #21C063 acción, #38BDF0 info, Roboto |
| Coach | Pantalla aparte | Integrado en agenda con "¿Por qué?" |
| Rest day | Vacío | Agenda de recuperación (sueño, energía, agua) + próximo entreno |

## User Stories

### US1 — Agenda HOY (P1)
Al abrir la app offline, ve fecha actual, Día N° correspondiente según ciclo, rutina asociada y ejercicios con última carga/objetivo. Toca "Iniciar entrenamiento" y registra series ultra-rápido. Todo en ≤2 taps.

**Acceptance**:
- Dado ciclo inicio lunes con mapa [1,2,desc,3,4,desc,desc], cuando es jueves, entonces muestra Día N°3 automáticamente.
- Dado ejercicio con historial 70×8, muestra "Anterior 70×8, Objetivo 72.5×8, Mejor 80×6" editable.
- Selección manual de rutina solo como override.

### US2 — Configuración ciclo (P1)
En onboarding crea Día N°1 "Pecho+tríceps", Día N°2..., asigna inicio ciclo y qué días son descanso. Persiste en UserProfile.

### US3 — Día descanso (P2)
Si corresponde descanso, agenda muestra recuperación + hidratación + próximo entreno (no rutina vacía).

## Requirements (delta)
- **FR-A01**: UserProfile.cycleStartDate (ISO) + weekMap[0..6] = Día N° | null + trainingDays: {id,n, name}[]
- **FR-A02**: Lógica `getTrainingDayForDate(date)` determinística, sin servidor.
- **FR-A03**: UI agenda: header fecha grande + chip Día N°, lista ejercicios cards oscuras, botón primario #21C063.
- **FR-A04**: Design System: Tailwind extend con colores maestro, Roboto 400/500/600/700, radios 8/12/16/20, spacing 4-32, Lucide 2px.
- **FR-A05**: Coach inline en agenda con análisis local, botón "¿Por qué?" explicable, aceptar/modificar/rechazar.

## Success
- SC-A01: Abrir app → rutina de hoy visible en <1s sin navegar.
- SC-A02: Cambio paleta verificado contraste AA, Lighthouse PWA≥90.
- SC-A03: Nunca "Rutinas→Semana→Día" para entrenar; flujo es Abrir→Hoy→Entrenar.

## Plan técnico
Ver `plan.md` en esta carpeta.
