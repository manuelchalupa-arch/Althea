import type { CfFormat, CfMovement } from './types'

/**
 * Catálogo estático de benchmarks oficiales de CrossFit (Girls + Hero WODs)
 * con helpers puros. Sin Dexie ni UI: los resultados reales viven en cfStore
 * (`listBenchmarkResults` por `benchmarkId`).
 *
 * Los estándares y las dedicatorias se tomaron de crossfit.com/benchmark/*
 * (páginas oficiales). Donde la carga se publica en libras, `loadText` trae
 * la conversión métrica más divulgada.
 */

export type CfBenchmarkCategory = 'girl' | 'hero'

export interface CfBenchmark {
  /** kebab-case estable, ej 'fran', 'murph'. */
  id: string
  /** Nombre oficial. */
  name: string
  category: CfBenchmarkCategory
  /** 1-2 frases de contexto real (crossfit.com). */
  history: string
  format: CfFormat
  durationSec?: number
  timeCapSec?: number
  rounds?: number
  /** Ordenados, con reps/carga/distancia reales del estándar. */
  movements: CfMovement[]
  equipment: string[]
  /** Cómo se puntúa: tiempo (menor = mejor) o rondas/reps (mayor = mejor). */
  scoreType: 'time' | 'volume'
  /** Escalados estándar por nivel. */
  scale: Partial<Record<'rx' | 'scaled' | 'beginner', string>>
}

