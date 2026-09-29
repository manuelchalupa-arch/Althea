// Sub-módulo de estadísticas WGER — FASE 10.
// Aislado de los módulos pre-existentes para evitar conflictos de tipos.
//
// WGER puede servir como: validación, comparación, importación, enriquecimiento, compatibilidad.
// NO duplicar estadísticas si Althea ya puede calcularlas a partir de su historial canónico.
// Preferencia: Althea calcula sus propias métricas.

export * from './types'
export * from './client'
export * from './mapper'
