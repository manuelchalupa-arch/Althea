import type { RoutineData, RoutineDayExercise } from '@/services/storage/routineStore'
import type { Exercise } from '@/services/exerciseGym'
import type {
  WgerRoutineDetail,
  WgerRoutineListItem,
  WgerDay,
  WgerSlot,
  WgerSlotEntry,
  WgerWeightConfig,
  WgerRepetitionsConfig,
  WgerSetsConfig,
  WgerRirConfig,
  WgerRestConfig,
} from './wgerTypes'
import { todayKey } from '@/utils/dates'

export interface WgerRoutineWithDetails {
  routine: WgerRoutineDetail
  days: WgerDay[]
  slots: WgerSlot[]
  slotEntries: WgerSlotEntry[]
  weightConfigs: Map<number, WgerWeightConfig>
  repetitionsConfigs: Map<number, WgerRepetitionsConfig>
  setsConfigs: Map<number, WgerSetsConfig>
  rirConfigs: Map<number, WgerRirConfig>
  restConfigs: Map<number, WgerRestConfig>
}

export interface WgerRoutineProvenance {
  altheaId: string
  source: 'wger'
  sourceId: number
  sourceUuid: string
  importedAt: string
}

export function mapWgerRoutineToAlthea(
  data: WgerRoutineWithDetails,
  exerciseResolver: (wgerExerciseId: number) => Exercise | null,
): { routine: RoutineData; provenance: WgerRoutineProvenance } {
  const { routine, days, slots, slotEntries, rirConfigs } = data

  const dayExercises: Record<number, RoutineDayExercise[]> = {}

  for (const day of days) {
    const daySlots = slots.filter((s) => s.day === day.id)
    const exercises: RoutineDayExercise[] = []

    for (const slot of daySlots) {
      const entries = slotEntries.filter((e) => e.slot === slot.id)

      for (const entry of entries) {
        const exercise = exerciseResolver(entry.exercise)
        if (!exercise) {continue}

        exercises.push({
          id: `wger-${entry.id}`,
          exId: exercise.id,
          sets: entry.sets ?? 3,
          reps: entry.reps ?? 10,
          weight: entry.weight ?? null,
          restSec: entry.rest ?? 60,
          rir: entry.rippetenz ?? undefined,
          name: exercise.name,
          muscle: exercise.muscle,
          gifUrl: exercise.gifUrl,
        })
      }
    }

    dayExercises[day.day] = exercises
  }

  const altheaRoutine: RoutineData = {
    id: `wger-routine-${routine.id}`,
    name: routine.name,
    description: routine.description ?? undefined,
    createdAt: routine.created,
    updatedAt: routine.last_update,
    rotationDays: 30,
    cycle: {
      startDate: todayKey(),
      trainingDays: days.map((d) => ({ n: d.day, name: d.name })),
      weekMap: [],
    },
    dayExercises,
    version: 1,
  }

  const provenance: WgerRoutineProvenance = {
    altheaId: altheaRoutine.id,
    source: 'wger',
    sourceId: routine.id,
    sourceUuid: routine.uuid,
    importedAt: new Date().toISOString(),
  }

  return { routine: altheaRoutine, provenance }
}

export function mapAltheaRoutineToWger(
  routine: RoutineData,
  exerciseResolver: (altheaExerciseId: string) => { wgerId: number } | null,
): { routine: Partial<WgerRoutineListItem>; days: Partial<WgerDay>[]; slots: Partial<WgerSlot>[]; entries: Partial<WgerSlotEntry>[] } {
  const days: Partial<WgerDay>[] = []
  const slots: Partial<WgerSlot>[] = []
  const entries: Partial<WgerSlotEntry>[] = []

  for (const [dayStr, exercises] of Object.entries(routine.dayExercises)) {
    const dayNum = Number(dayStr)
    const dayId = dayNum

    days.push({
      id: dayId,
      routine: 0,
      day: dayNum,
      name: `Day ${dayNum}`,
      description: '',
    })

    const slotId = dayId * 1000
    slots.push({
      id: slotId,
      day: dayId,
      order: 1,
      comment: 'Main',
      entries: [],
    })

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i]
      const wgerRef = exerciseResolver(ex.exId)

      entries.push({
        id: slotId * 100 + i,
        slot: slotId,
        exercise: wgerRef?.wgerId ?? 0,
        order: i + 1,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        rest: ex.restSec,
      })
    }
  }

  return {
    routine: {
      name: routine.name,
      description: routine.description || '',
    },
    days,
    slots,
    entries,
  }
}

