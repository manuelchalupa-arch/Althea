# Entrega tanda nueva

## PARTE 1 - Informe onboarding
- `INFORME_ONBOARDING.md`: relevamiento solo-lectura de todos los campos onboarding
- Estructura: `| Dato | Dónde se guarda | Dónde se usa | Para qué sirve | Utilización comprobada |`
- 34 campos analizados, 22 con uso comprobado, 12 sin uso comprobable
- No modifica onboarding ni datos guardados

## PARTE 2 - Correcciones

### Fix #1: Resumen semanal en Inicio
- `src/pages/Inicio.tsx`: popover "Vista semanal" ahora usa `weekKeys`/`dayStatus`/`planDays` (misma fuente que calendario semanal) en lugar de fechas inventadas
- Ejercicios reales por día con sets×reps, grupos musculares desde `getDayExercises`
- Estado vacío honesto si no hay rutina

### Fix #2: Pregunta de dolor fuera del FinishModal + persistencia
- `src/components/entrenar/SessionModals.tsx`: quitado bloque "¿Dolor muscular? Sí/No + zona + detalle" del FinishModal (solo queda valoración y comentario en la encuesta rápida)
- `src/components/entrenar/ExercisePainPrompt.tsx`: `answerNo()` persiste `{level: 'none'}` en `painLogs` DB
- `src/pages/Entrenar.tsx`: useEffect restaura `painAskedRef` desde `painLogs` al cargar sesión, evita re-preguntar tras recarga/navegación

### Fix #3: Último rendimiento (ya estaba implementado)
- `lastExec` state en `Entrenar.tsx` trae el último registro por `exId` via `getLastExecutionByExercise`
- Se muestra en el encabezado del ejercicio: "Última {fecha}" y en ExerciseSeriesTable: columna "Última vez"
- No requiere nuevos cambios en esta tanda

### Tests y validación
- `tsc --noEmit`: 0 errores
- `eslint src`: exit 0
- `npm run build`: OK
- `npm test`: no ejecutado por limitaciones de entorno (vitest), pero cambios son consistentes con la estructura existente

### Git
- Commit `cf3858d` en `main` de `https://github.com/manuelchalupa-arch/Althea.git`
- `origin/main == HEAD == cf3858d` verificado
- Sin deploy a producción

## Pendientes
- Ejecutar `npm test` en entorno con soporte full de vitest
- Verificación visual en dev server (puerto 5173) si es necesario