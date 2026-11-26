# Informe de Relevamiento Onboarding (Parte 1)

**Propósito:** Cuadro de lectura única de todos los campos del onboarding, dónde se guardan y cómo se usan. SIN modificar el onboarding, SIN recomendaciones.

---

## Estructura de la tabla

| Dato | Dónde se guarda | Dónde se usa | Para qué sirve | Utilización comprobada |
|------|----------------|--------------|----------------|------------------------|

---

## Paso a paso (campo por campo)

### Paso 0: Objetivo (objPrincipal, objCustom, objSec)
- **Guardado:** `db.userProfile` (al crear perfil en `crear()`), también en `onboardingDraft` (Dexie) paso a paso
- **Uso:** `resolveTrainingGoal()` → define `trainingGoal` y `goalPrimary`; `goal` en perfil → define prioridad de macros/calorías; consume `coachInsights.ts`, `methodSelector.ts`, `routineBuilderIA.ts` para priorizar series/reps/cargas; afecta recomendaciones IA
- **Comprobada:** Sí — usada en `systemPrompt.ts`, `routineBuilderIA.ts`, `methodSelector.ts` para construir contexto y metas

### Paso 1: Nivel (nivel)
- **Guardado:** `db.userProfile` (al crear perfil)
- **Uso:** `coachContext.level`; `methodSelector.ts` para ajustar tono/ejercicios; `coachInsights.ts` para decidir qué mostrar
- **Comprobada:** Parcial — usado en `methodSelector.ts` como factor de tono, pero no crítico

### Paso 2: Días disponibles (diasDisponibles)
- **Guardado:** `db.userProfile` (`availableDays`), también `onboardingDraft`
- **Uso:** Define `initialTrainingDays` (días N°1..N); `routineStore` usa para `rotationDays` y `dayExercises`; `Inicio` muestra `planDays`/`selectorDays`; `Entrenar` agenda sesiones por día
- **Comprobada:** Sí — es la fuente principal para qué días entrenar

### Paso 3: Equipamiento (equipamiento)
- **Guardado:** `db.userProfile` (`equipment`), también `onboardingDraft`
- **Uso:** `methodSelector.ts` para filtrar ejercicios por equipment; `routineBuilderIA.ts` para sugerir sustituciones; `coachInsights.ts` para adaptar carga
- **Comprobada:** Sí — filtrado de ejercicios en múltiples lugares

### Paso 4: Horario (horarioEntreno)
- **Guardado:** `db.userProfile` (`trainingTime`)
- **Uso:** `coachContext.trainingTime`; `systemPrompt.ts` para adaptar recomendaciones de tiempo; algunas fórmulas de TDEE usan `diasDisponibles.length` no este campo directamente
- **Comprobada:** Parcial — usado en contexto del coach, no en cálculos críticos

### Paso 5: Coach (coachIntensity)
- **Guardado:** `db.userProfile` (`coachIntensity`)
- **Uso:** `coachContext.needs` + `coachContext.limitations`; `systemPrompt.ts` para tono del coach; `methodSelector.ts` para elegir método; `routineBuilderIA.ts` para planificación
- **Comprobada:** Sí — consumo amplio en prompts IA y selección de métodos

### Paso 6: Modalidad de entrenamiento (modalidad)
- **Guardado:** `db.userProfile` (`trainingModality`), también define `crossfit` vs `gym`
- **Uso:** `systemPrompt.ts` → diferente contexto según gym/crossfit; `methodSelector.ts` → métodos disponibles; `routineBuilderIA.ts` → planificación distinta; `Inicio` → calendario semanal; `Entrenar` → flujo de series y descansos
- **Comprobada:** Sí — define vías completamente diferentes en la app

### Paso 7: Datos básicos (nombre, email, sexo, fechaNacimiento, altura, peso, pesoObjetivo, needs)
- **Guardado:** `db.userProfile` (todos los campos de perfil al crear); `onboardingDraft` también guarda nombre/email/sexo/etc.
- **Uso:** `nombre` → saludo en `Inicio`; `email` → sin uso directo en app (solo perfil); `sexo` → Mifflin-St Jeor BMR en `calcTDEE`; `fechaNacimiento` → edad para BMR; `altura` + `peso` → IMC y TDEE; `pesoObjetivo` → meta de peso; `needs` → contexto coach libre texto
- **Comprobada:** Sí — todos los campos tienen uso documentado; `sexo/altura/peso` son la base de cálculos nutricionales

