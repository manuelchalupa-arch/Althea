# Feature Specification: PWA Entrenamiento, Recuperación y Coach IA

**Feature Branch**: `001-pwa-entrenamiento-mvp`

**Created**: 2026-09-07

**Status**: Draft

**Input**: Requisitos completos del usuario (55 secciones) para PWA móvil-first offline-first con coach virtual, tracking de entrenamiento/nutrición/hidratación/recuperación y sistema de recomendaciones.

## Análisis Previo (Requisito 55)

**Contradicciones detectadas y resueltas:**
- Actividad sexual (20) vs privacidad estricta (30): resolver con almacenamiento 100% local, opt-in, nunca sync por defecto, exclusión de exports sin consentimiento explícito.
- Coach "modo extremo" (24) vs no humillar (24) y no discriminatorio: resolver con guardrails: lenguaje agresivo solo motivacional, lista bloqueada de insultos degradantes/discriminación/amenazas, filtro server-side si hay proxy.
- Push "máx 2/día" (25) vs sincronización/background (03,48): resolver con control de frecuencia y suppress si acción ya completada.
- "Gratis sin costos obligatorios" (53) vs IA externa (22,39): resolver con motor local determinístico como default y IA externa solo opt-in vía proxy.

**Mejoras propuestas:**
- Añadir Web App Manifest `shortcuts` para "Registrar serie" / "Agua +250ml".
- Añadir Badging API y periodic sync solo si disponible.
- Versionado de esquemas IndexedDB con migraciones Dexie.

---

## User Scenarios & Testing

### User Story 1 - Entrenar offline y ver progreso (Priority: P1)
Usuario abre la app sin internet, ve "¿Qué tengo que hacer hoy?" con rutina del día, registra series (peso×reps+RPE), ve "Última vez: 70×8" y sugerencia determinística "Objetivo: 72.5×8", finaliza sesión y ve historial/calendario actualizado y gráfico de volumen.

**Why this priority**: Núcleo del producto; sin esto no hay retención. Todo el offline-first se valida aquí.
**Independent Test**: En avión mode, crear rutina Lunes Pecho+Tríceps, ejecutar sesión completa, cerrar pestaña, reabrir y verificar que todo persiste y gráficos muestran tonelaje.
**Acceptance Scenarios**:
1. **Given** app instalada sin conexión, **When** usuario crea ejercicio "Press banca" y rutina, **Then** rutina disponible en Inicio y Entrenar sin recargar.
2. **Given** sesión previa 70kg×8, **When** usuario inicia mismo ejercicio, **Then** ve "Última vez 70×8" y objetivo sugerido (no obligatorio).
3. **Given** sesión en curso, **When** registra 4×8, **Then** volumen calculado (series×reps×peso) y almacenado en IndexedDB, calendario marca día como completado.

### User Story 2 - Rutinas y biblioteca de ejercicios con variantes (Priority: P1)
Usuario busca ejercicios por grupo muscular/equipamiento, crea rutinas con drag&drop, marca dolor leve en un ejercicio y recibe variante de mismo patrón (ej: press banca → press mancuernas → máquina pecho) sin perder historial.

**Why this priority**: Constructor de rutinas es diferenciador vs planilla; variante inteligente evita lesión.
**Independent Test**: Filtrar "pecho + barra", crear rutina 4 ejercicios, reordenar, marcar molestia moderada en press banca y verificar sugerencia de variante + nota de reemplazo.
**Acceptance Scenarios**:
1. **Given** biblioteca con 80+ ejercicios, **When** filtra por "cuádriceps + mancuerna + principiante", **Then** lista filtra en <100ms local.
2. **Given** rutina creada, **When** arrastra ejercicio de posición 4 a 2 (en móvil con handle), **Then** orden persiste offline.
3. **Given** dolor moderado en hombro asociado a press banca, **When** solicita variante, **Then** sistema propone 2-3 alternativas mismo patrón/grupo y registra reemplazo.

### User Story 3 - Hidratación, nutrición y recuperación diarias (Priority: P2)
Usuario hace check-in diario (energía, sueño, fatiga, hidratación), registra agua con botones 250/500/750, registra comida cualitativa (y opcional macros), ve índice recuperación 0-100 con semáforo y tendencia semanal.

**Why this priority**: Completa loop de fatiga/recuperación necesario para recomendaciones posteriores; es Fase 2 pero especificado para data-model.
**Independent Test**: Registrar 3 días de check-ins, 1850/2500ml agua, 2 comidas sin calorías y verificar dashboard muestra hidratación, recuperación con color y gráfico sueño.
**Acceptance Scenarios**:
1. **Given** objetivo 2500ml, **When** toca +250 cuatro veces, **Then** progreso 1000/2500 y barra visual actualiza instantáneo.
2. **Given** check-in con sueño 6h calidad baja, **When** guarda, **Then** recuperación baja (🔴) y coach sugiere reducir intensidad con explicación.
3. **Given** comida "arroz con pollo – porción mediana", **When** guarda sin macros, **Then** se almacena cualitativo y no bloquea flujo.

