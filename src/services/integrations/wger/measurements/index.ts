// Sub-módulo de mediciones WGER — FASE 14.
// Aislado de los módulos pre-existentes para evitar conflictos de tipos.
//
// WGER permite almacenar métricas corporales con categoría, unidad y timestamp.
// No importar datos médicos o métricas sin correspondencia clara.
// No sobrescribir mediciones locales existentes.
// En conflictos: ALTHEA LOCAL → conservar, WGER REMOTO → conservar separadamente, CONFLICTO → registrar para revisión.

export * from './types'
export * from './client'
export * from './mapper'
