import { db } from '@/services/storage/db'
import type { RoutineData } from '@/services/storage/routineStore'
import { saveRoutineVersioned } from '@/services/storage/routineStore'
import type { Exercise } from '@/services/exerciseGym'
import {
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
import {
  mapWgerRoutineToAlthea,
  type WgerRoutineWithDetails,
  type WgerRoutineProvenance,
} from './wgerRoutineMapper'
import { buildExerciseIndex, type ExerciseIndex } from './wgerExerciseMatcher'
import type { WgerProvenance } from './wgerMapper'
import type { WgerRoutineDetail } from './wgerTypes'

export interface ImportedRoutine {
  routine: RoutineData
  provenance: WgerRoutineProvenance
  exerciseMatches: Map<number, string>
}

export interface RoutineImportOptions {
  onProgress?: (step: string, current: number, total: number) => void
}

export async function importWgerRoutines(
  options: RoutineImportOptions = {},
): Promise<ImportedRoutine[]> {
  const { onProgress } = options

  onProgress?.('Fetching routines list', 0, 1)
  const routinesList = await fetchRoutines({ limit: 50 })
  const routineIds = routinesList.results.map((r: { id: number }) => r.id)

  const imported: ImportedRoutine[] = []

  for (let i = 0; i < routineIds.length; i++) {
    const routineId = routineIds[i]
    onProgress?.(`Importing routine ${routineId}`, i, routineIds.length)

    try {
      const routineData = await fetchRoutineWithDetails(routineId)
      if (!routineData) {continue}

      const exerciseIndex = await buildExerciseIndexFromDb()
      const exerciseResolver = createExerciseResolver(exerciseIndex)

      const { routine, provenance } = mapWgerRoutineToAlthea(routineData, exerciseResolver)

      const existing = await db.routineStore.get(routine.id)
      if (existing && 'dayExercises' in existing) {
        continue
      }

      const { saved } = await saveRoutineVersioned(routine)

      imported.push({
        routine: saved,
        provenance,
        exerciseMatches: new Map(),
      })
    } catch (err) {
      console.warn(`Failed to import routine ${routineId}:`, err)
    }
  }

  onProgress?.('Complete', routineIds.length, routineIds.length)
  return imported
}

async function fetchRoutineWithDetails(routineId: number): Promise<WgerRoutineWithDetails | null> {
  try {
    const routine = await fetchRoutine(routineId) as WgerRoutineDetail
    const days = await fetchDays({ routine: routineId })
    const daysList = days.results

    const slotsList: Awaited<ReturnType<typeof fetchSlots>>['results'] = []
    const slotEntriesList: Awaited<ReturnType<typeof fetchSlotEntries>>['results'] = []

    for (const day of daysList) {
      const slots = await fetchSlots({ day: day.id })
      slotsList.push(...slots.results)

      for (const slot of slots.results) {
        const entries = await fetchSlotEntries({ slot: slot.id })
        slotEntriesList.push(...entries.results)
      }
    }

    const weightConfigs = new Map<number, Awaited<ReturnType<typeof fetchWeightConfig>>['results'][0]>()
    const repetitionsConfigs = new Map<number, Awaited<ReturnType<typeof fetchRepetitionsConfig>>['results'][0]>()
    const setsConfigs = new Map<number, Awaited<ReturnType<typeof fetchSetsConfig>>['results'][0]>()
    const rirConfigs = new Map<number, Awaited<ReturnType<typeof fetchRirConfig>>['results'][0]>()
    const restConfigs = new Map<number, Awaited<ReturnType<typeof fetchRestConfig>>['results'][0]>()

    return {
      routine,
      days: daysList,
      slots: slotsList,
      slotEntries: slotEntriesList,
      weightConfigs,
      repetitionsConfigs,
      setsConfigs,
      rirConfigs,
      restConfigs,
    }
  } catch (err) {
    console.warn(`Failed to fetch routine ${routineId} details:`, err)
    return null
  }
}

async function buildExerciseIndexFromDb(): Promise<ExerciseIndex> {
  const customExercises = await db.customExercises.toArray()
  const wgerExercises = customExercises.filter(
    (e) => (e as { origin?: string }).origin === 'WGER',
  ) as Exercise[]

  const provenanceList: WgerProvenance[] = wgerExercises.map((e) => {
    const prov = (e as unknown as { wgerProvenance: WgerProvenance }).wgerProvenance
    return prov || {
      altheaId: e.id,
      source: 'wger',
      sourceId: parseInt(e.id.replace('wger-', '')),
      sourceUuid: '',
      license: '',
      licenseUrl: '',
      licenseAuthor: '',
      importedAt: '',
    }
  })

  return buildExerciseIndex(wgerExercises, provenanceList)
}

function createExerciseResolver(index: ExerciseIndex): (wgerExerciseId: number) => Exercise | null {
  return (wgerExerciseId: number) => {
    return index.bySourceId.get(wgerExerciseId) || null
  }
}

export async function listWgerRoutines(): Promise<RoutineData[]> {
  const all = await db.routineStore.toArray()
  return all.filter(
    (r): r is RoutineData => 'dayExercises' in r && r.id.startsWith('wger-routine-'),
  ) as RoutineData[]
}
