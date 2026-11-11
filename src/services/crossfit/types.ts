/**
 * Tipos del módulo CrossFit. Solo aditivo: no toca modelos existentes.
 * Los WOD referencian ejercicios de la biblioteca general de Althea
 * (`Exercise.id` o `custom/<hex>`); nunca duplican la biblioteca.
 */

/** Modalidad CrossFit: Gimnasia, MetCon, Weightlifting. */
export type CfModality = 'G' | 'M' | 'W'

/** Clasificación de una sesión programada. */
export type CfSessionKind =
  | 'G'
  | 'M'
  | 'W'
  | 'G+M'
  | 'G+W'
  | 'M+W'
  | 'G+M+W'
  | 'recovery'
  | 'rest'

export type CfFormat = 'AMRAP' | 'FOR_TIME' | 'EMOM' | 'TABATA' | 'CHIPPER' | 'INTERVAL'

/** Nivel de ejecución / escalado. */
export type CfLevel = 'rx' | 'scaled' | 'beginner' | 'adapted'

export type CfBlockType = 'warmup' | 'mobility' | 'skill' | 'strength' | 'wod' | 'cooldown'

/** Movimiento dentro de un WOD. `exerciseId` enlaza con la biblioteca de Althea. */
export interface CfMovement {
  exerciseId?: string
  name: string
  modality: CfModality
  order: number
  /** Repeticiones por ronda (AMRAP/FOR_TIME/CHIPPER) o por minuto (EMOM). */
  reps?: number
  /** Rondas propias del movimiento (p.ej. chipper con rondas internas). */
  rounds?: number
  distanceM?: number
  /** Carga RX en kg. */
  loadKg?: number
  /** Texto de carga dual o escala (p.ej. "43/30", "sin carga"). */
  loadText?: string
  /** Minuto al que pertenece (EMOM con ejercicios distintos por minuto). */
  minute?: number
  notes?: string
}

export interface CfBlock {
  type: CfBlockType
  title: string
  content: string
  order: number
}

export interface CfWod {
  id: string
  name: string
  format: CfFormat
  /** Objetivo fisiológico (p.ej. "umbral aeróbico", "potencia de cuello"). */
  objective: string
  modalities: CfModality[]
  /** Duración total en segundos (AMRAP, TABATA, INTERVAL work+rest por ronda). */
  durationSec?: number
  timeCapSec?: number
  /** Rondas totales (FOR_TIME, CHIPPER, INTERVAL). */
  rounds?: number
  restSec?: number
  intervalWorkSec?: number
  intervalRestSec?: number
  movements: CfMovement[]
  equipment: string[]
  instructions: string[]
  /** Dificultad técnica del WOD. */
  level: 'principiante' | 'intermedio' | 'avanzado'
  /** Id de benchmark oficial si corresponde (cfBenchmarks). */
  benchmarkId?: string
  /** Plantilla guardada para reutilizar en la programación. */
  isTemplate: boolean
  /** Clasificación automática corregida a mano por el usuario. */
  modalitiesManual?: boolean
  source: 'user' | 'benchmark' | 'seed'
  createdAt: string
  updatedAt: string
}

export interface CfScheduleEntry {
  id: string
  /** Fecha local YYYY-MM-DD. */
  date: string
  kind: CfSessionKind
  wodId?: string
  title?: string
  blocks?: CfBlock[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CfResult {
  id: string
  /** YYYY-MM-DD. */
  date: string
  wodId?: string
  benchmarkId?: string
  wodName: string
  format: CfFormat
  level: CfLevel
  /** Puntuación legible: "8 rondas + 12 reps", "7:32", "210 reps". */
  scoreText: string
  timeSec?: number
  rounds?: number
  reps?: number
  rpe?: number
  loadText?: string
  scalingNotes?: string
  notes?: string
  isBenchmark: boolean
  /** true cuando se alteró el estándar original del benchmark. */
  standardModified?: boolean
  createdAt: string
  updatedAt: string
}

export interface CfMark {
  id: string
  /** Movimiento de la lista de marcas (backSquat, snatch, ...). */
  movement: string
  /** 1RM, 3RM, 5RM... */
  reps: number
  valueKg: number
  date: string
  notes?: string
  createdAt: string
  updatedAt: string
}

/**
 * Estado del cronómetro WOD activo. Local-only (no sincroniza): es estado de
 * UI en curso, igual que restTimerState. Se persiste en Dexie para sobrevivir
 * a recargas y segundo plano; se reconstruye con base en Date.now().
 */
export interface CfTimerState {
  id: string
  wodId?: string
  format: CfFormat
  /** Configuración del formato (duración, cap, rondas, intervalos) para poder
   * reanudar el cronómetro tras recargar la app. */
  config?: Omit<import('./wodTimer').WodFormatConfig, 'format'>
  /** epoch ms del último arranque (o del inicio si está corriendo). */
  startedAtMs: number
  /** Milisegundos ya acumulados antes del tramo actual. */
  accumulatedMs: number
  running: boolean
  /** Ronda actual (1-based). */
  round: number
  /** Índice del movimiento actual (chipper/for time). */
  movementIdx: number
  /** Minuto actual (EMOM/intervalos). */
  intervalIdx: number
  updatedAt: string
}
