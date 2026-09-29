// Integración Wger — capa aislada para enriquecimiento externo.
// FASE 1: Reglas arquitectónicas — WGER → wgerClient → wgerAdapter → wgerMapper → normalización → Dexie → servicios Althea → UI
// FASE 2: Identidad y vínculos — ExternalAccountLink y ExternalEntityLink
// FASE 3: Autenticación segura — no almacenar credenciales en Dexie
// FASE 4: Estrategia de matching para ejercicios — wgerExerciseMatcher
// FASE 5: Mappers y adapter para rutinas — wgerRoutineMapper, wgerRoutineAdapter
// FASE 6: Entrenamiento real — mappers para workout sessions y logs
// FASE 7: Series individuales — identidad propia por serie
// FASE 8: Modelo de carga/unidades interoperable
// FASE 9: Progresiones — reglas de Althea desde configs WGER
//
// Dexie = fuente de verdad local. Wger = fuente externa.
// NO reemplaza bibliotecas ni APIs existentes.

export * from './wgerTypes'
export * from './wgerMapper'
export * from './wgerAdapter'
export * from './wgerIntegration'
export * from './wgerAuth'
// Comparación de fuentes y decisión documentada (Wger vs ExerciseGymGifsDB).
export * from './wgerComparison'
// FASE 4: Estrategia de matching para ejercicios.
export {
  buildExerciseIndex,
  findMatch,
  shouldMerge,
  type MatchResult,
  type ExerciseIndex,
} from './wgerExerciseMatcher'
// FASE 5: Mappers y adapter para rutinas.
export {
  mapWgerRoutineToAlthea,
  mapAltheaRoutineToWger,
  mapWgerDayToAlthea,
  mapAltheaDayToWger,
  mapWgerSlotToAlthea,
  mapAltheaExerciseToWger,
  mapWgerProgressionToAlthea,
  type WgerRoutineWithDetails,
  type WgerRoutineProvenance,
} from './wgerRoutineMapper'
export {
  importWgerRoutines,
  listWgerRoutines,
  type ImportedRoutine,
  type RoutineImportOptions,
} from './wgerRoutineAdapter'
// FASE 6-9: Entrenamiento real, series, carga y progresiones
// Sub-módulo aislado para evitar conflictos con tipos pre-existentes
export * from './training'
// FASE 15-20: Sincronización bidireccional, conflictos, cola, salud
export {
  syncWgerToAlthea,
  syncAltheaToWger,
  syncEntity,
  pullChanges,
  pushChanges,
  resolveConflictById,
  retryFailedSync,
  getSyncStatusInfo,
  fetchAllWgerPages,
  type SyncDirection,
  type SyncEntityType,
  type SyncOperation,
  type SyncResult,
  type SyncOptions,
} from './wgerSyncEngine'
export {
  detectConflict,
  resolveConflict,
  getPendingConflicts,
  getResolvedConflicts,
  type ConflictResolution,
  type SyncConflict,
  type ConflictDetectionResult,
} from './wgerConflictResolver'
export {
  enqueueOperation,
  getPendingOperations,
  getFailedOperations,
  markOperationCompleted,
  markOperationFailed,
  markOperationSyncing,
  retryFailedOperations,
  cleanupCompletedOperations,
  getQueueStats,
  processQueue,
  type QueueOperationStatus,
  type SyncQueueItem,
  type EnqueueOptions,
  type QueueStats,
} from './wgerSyncQueue'
export {
  getSyncStatus,
  getLastRemoteSyncAt,
  getLastSuccessfulSyncAt,
  getRemoteVersion,
  getRemoteHash,
  updateSyncStatus,
  setRemoteVersion,
  setRemoteHash,
  loadHealthStatus,
  getHealthInfo,
  isSynced,
  hasConflicts,
  hasPendingOperations,
  resetHealthStatus,
  formatLastSyncTime,
  type WgerSyncStatus,
  type WgerHealthInfo,
} from './wgerHealth'
// FASE 10: Estadísticas — validación y comparación (no duplicar)
export * from './stats'
// FASE 11-13: Nutrición, valores nutricionales y recetas
export * from './nutrition'
// FASE 14: Progreso corporal — mediciones
export * from './measurements'
// FASE 27: Validación de respuestas con Zod
export {
  WgerListResponseSchema,
  WgerMuscleSchema,
  WgerEquipmentSchema,
  WgerCategorySchema,
  WgerLicenseSchema,
  WgerTranslationSchema,
  WgerExerciseListItemSchema,
  WgerExerciseInfoSchema,
  WgerRoutineListItemSchema,
  WgerDaySchema,
  WgerSlotSchema,
  WgerSlotEntrySchema,
  WgerWeightConfigSchema,
  WgerRepetitionsConfigSchema,
  WgerSetsConfigSchema,
  WgerRirConfigSchema,
  WgerRestConfigSchema,
  WgerWorkoutSessionSchema,
  WgerWorkoutLogSchema,
  WgerIngredientSchema,
  WgerNutritionPlanSchema,
  WgerMealSchema,
  WgerMealItemSchema,
  WgerMeasurementCategorySchema,
  WgerMeasurementSchema,
  WgerTrainingPlanSchema,
  WgerSetConfigSchema,
  WgerProgressionConfigSchema,
} from './wgerSchemas'
// wgerClient se exporta al final para evitar conflictos de nombres con wgerTrainingClient
export {
  WgerClient,
  fetchExerciseList,
  fetchExerciseInfo,
  fetchRoutines,
  fetchRoutine,
  fetchDays,
  fetchSlots,
  fetchSlotEntries,
  fetchWeightConfig,
  fetchRepetitionsConfig,
  fetchSetsConfig,
  fetchRirConfig,
  fetchRestConfig,
} from './wgerClient'
// FASE 21: Licencias y atribución
export {
  resolveWgerLicense,
  canRedistribute,
  canModify,
  requiresAttribution,
  mustShareAlike,
  buildAttribution,
  buildProvenanceMetadata,
  attributionFromExerciseImage,
  attributionFromIngredient,
  formatAttribution,
  verifyRedistributionAllowed,
  type WgerLicenseType,
  type WgerLicenseInfo,
  type WgerAttribution,
  type WgerProvenanceMetadata,
} from './wgerLicense'
// FASE 22: Seguridad
export {
  WGER_SECURITY_CONFIG,
  sanitizeString,
  sanitizeUrl,
  sanitizeErrorMessage,
  validateResponse,
  secureFetch,
  verifyOwnership,
  validateId,
  validatePagination,
  WgerSecurityError,
  handleSecurityError,
  type SecureFetchOptions,
  type ValidationResult,
  type OwnershipCheck,
} from './wgerSecurity'
// FASE 23: Observabilidad
export {
  createSyncLog,
  getSyncLogs,
  getSyncLogsByOperation,
  getSyncLogsByEntity,
  getSyncLogsByStatus,
  getSyncLogsByDateRange,
  getSyncLogSummary,
  clearSyncLogs,
  exportSyncLogs,
  type SyncLogEntry,
  type SyncLogSummary,
  type SyncLogStatus,
  type SyncLogOperation,
  type SyncLogEntity,
  type CreateSyncLogParams,
} from './wgerSyncLog'
// FASE 24: API interna estable
export type { IntegrationHealth, FullSyncResult } from './wgerIntegration'