### User Story 4 - Coach y periodización transparente (Priority: P2)
Usuario selecciona objetivo (hipertrofia) y modo coach (profesional), ve recomendación "Reducir volumen esta semana porque…" con botón "¿Por qué?" que explica factores (RPE alto + volumen acumulado + sueño bajo), y puede aceptar/rechazar/modificar.

**Why this priority**: Diferencial IA explicable; requiere historial para no ser aleatorio.
**Independent Test**: Tras 3 semanas carga progresiva + RPE 9 + fatiga alta, verificar que coach propone deload con justificación y que rechazarlo queda logueado.
**Acceptance Scenarios**:
1. **Given** 3 semanas volumen creciente y fatiga en ascenso, **When** abre Coach, **Then** ve recomendación deload con lista de factores.
2. **Given** recomendación "aumentar a 75kg", **When** usuario modifica a 72.5, **Then** decisión y motivo quedan guardados para aprendizaje.
3. **Given** sin conexión, **When** solicita análisis, **Then** motor local devuelve recomendación básica sin llamar API externa.

### User Story 5 - PWA instalable y primer uso (Priority: P1)
Nuevo usuario abre la URL, ve onboarding de 7 pasos (objetivo, nivel, días, equipamiento, horario, coach, notificaciones), instala la PWA desde el navegador, abre desde launcher a pantalla completa, ve splash, funciona offline.

**Why this priority**: Sin instalación y onboarding no hay activación.
**Independent Test**: Lighthouse PWA audit ≥90, instalar en Android, modo avión, verificar que Inicio/Entrenar/Progreso funcionan.
**Acceptance Scenarios**:
1. **Given** primera visita, **When** completa onboarding en <2 min, **Then** se genera configuración inicial y dashboard personalizado sin crear cuenta.
2. **Given** app instalada, **When** no hay internet, **Then** no muestra "sin conexión" bloqueante; solo banner discreto y funciones offline operativas.
3. **Given** actualización disponible, **When** Service Worker detecta nueva versión, **Then** muestra toast "Nueva versión disponible – Actualizar".

### Edge Cases
- IndexedDB llena / cuota excedida → mostrar aviso y ofrecer export+limpieza de datos demo/antiguos.
- Reloj del dispositivo desfasado → usar `Date.now()` local pero guardar `createdAt` ISO + `localDate` YYYY-MM-DD para calendario.
- Drag&drop no disponible (dispositivo sin pointer fino) → fallback con botones ↑/↓.
- Dolor importante marcado → bloquear sugerencia de continuar, mostrar aviso "Consultar profesional" y exigir confirmación para registrar serie.
- Import JSON con esquema antiguo → migrar con versionado Dexie y validar con Zod.
- Push permission denegado → no re-solicitar agresivamente, ofrecer recordatorio manual en dashboard.

## Requirements