### Campos añadidos en Paso 7 (dolencia/limitaciones)

#### hasPain / painAreas / limDesc / restrictions / restDesc / excluded
- **Guardado:** `db.userProfile` bajo `limitations`, `painAreas`, `limitationDescription`; también `onboardingDraft` (hasPain, painAreas, limDesc, restrictions, restDesc, excluded)
- **Uso:** `allLimitations = [...(hasPain==='Sí' ? ['dolor'] : []), ...restrictions]` → perfil del coach (`coachContext.limitations`); `systemPrompt.ts` → adaptar ejercicios y cargas; `methodSelector.ts` → filtrar por dolor/movilidad; `routineBuilderIA.ts` → sustituciones; `Nutricion.tsx` → no afecta directamente; `Entrenar.tsx` → flujo de dolor post-ejercicio
- **Comprobada:** Sí — `limitations`/`painAreas` son consultadas en múltiples lugares para adaptar la planificación

---

## Campos sin uso comprobable (auditoría)

| Campo | Dónde se guarda | ¿Uso comprobado? | Hallazgo |
|-------|----------------|------------------|----------|
| `objSec` (objetivos secundarios) | `db.userProfile` (`goalsSecondary`) | Parcial | Cónsultado en `resolveTrainingGoal()` para definir `trainingGoal` secundario; algunos consumos en `systemPrompt.ts` pero no crítico |
| `biblioMuscle`, `biblioItems` (solo paso 7) | `onboardingDraft` → estado UI local, **no se guarda** en perfil/Dexie | No | Solo relevante durante onboarding; se descarta al crear perfil |
| `showBiblio` (solo paso 7) | Estado React local | No | Flag de UI, no persiste |
| `email` | `db.userProfile` | Debate | Guardado pero no usado en cálculos; algunas integraciones Futuras esperadas |
| `bmiCat`, `bmiCalculatedAt` | `db.userProfile` (calculados al crear) | No | Solo display, no usado en lógica subsiguiente |
| `weightLowerVariant`, `weightUpperVariant` | `db.userProfile` (calculados al crear) | No | Variantes para objetivo "grasa"/"masa"; usadas solo en `crear()` al guardar `targetWeightKg` |
| `coachContext` | `db.userProfile` | Sí | Contexto completo para coach IA (needs + limitations + excludedCount) |
| `sessionDurationMin` | `db.userProfile` | Parcial | Guardado pero no visto en UI activa; posible uso futuro |

---

## Resumen de utilización

- **Total de campos analizados:** 34 (incluyendo sub-campos)
- **Con uso comprobado:** ~22 campos (65%)
- **Sin uso comprobable:** ~12 campos (35%) — mayoría son variantes calculadas, flags de UI o campos legacy
- **Dependencias críticas:** `diasDisponibles`, `modalidad`, `sexo`, `altura`, `peso`, `needs`, `limitations`, `painAreas`
- **Onboarding → perfil:** Todos los campos se mapean a `db.userProfile` al ejecutar `crear()`, salvo flags de UI (`showBiblio`, `biblioMuscle`) que se pierden deliberadamente

---

## Conclusiones

1. El onboarding cubre todos los datos necesarios para la planificación inicial: objetivo, nivel, días, equipamiento, horario, modalidad, datos de perfil (sexo/altura/peso) y limitaciones/dolencias.
2. La mayor parte de los campos se persisten en `db.userProfile` y son consumidos por: `systemPrompt.ts`, `routineBuilderIA.ts`, `methodSelector.ts`, `coachInsights.ts`.
3. Algunos campos son "solo display" o calculados (IMC, variantes de peso) y no afectan lógica subsiguiente.
4. **No modificar** el onboarding ni los datos guardados; el informe es solo de lectura.