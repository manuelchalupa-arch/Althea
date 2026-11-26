# Plan técnico — 007

1. `src/types/index.ts`: campos aditivos para preferencias (sin borrar legados).
2. `src/utils/profilePreferences.ts` (nuevo): resolución canónica de nivel/intensidad, extracción de restricciones y contexto IA mínimo (sin PII).
3. `src/pages/Onboarding.tsx`: reordenar pasos; quitar cálculos y rutina inicial; guardar merge aditivo; navegar a `/rutina` para elegir/crear.
4. `src/services/ai/methodSelector.ts`: usar nivel canónico y días disponibles del perfil.
5. `src/services/ai/routineBuilderIA.ts`: propagar preferencias al prompt, validación determinista y regeneración.
6. `src/services/ai/unifiedPipeline.ts`: contexto IA sin PII con los datos relevantes.
7. `src/pages/Perfil.tsx`: edición posterior de preferencias; datos físicos siguen en el formulario existente.
8. `src/utils/cycle.ts` + `src/pages/Inicio.tsx`: calendario desde rutina activa, sin relleno desde onboarding.
9. Tests: onboarding, preferencias, generación A/B/C y calendario. Verificar `npm test` y `npm run build`.
