# Contracts – Storage & Sync

## Dexie Interface

```ts
export interface IStorageService {
  // Exercises
  listExercises(filter: ExerciseFilter): Promise<Exercise[]>
  getExercise(id: string): Promise<Exercise | undefined>
  // Routines
  createRoutine(input: RoutineInput): Promise<string>
  reorderRoutineExercises(routineDayId: string, orderedIds: string[]): Promise<void>
  // Sessions
  startSession(routineId?: string): Promise<string>
  logSet(input: SetLogInput): Promise<string>
  finishSession(id: string): Promise<void>
  // Recovery etc.
  upsertRecoveryCheck(input: RecoveryCheckInput): Promise<string>
  addHydration(amountMl: number): Promise<HydrationLog>
  // Export/Import
  exportJSON(): Promise<Blob>  // JSON con {version, tables...}
  importJSON(blob: Blob): Promise<ImportResult>
}
```

**Invariantes**: toda escritura genera UUID v4 + `updatedAt=nowISO()`; lectura nunca bloqueada por sync.

## Sync Queue Contract (F4, stub en F1)

```ts
POST /api/sync  { items: SyncQueueItem[] }  // solo pending
→ 200 { acceptedIds: string[], conflicts: Conflict[] }

Conflict resolution: last-write-wins por updatedAt; cliente re-aplica si server newer.
```

## AI Engine Contract

```ts
export interface IAIEngine {
  suggestLoad(exerciseId: string, history: SetLog[]): Promise<LoadSuggestion>
  analyzeRecovery(checks: RecoveryCheck[]): Promise<Recommendation>
  suggestVariant(exerciseId: string, pain: PainLog): Promise<Exercise[]>
}
type LoadSuggestion = { weight: number; reps: number; reason: string; factors: string[] }
```

F1 implementa `LocalAIEngine` con reglas determinísticas; F4 delega a `/api/ai/*` sin cambiar firma.

## Validation Contract

- `importJSON` valida con Zod; si `version` mismatch → migrar; si invalid → error con `issues[]` detallado.
- Export incluye `meta: {appVersion, dbVersion, exportedAt, localDate}`.
