// wgerAdapter — Adaptador de alto nivel para importar muestras de Wger a Dexie.
// FASE 3: importar 20-50 ejercicios. No reemplaza la biblioteca existente.
//
// ENDPOINTS utilizados:
//   GET /api/v2/exercise/            lista de IDs
//   GET /api/v2/exerciseinfo/{id}/   detalle completo (incluye taxonomía e i18n)
//
// Persistencia: usa la tabla existente `customExercises` con origin='WGER'
// para no crear tablas nuevas hasta determinar si son necesarias.

import { db } from '@/services/storage/db'
import type { CustomExercise } from '@/services/training/customExercises'
import type { Exercise } from '@/services/exerciseGym'
import {
  fetchExerciseList,
  fetchExerciseInfo,
} from './wgerClient'
import { wgerToAltheaExercise, buildProvenance, type WgerProvenance } from './wgerMapper'

// Extiende Exercise con campos CustomExercise + procedencia Wger.
// Usa origin ampliado ('USER_CREATED' | 'WGER') para evitar conflicto de intersección.
export type WgerExerciseRecord = Omit<CustomExercise, 'origin'> & {
  origin: 'WGER'
  wgerProvenance: WgerProvenance
}

const SAMPLE_SIZE = 30

/**
 * Importa una muestra de ejercicios Wger a Dexie.
 * No duplica ejercicios ya importados (verifica por wgerProvenance.sourceId).
 * No sobrescribe datos del usuario.
 */
export async function importWgerSample(
  sampleSize: number = SAMPLE_SIZE,
  onProgress?: (imported: number, total: number) => void,
): Promise<WgerExerciseRecord[]> {
  // 1. Obtener lista de IDs de ejercicios
  const list = await fetchExerciseList({ limit: sampleSize, language: 2 })
  const ids = list.results.map((r) => r.id)

  // 2. Verificar cuáles ya fueron importados (no duplicar)
  const existing = await db.customExercises
    .filter((e) => (e as { origin?: string }).origin === 'WGER')
    .toArray()
  const existingSourceIds = new Set(
    existing
      .map((e) => (e as unknown as WgerExerciseRecord).wgerProvenance?.sourceId)
      .filter((id): id is number => typeof id === 'number'),
  )

  const newIds = ids.filter((id) => !existingSourceIds.has(id))

  // 3. Obtener detalle de cada ejercicio nuevo
  const imported: WgerExerciseRecord[] = []
  let count = 0

  for (const id of newIds) {
    try {
      const info = await fetchExerciseInfo(id)
      const exercise = wgerToAltheaExercise(info)
      const provenance = buildProvenance(info)

      const record: WgerExerciseRecord = {
        ...exercise,
        origin: 'WGER',
        description: exercise.instructions[0] || '',
        archived: false,
        createdAt: provenance.importedAt,
        updatedAt: provenance.importedAt,
        wgerProvenance: provenance,
      } as WgerExerciseRecord

      await db.customExercises.put(record as unknown as CustomExercise)
      imported.push(record)
      count++
      onProgress?.(count, newIds.length)
    } catch (err) {
      console.warn(`Wger import failed for exercise ${id}:`, err)
    }
  }

  return imported
}

/**
 * Obtiene todos los ejercicios Wger importados desde Dexie.
 */
export async function listWgerExercises(): Promise<WgerExerciseRecord[]> {
  const all = await db.customExercises
    .filter((e) => (e as { origin?: string }).origin === 'WGER')
    .toArray()
  return all as unknown as WgerExerciseRecord[]
}

/**
 * Convierte un WgerExerciseRecord a Exercise (compatible Biblioteca).
 */
export function toExercise(record: WgerExerciseRecord): Exercise {
  const { origin, wgerProvenance, ...exercise } = record
  return exercise as Exercise
}