export const CF_BENCHMARKS: CfBenchmark[] = [
  // ── Girls ────────────────────────────────────────────────────────────────
  {
    id: 'fran',
    name: 'Fran',
    category: 'girl',
    history:
      "Creado por Greg Glassman a los 16 años combinando gimnasia y levantamiento; es uno de los 'Girls' originales del main site de CrossFit.",
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Thruster', modality: 'W', order: 1, notes: '21-15-9 reps', loadKg: 43, loadText: '43/30 kg' },
      { name: 'Pull-Up', modality: 'G', order: 2, notes: '21-15-9 reps' },
    ],
    equipment: ['barra', 'barra de dominadas'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX: thrusters 43/30 kg con pull-ups',
      scaled: 'Thrusters 30/21 kg con pull-ups con banda',
      beginner: 'Thrusters con barra ligera (20/15 kg) y Ring Rows',
    },
  },
  {
    id: 'grace',
    name: 'Grace',
    category: 'girl',
    history:
      "Girl del main site de CrossFit: 30 clean & jerk en contrarreloj; la prueba rápida de potencia con barra.",
    format: 'FOR_TIME',
    movements: [
      { name: 'Clean and Jerk', modality: 'W', order: 1, reps: 30, loadKg: 61, loadText: '61/43 kg' },
    ],
    equipment: ['barra'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (61/43 kg)',
      scaled: 'Clean & jerk 43/30 kg',
      beginner: 'Power clean y push press por separado con 30/20 kg',
    },
  },
  {
    id: 'isabel',
    name: 'Isabel',
    category: 'girl',
    history:
      "Girl del main site de CrossFit (11 de noviembre de 2004): 30 snatch para tiempo; el CrossFit Journal la llamó la 'mejor amiga' de Grace.",
    format: 'FOR_TIME',
    movements: [
      { name: 'Snatch', modality: 'W', order: 1, reps: 30, loadKg: 61, loadText: '61/43 kg' },
    ],
    equipment: ['barra'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (135/95 lb ≈ 61/43 kg)',
      scaled: 'Snatch 43/30 kg',
      beginner: 'Power snatch con 30/20 kg',
    },
  },
  {
    id: 'karen',
    name: 'Karen',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 150 wall balls seguidas; mide el ritmo sostenido con una carga ligera.',
    format: 'FOR_TIME',
    movements: [
      { name: 'Wall Ball', modality: 'M', order: 1, reps: 150, loadKg: 9, loadText: '9/6 kg' },
    ],
    equipment: ['pelota de pared', 'pared'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (9/6 kg)',
      scaled: 'Pelota 6/4 kg',
      beginner: 'Pelota ligera con la diana más baja',
    },
  },
  {
    id: 'diane',
    name: 'Diane',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 21-15-9 de peso muerto y handstand push-ups; fuerza de cadera y empuje vertical bajo fatiga.',
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Deadlift', modality: 'W', order: 1, notes: '21-15-9 reps', loadKg: 100, loadText: '100/70 kg' },
      { name: 'Handstand Push-Up', modality: 'G', order: 2, notes: '21-15-9 reps' },
    ],
    equipment: ['barra', 'pared'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (100/70 kg)',
      scaled: 'Peso muerto 70/45 kg con HSPU a caja',
      beginner: 'Peso muerto ligero y Pike Push-Ups',
    },
  },
  {
    id: 'elizabeth',
    name: 'Elizabeth',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 21-15-9 de squat cleans; técnica de recepción cuando ya estás cansado.',
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Squat Clean', modality: 'W', order: 1, notes: '21-15-9 reps', loadKg: 61, loadText: '61/43 kg' },
    ],
    equipment: ['barra'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (61/43 kg)',
      scaled: 'Squat clean 43/30 kg',
      beginner: 'Power clean con 30/20 kg',
    },
  },
  {
    id: 'helen',
    name: 'Helen',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 3 rondas de carrera de 400 m, kettlebell swings y pull-ups; tres estilos encadenados.',
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Running', modality: 'M', order: 1, distanceM: 400 },
      { name: 'Kettlebell Swing', modality: 'M', order: 2, reps: 21, loadKg: 24, loadText: '24/16 kg' },
      { name: 'Pull-Up', modality: 'G', order: 3, reps: 12 },
    ],
    equipment: ['pista', 'kettlebell', 'barra de dominadas'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (24/16 kg)',
      scaled: 'Kettlebell 16/12 kg y pull-ups con banda',
      beginner: 'Carrera de 200 m, swing ligero y Ring Rows',
    },
  },
  {
    id: 'angie',
    name: 'Angie',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 100 reps de cada ejercicio en orden fijo; sin prisa, pero sin descansos largos.',
    format: 'FOR_TIME',
    movements: [
      { name: 'Pull-Up', modality: 'G', order: 1, reps: 100 },
      { name: 'Push-Up', modality: 'G', order: 2, reps: 100 },
      { name: 'Sit-Ups', modality: 'G', order: 3, reps: 100 },
      { name: 'Air Squat', modality: 'G', order: 4, reps: 100 },
    ],
    equipment: ['barra de dominadas', 'peso corporal'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX: 100 de cada uno en el orden dado',
      scaled: 'Pull-ups con banda y push-ups de rodillas',
      beginner: '50 de cada uno con Ring Rows',
    },
  },
  {
    id: 'barbara',
    name: 'Barbara',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 5 rondas del circuito de Angie con 3 minutos de descanso entre rondas.',
    format: 'FOR_TIME',
    rounds: 5,
    movements: [
      { name: 'Pull-Up', modality: 'G', order: 1, reps: 20, notes: '3 min de descanso entre rondas' },
      { name: 'Push-Up', modality: 'G', order: 2, reps: 30 },
      { name: 'Sit-Ups', modality: 'G', order: 3, reps: 40 },
      { name: 'Air Squat', modality: 'G', order: 4, reps: 50 },
    ],
    equipment: ['barra de dominadas', 'peso corporal'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX: 5 rondas con 3 min de descanso',
      scaled: 'Pull-ups con banda y push-ups de rodillas',
      beginner: '10/15/20/25 reps por ronda',
    },
  },
  {
    id: 'chelsea',
    name: 'Chelsea',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 30 minutos del circuito de Cindy; se puntúan rondas y reps acumuladas.',
    format: 'AMRAP',
    durationSec: 1800,
    movements: [
      { name: 'Pull-Up', modality: 'G', order: 1, reps: 5, notes: 'por ronda, AMRAP de 30 min' },
      { name: 'Push-Up', modality: 'G', order: 2, reps: 10 },
      { name: 'Air Squat', modality: 'G', order: 3, reps: 15 },
    ],
    equipment: ['barra de dominadas', 'peso corporal'],
    scoreType: 'volume',
    scale: {
      rx: 'Estándar RX: rondas + reps en 30 min',
      scaled: 'Pull-ups con banda',
      beginner: 'Ring Rows en vez de pull-ups',
    },
  },
  {
    id: 'amanda',
    name: 'Amanda',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 9-7-5 de snatch y ring muscle-ups; técnica de recepción ya con fatiga.',
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Squat Snatch', modality: 'W', order: 1, notes: '9-7-5 reps', loadKg: 61, loadText: '61/43 kg' },
      { name: 'Ring Muscle-Up', modality: 'G', order: 2, notes: '9-7-5 reps' },
    ],
    equipment: ['barra', 'anillas'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (61/43 kg) con ring muscle-ups',
      scaled: 'Snatch 43/30 kg con chest-to-bar',
      beginner: 'Power snatch 30/20 kg con Ring Rows',
    },
  },
  {
    id: 'cindy',
    name: 'Cindy',
    category: 'girl',
    history:
      'Girl del main site de CrossFit: 20 minutos del circuito de pull-ups, flexiones y sentadillas; se puntúan rondas y reps.',
    format: 'AMRAP',
    durationSec: 1200,
    movements: [
      { name: 'Pull-Up', modality: 'G', order: 1, reps: 5, notes: 'por ronda, AMRAP de 20 min' },
      { name: 'Push-Up', modality: 'G', order: 2, reps: 10 },
      { name: 'Air Squat', modality: 'G', order: 3, reps: 15 },
    ],
    equipment: ['barra de dominadas', 'peso corporal'],
    scoreType: 'volume',
    scale: {
      rx: 'Estándar RX: rondas + reps en 20 min',
      scaled: 'Pull-ups con banda',
      beginner: 'Ring Rows en vez de pull-ups',
    },
  },

  // ── Heroes ───────────────────────────────────────────────────────────────
  {
    id: 'murph',
    name: 'Murph',
    category: 'hero',
    history:
      'Honra al teniente Michael P. Murphy, Navy SEAL caído en Afganistán el 28 de junio de 2005; se corre cada Memorial Day en todo el mundo.',
    format: 'FOR_TIME',
    movements: [
      { name: 'Running', modality: 'M', order: 1, distanceM: 1609, notes: '1 milla' },
      { name: 'Pull-Up', modality: 'G', order: 2, reps: 100, notes: 'particionable' },
      { name: 'Push-Up', modality: 'G', order: 3, reps: 200, notes: 'particionable' },
      { name: 'Air Squat', modality: 'G', order: 4, reps: 300, notes: 'particionable' },
      { name: 'Running', modality: 'M', order: 5, distanceM: 1609, notes: '1 milla' },
    ],
    equipment: ['peso corporal', 'barra de dominadas', 'chaleco 9/6 kg (opcional)'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX: chaleco 9/6 kg, 100/200/300 reps, piezas libres',
      scaled: 'Volumen a la mitad (50/100/150) sin chaleco',
      beginner: '800 m + 10 rondas de 5 ring rows, 10 push-ups y 15 air squats + 800 m',
    },
  },
  {
    id: 'dt',
    name: 'DT',
    category: 'hero',
    history:
      'Honra al sargento de la Fuerza Aérea de EE. UU. Timothy P. Davis, caído el 20 de febrero de 2009 en Afganistán.',
    format: 'FOR_TIME',
    rounds: 5,
    movements: [
      { name: 'Deadlift', modality: 'W', order: 1, reps: 12, loadKg: 70, loadText: '70/50 kg', notes: 'por ronda' },
      { name: 'Hang Power Clean', modality: 'W', order: 2, reps: 9, loadKg: 52.5, loadText: '52.5/35 kg' },
      { name: 'Push Jerk', modality: 'W', order: 3, reps: 6, loadKg: 70, loadText: '70/50 kg' },
    ],
    equipment: ['barra'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (155/105 lb ≈ 70/50 kg; hang power cleans 115/75 lb ≈ 52.5/35 kg)',
      scaled: 'Cargas 52.5/35 kg y 43/30 kg',
      beginner: 'Técnica ligera: 43/30 kg en los tres movimientos',
    },
  },
  {
    id: 'jt',
    name: 'JT',
    category: 'hero',
    history:
      'Honra al petty officer de 1.ª clase Jeff Taylor, de la Armada de EE. UU., caído el 28 de junio de 2005 en Afganistán (Operación Red Wings).',
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Handstand Push-Up', modality: 'G', order: 1, notes: '21-15-9 reps' },
      { name: 'Ring Dip', modality: 'G', order: 2, notes: '21-15-9 reps' },
      { name: 'Push-Up', modality: 'G', order: 3, notes: '21-15-9 reps' },
    ],
    equipment: ['pared', 'anillas', 'peso corporal'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX: HSPU, ring dips y push-ups estrictos',
      scaled: 'Pike push-ups, ring dips con banda y push-ups',
      beginner: 'Push-ups inclinadas y dips en paralelas',
    },
  },
  {
    id: 'randy',
    name: 'Randy',
    category: 'hero',
    history:
      'Honra a Randy Simmons, veterano de 27 años del Departamento de Policía de Los Ángeles y miembro de SWAT, caído el 7 de febrero de 2008 en cumplimiento del deber.',
    format: 'FOR_TIME',
    movements: [
      { name: 'Power Snatch', modality: 'W', order: 1, reps: 75, loadKg: 34, loadText: '34/25 kg' },
    ],
    equipment: ['barra'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (75/55 lb ≈ 34/25 kg)',
      scaled: '24/16 kg',
      beginner: 'Técnica con 20/15 kg',
    },
  },
  {
    id: 'michael',
    name: 'Michael',
    category: 'hero',
    history: 'Honra al teniente de la Armada Michael McGreevy, caído en Afganistán el 28 de junio de 2005.',
    format: 'FOR_TIME',
    rounds: 3,
    movements: [
      { name: 'Running', modality: 'M', order: 1, distanceM: 800 },
      { name: 'Back Extension', modality: 'G', order: 2, reps: 50 },
      { name: 'Sit-Ups', modality: 'G', order: 3, reps: 50 },
    ],
    equipment: ['pista', 'GHD (o piso)'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX: 3 rondas de 800 m, 50 back extensions y 50 sit-ups',
      scaled: 'Back extensions en piso y 2 rondas',
      beginner: '2 rondas con 400 m y 30 reps',
    },
  },
  {
    id: 'nancy',
    name: 'Nancy',
    category: 'girl',
    history:
      'Girl oficial del main site de CrossFit (5 de diciembre de 2004): 5 rondas de carrera de 400 m y sentadillas sobre la cabeza; se cronometra el total.',
    format: 'FOR_TIME',
    rounds: 5,
    movements: [
      { name: 'Running', modality: 'M', order: 1, distanceM: 400 },
      { name: 'Overhead Squat', modality: 'W', order: 2, reps: 15, loadKg: 43, loadText: '43/30 kg' },
    ],
    equipment: ['barra', 'pista'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (43/30 kg)',
      scaled: '30/20 kg',
      beginner: '200 m y 10 reps con 20/15 kg',
    },
  },
  {
    id: 'wood',
    name: 'Wood',
    category: 'hero',
    history:
      'Honra al sargento del Ejército australiano Brett Wood MG, caído el 23 de mayo de 2011 en Helmand, Afganistán.',
    format: 'FOR_TIME',
    rounds: 5,
    movements: [
      { name: 'Running', modality: 'M', order: 1, distanceM: 400, notes: '5 rondas con 1 min de descanso' },
      { name: 'Burpee Box Jump', modality: 'M', order: 2, reps: 10 },
      { name: 'Sumo Deadlift High Pull', modality: 'W', order: 3, reps: 10, loadKg: 43, loadText: '43/30 kg' },
      { name: 'Thruster', modality: 'W', order: 4, reps: 10, loadKg: 43, loadText: '43/30 kg' },
    ],
    equipment: ['barra', 'caja', 'pista'],
    scoreType: 'time',
    scale: {
      rx: 'Estándar RX (barra 43/30 kg, caja 60/50 cm)',
      scaled: 'Barra 30/20 kg y caja más baja',
      beginner: 'SDHP y thrusters sin carga, step-ups en vez de salto',
    },
  },
  {
    id: 'the-chief',
    name: 'The Chief',
    category: 'hero',
    history:
      "Benchmark 'Notable' de CrossFit: rinde homenaje a los Chief Petty Officers de la Armada de EE. UU., referentes de ejemplo personal y liderazgo técnico.",
    format: 'INTERVAL',
    rounds: 5,
    movements: [
      { name: 'Power Clean', modality: 'W', order: 1, reps: 3, loadKg: 61, loadText: '61/43 kg', notes: 'AMRAP de 3 min por ciclo, 1 min de descanso' },
      { name: 'Push-Up', modality: 'G', order: 2, reps: 6 },
      { name: 'Air Squat', modality: 'G', order: 3, reps: 9 },
    ],
    equipment: ['barra', 'peso corporal'],
    scoreType: 'volume',
    scale: {
      rx: 'Estándar RX: 5 ciclos de 3 min de AMRAP con 1 min de descanso',
      scaled: 'Power cleans 43/30 kg',
      beginner: 'Carga ligera y push-ups inclinadas',
    },
  },
]

