// ExerciseGymGifsDB — fuente única de la URL base.
//
// Vive en su propio módulo (y no en `exerciseGym.ts`) a propósito: los tests
// mockean `@/services/exerciseGym` para aislar los constructores de rutina y
// los prompts, así que si esos módulos tomaran la constante de ahí, recibirían
// el mock (sin `BASE`) y fallarían. Al separarla, el texto de los prompts y el
// cliente HTTP comparten el mismo valor real sin acoplarse al mock.
//
// Repo: https://github.com/JahelCuadrado/ExerciseGymGifsDB
export const EXERCISE_GYM_BASE =
  'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0'