### Functional Requirements
- **FR-001**: PWA instalable con manifest, icons (192/512), splash, display standalone y orientación portrait.
- **FR-002**: Service Worker cachea app shell (HTML/CSS/JS) y datos estáticos; estrategia stale-while-revalidate para assets, network-first para sync opcional.
- **FR-003**: Persistencia primaria IndexedDB via Dexie; localStorage solo para prefs pequeñas (tema, onboardingDone).
- **FR-004**: Biblioteca de ejercicios con ≥80 ejercicios con campos: id, nombre, alias, grupo principal/secundarios, equipamiento, nivel, patrón, descripción, instrucciones, variantes, músculos, restricciones, etiquetas; búsqueda y filtros.
- **FR-005**: Constructor de rutinas: seleccionar días, ejercicios, series/reps/peso/descanso/RIR/RPE/tempo/notas; reordenar drag&drop con fallback.
- **FR-006**: Registro de sesión: por serie peso, reps, RPE/RIR opcional, completada, notas; mostrar última vez y objetivo sugerido; edición libre.
- **FR-007**: Cálculo determinístico offline: volumen, tonelaje, promedios, PR, cumplimiento, tendencias; gráficos de evolución por ejercicio.
- **FR-008**: Periodización: micro/meso/macrociclo con bloques personalizables por usuario.
- **FR-009**: Sistema fatiga/recuperación: check-in diario (energía, cansancio, estrés, sueño horas/calidad, dolor, motivación, digestión, hidratación, actividad adicional) → índice 0-100 con semáforo.
- **FR-010**: Dolor/molestias: nivel, zona, ejercicio asociado, momento, observaciones; si dolor importante → advertencia + sugerir alternativa.
- **FR-011**: Variantes inteligentes por patrón/grupo/equipamiento/nivel; registro de reemplazo sin perder historial.
- **FR-012**: Nutrición: registro cualitativo (comida, hora, cantidad, obs) y opcional macros; no obligar conteo calorías.
- **FR-013**: Hidratación: contador diario con objetivo configurable, presets 250/500/750 + custom, progreso diario/semanal.
- **FR-014**: Sueño: hora acostarse/levantarse, horas totales y calidad; tendencias semanales.
- **FR-015**: Dato actividad sexual opcional, privado, solo local por defecto, sin conclusiones médicas.
- **FR-016**: Motor local de recomendaciones (reglas) + IA externa opcional vía backend proxy; app funciona sin IA; cambio de proveedor sin tocar núcleo.
- **FR-017**: Coach configurable (profesional/motivacional/duro/extremo con guardrails anti-discriminación) y que señale incumplimientos.
- **FR-018**: Notificaciones push máx 2/día (seguimiento + pre-entreno), horarios configurables por zona horaria, supresión si acción ya hecha, control frecuencia.
- **FR-019**: Calendario mensual/semanal con entrenos, descanso, completadas/omitidas, peso, recuperación, hidratación; tap en fecha → resumen.
- **FR-020**: Estadísticas: entrenamiento (sesiones/cumplimiento/volumen/tonelaje/PR/evolución), cuerpo (peso/medidas), recuperación, hidratación.
- **FR-021**: Logros gamificados opcionales sin incentivar entrenar lesionado.
- **FR-022**: Privacidad Local-First: explicar qué se sincroniza si se habilita; sin trackers.
- **FR-023**: Export JSON/CSV + PDF resumen opcional; import JSON con migración.
- **FR-024**: Modo demo: cargar/eliminar datos ficticios multi-semana.
- **FR-025**: Navegación inferior móvil: Inicio | Entrenar | Progreso | Coach | Más; 2-3 taps a cualquier función.
- **FR-026**: Configuración: objetivo, días, horario, equipamiento, nivel, unidades kg/lb, idioma, intensidad coach, notificaciones, sync, privacidad.
- **FR-027**: Sincronización opcional: Local → Queue → Server → Confirm → conflict resolution con UUID + updatedAt.
- **FR-028**: Onboarding 7 pasos sin cuenta obligatoria.
- **FR-029**: Transparencia IA: cada recomendación guarda fecha/motivo/datos/decisión; botón "¿Por qué?".
- **FR-030**: Accesibilidad WCAG AA, responsive mobile-first (Android prioritario).

### Key Entities
- **UserProfile**: prefs, objetivo, nivel, días disponibles, horario, unidades, idioma, coachIntensity, notifs, syncEnabled.
- **Exercise**: ver FR-004.
- **Routine / RoutineDay / RoutineExercise**: plantilla semanal (ej: Lunes Pecho+Tríceps).
- **Session / SetLog**: sesión realizada con fecha, rutina origen, array de series (peso,reps,RPE,RIR,completed,notes).
- **RecoveryCheck**: check-in diario con métricas subjetivas + índice calculado.
- **PainLog**: zona, nivel, ejercicio, momento, obs.
- **NutritionLog / HydrationLog / SleepLog**: registros diarios.
- **Recommendation**: fecha, tipo, datos usados, texto, motivo, decisión usuario.
- **SyncQueueItem**: entity, id, op (create/update/delete), payload, timestamp, status.

## Success Criteria
- **SC-001**: Usuario completa onboarding e instala PWA en <3 min con Lighthouse PWA ≥90, performance ≥85 en Moto G4 simulado.
- **SC-002**: 100% de funciones críticas (ver rutina, registrar serie, historial, stats, agua, comida, recuperación) funcionan en modo avión tras instalación.
- **SC-003**: Navegación a cualquier función en ≤3 taps; dashboard responde "¿Qué hacer hoy?" en <1s en 3G lento.
- **SC-004**: Cálculos de volumen/PR/tendencias coinciden con valores manuales (tests determinísticos 100% pass).
- **SC-005**: Export JSON re-importado en dispositivo limpio restaura rutinas+sesiones idénticas; modo demo carga/elimina sin dejar residuos.
- **SC-006**: Recomendación de deload aparece solo cuando ≥2 señales de fatiga (RPE alto, volumen acumulado, recuperación baja) y siempre con explicación.
- **SC-007**: Bundle inicial <150KB gzip (sin lazy chunks); Service Worker actualiza sin romper IndexedDB.
- **SC-008**: Push máx 2/día respetado; no se envía si sesión ya completada.

## Assumptions
- Target: Android Chrome 110+ como primario; iOS Safari soportado con limitaciones PWA.
- Sin backend obligatorio en F1-F3; F4 añade sync/IA externa opcional.
- Unidades por defecto kg y ml; conversión a lb/oz solo presentación.
- Idioma inicial español (es), i18n preparado para expandir.
- Actividad sexual desactivada por defecto (opt-in).
- Notificaciones web push via Service Worker; si no permitido, fallback a recordatorios in-app.