/** Benchmark por id, o undefined si no existe. */
export function getBenchmark(id: string): CfBenchmark | undefined {
  return CF_BENCHMARKS.find((b) => b.id === id)
}

interface ScoreValue {
  timeSec?: number
  rounds?: number
  reps?: number
}

/**
 * ¿Es `next` un resultado mejor que `prev` para este scoreType? Empates = false.
 * - 'time': gana el menor `timeSec`; sin `timeSec` en `next` no mejora, y un
 *   resultado con tiempo le gana a uno sin tiempo. `prev` null → true (primer valor).
 * - 'volume': gana el mayor `rounds`; a igualdad, la mayor `reps`.
 */
export function isBetterResult(
  scoreType: CfBenchmark['scoreType'],
  prev: ScoreValue | null,
  next: ScoreValue,
): boolean {
  if (prev === null) { return true }
  if (scoreType === 'time') {
    if (typeof next.timeSec !== 'number') { return false }
    if (typeof prev.timeSec !== 'number') { return true }
    return next.timeSec < prev.timeSec
  }
  const nextRounds = next.rounds ?? 0
  const prevRounds = prev.rounds ?? 0
  if (nextRounds !== prevRounds) { return nextRounds > prevRounds }
  return (next.reps ?? 0) > (prev.reps ?? 0)
}

/**
 * Texto de tiempo a segundos. Acepta segundos planos ("90" → 90, hasta 5
 * dígitos), m:ss ("7:42" → 462) y h:mm:ss ("1:05:00" → 3900). Devuelve null
 * para vacío, basura o valores fuera de rango (segundos/minutos > 59).
 */
export function parseClockToSec(raw: string): number | null {
  const text = raw.trim()
  if (!text || !/^\d{1,5}(:\d{1,2}){0,2}$/.test(text)) { return null }
  const parts = text.split(':').map(Number)
  if (parts.length === 1) { return parts[0] }
  const seconds = parts[parts.length - 1]
  if (seconds > 59) { return null }
  if (parts.length === 2) { return parts[0] * 60 + seconds }
  const minutes = parts[1]
  if (minutes > 59) { return null }
  return parts[0] * 3600 + minutes * 60 + seconds
}
