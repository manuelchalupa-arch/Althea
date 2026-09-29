// Sub-módulo de nutrición WGER — FASES 11-13.
// Aislado de los módulos pre-existentes para evitar conflictos de tipos.
//
// WGER tiene su propio modelo nutricional. NO es equivalente al de Althea.
// CATÁLOGO → ingredient, PLAN → nutrition plan, COMIDA → meal, ITEM → meal item, REGISTRO → diary/log

export * from './types'
export * from './client'
export * from './mapper'
export * from './ingredientValues'
export * from './recipeComposer'