export function mapWgerDayToAlthea(
  day: WgerDay,
  slots: WgerSlot[],
  slotEntries: WgerSlotEntry[],
  exerciseResolver: (wgerExerciseId: number) => Exercise | null,
): RoutineDayExercise[] {
  const daySlots = slots.filter((s) => s.day === day.id)
  const exercises: RoutineDayExercise[] = []

  for (const slot of daySlots) {
    const entries = slotEntries.filter((e) => e.slot === slot.id)
    for (const entry of entries) {
      const exercise = exerciseResolver(entry.exercise)
      if (!exercise) {continue}
      exercises.push({
        id: `wger-${entry.id}`,
        exId: exercise.id,
        sets: 3,
        reps: 10,
        weight: null,
        restSec: 60,
        name: exercise.name,
        muscle: exercise.muscle,
        gifUrl: exercise.gifUrl,
      })
    }
  }

  return exercises
}

export function mapAltheaDayToWger(
  dayExercises: RoutineDayExercise[],
  dayNum: number,
  exerciseResolver: (altheaExerciseId: string) => { wgerId: number } | null,
): { day: Partial<WgerDay>; slot: Partial<WgerSlot>; entries: Partial<WgerSlotEntry>[] } {
  const dayId = dayNum
  const slotId = dayNum * 1000

  const entries: Partial<WgerSlotEntry>[] = dayExercises.map((ex, i) => {
    const wgerRef = exerciseResolver(ex.exId)
    return {
      id: slotId * 100 + i,
      slot: slotId,
      exercise: wgerRef?.wgerId ?? 0,
      order: i + 1,
      sets: ex.sets,
      reps: ex.reps,
      weight: ex.weight,
      rest: ex.restSec,
    }
  })

  return {
    day: { id: dayId, day: dayNum, name: `Day ${dayNum}`, description: '' },
    slot: { id: slotId, day: dayId, order: 1, comment: 'Main', entries: entries.map((e) => e.id!).filter(Boolean) as unknown as WgerSlotEntry[] },
    entries,
  }
}

export function mapWgerSlotToAlthea(
  slot: WgerSlot,
  entries: WgerSlotEntry[],
  exerciseResolver: (wgerExerciseId: number) => Exercise | null,
): RoutineDayExercise[] {
  const slotEntries = entries.filter((e) => e.slot === slot.id)
  return slotEntries.map((entry) => {
    const exercise = exerciseResolver(entry.exercise)
    return {
      id: `wger-${entry.id}`,
      exId: exercise?.id ?? `wger-unknown-${entry.exercise}`,
      sets: 3,
      reps: 10,
      weight: null,
      restSec: 60,
      name: exercise?.name ?? `Exercise ${entry.exercise}`,
      muscle: exercise?.muscle ?? '',
      gifUrl: exercise?.gifUrl ?? '',
    }
  })
}

export function mapAltheaExerciseToWger(
  exercise: RoutineDayExercise,
  order: number,
  exerciseResolver: (altheaExerciseId: string) => { wgerId: number } | null,
): Partial<WgerSlotEntry> {
  const wgerRef = exerciseResolver(exercise.exId)
  return {
    exercise: wgerRef?.wgerId ?? 0,
    order,
    sets: exercise.sets,
    reps: exercise.reps,
    weight: exercise.weight,
    rest: exercise.restSec,
  }
}

export function mapWgerProgressionToAlthea(
  weightConfig: WgerWeightConfig | null,
  repsConfig: WgerRepetitionsConfig | null,
  setsConfig: WgerSetsConfig | null,
  rirConfig: WgerRirConfig | null,
  restConfig: WgerRestConfig | null,
): Partial<RoutineDayExercise> {
  return {
    weight: weightConfig?.value ?? null,
    reps: repsConfig?.value ?? 10,
    sets: setsConfig?.value ?? 3,
    rir: rirConfig?.value,
    restSec: restConfig?.value ?? 60,
  }
}
