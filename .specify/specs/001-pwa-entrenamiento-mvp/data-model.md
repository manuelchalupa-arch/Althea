# Data Model – PWA Entrenamiento MVP

## Dexie DB: `trainPWA` v1

```ts
// db.ts
dexie.version(1).stores({
  userProfile:  'id',
  exercises:    'id, group, equipment, level, pattern, *tags',
  routines:     'id, createdAt',
  routineDays:  'id, routineId, weekday',
  routineExercises: 'id, routineDayId, exerciseId, order',
  sessions:     'id, routineId, localDate, createdAt',
  setLogs:      'id, sessionId, exerciseId, createdAt',
  recoveryChecks: 'id, localDate',
  painLogs:     'id, localDate, exerciseId',
  nutritionLogs:'id, localDate',
  hydrationLogs:'id, localDate',
  sleepLogs:    'id, localDate',
  recommendations: 'id, localDate, createdAt',
  syncQueue:    'id, entity, status, createdAt',
  notificationLog: 'id, localDate, type'
})
```

## Entidades

### UserProfile (singleton id='me')
- id, goal, level, availableDays[0-6], trainingTime, equipment[], units{weight:'kg'|'lb', liquid:'ml'|'oz'}, lang, coachIntensity, onboardingDone, hydrationGoalMl, createdAt, updatedAt

### Exercise
- id(uuid), name, alias?, groupMain(enum 11 grupos), groupsSecondary[], equipment(enum), level, pattern(enum: push/pull/squat/hinge/lunge/carry/core/full), description, instructions[], variantIds[], muscles[], restrictions[], tags[], icon, createdAt

### Routine
- id, name, description?, mesocycleId?, createdAt, updatedAt, archived

### RoutineDay
- id, routineId(FK), weekday(0-6), name("Lunes — Pecho+Tríceps")

### RoutineExercise
- id, routineDayId, exerciseId, order, targetSets, targetReps, targetWeight, restSec, rir, rpe, tempo?, notes?

### Session
- id, routineId?, localDate(YYYY-MM-DD), startedAt, finishedAt?, durationSec?, notes?, createdAt, updatedAt, synced

### SetLog
- id, sessionId, exerciseId, setNumber, weight, reps, rpe?, rir?, completed, isPR?, notes?, createdAt

### RecoveryCheck
- id, localDate, energy(1-10), fatigue(1-10), stress(1-10), sleepHours, sleepQuality(1-10), soreness(1-10), motivation(1-10), digestion(1-10), hydration(1-10), extraActivity?, score(0-100 computed), color('green'|'yellow'|'red')

### PainLog
- id, localDate, level('none'|'mild'|'moderate'|'severe'), zone, exerciseId?, moment, notes?

### NutritionLog
- id, localDate, time(HH:mm), description, quantity, kcal?, protein?, carbs?, fat?, notes?

### HydrationLog
- id, localDate, amountMl, cumulativeMl, time

### SleepLog
- id, localDate, bedTime, wakeTime, hours, quality(1-10)

### Recommendation
- id, localDate, type('load'|'volume'|'deload'|'variant'|'hydration'), text, reason, factors[], dataUsedIds[], decision('pending'|'accepted'|'rejected'|'modified'), modifiedValue?, createdAt

### SyncQueueItem
- id, entity, entityId, op, payload, createdAt, status('pending'|'syncing'|'done'|'error'), retries

## Reglas de cálculo (determinísticas)
- `volume = sets × reps × weight`; `tonnage = sum(volume) por sesión`; `PR = max(weight×reps) por ejercicio`.
- `recoveryScore = weighted avg(energy, -fatigue, -stress, sleepQuality, -soreness, motivation, digestion, hydration)` normalizado 0-100.
- `deloadTrigger`: si ≥2 de {RPE avg>8 últimos 7d, volumen acumulado >120% 3sem, score<60 3d seguidos} → sugerir deload.
- Unidades: almacenar siempre kg/ml; convertir solo en UI.

## Validación
- Todos los creates pasan por Zod schemas en `services/storage/validators.ts`.
- Import JSON valida versión y migra si `dbVersion < current`.

## Índices y queries
- Exercises indexado por group/equipment para filtros <100ms.
- Sessions por localDate para calendario.
- SetLogs por sessionId+exerciseId para gráficos de progresión.
