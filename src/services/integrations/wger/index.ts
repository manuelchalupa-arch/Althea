// Integración Wger — capa aislada para enriquecimiento externo.
// Dexie = fuente de verdad local. Wger = fuente externa.
// NO reemplaza bibliotecas ni APIs existentes.

export * from './wgerTypes'
export * from './wgerClient'
export * from './wgerMapper'
export * from './wgerAdapter'
// Comparación de fuentes y decisión documentada (Wger vs ExerciseGymGifsDB).
export * from './wgerComparison'
