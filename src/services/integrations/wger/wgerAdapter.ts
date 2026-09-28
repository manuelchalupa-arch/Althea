// wgerAdapter — Adaptador de alto nivel para importar muestras de Wger a Dexie.
// FASE 3: importar 20-50 ejercicios. No reemplaza la biblioteca existente.
//
// ENDPOINTS utilizados:
//   GET /api/v2/exercise/            lista de IDs
//   GET /api/v2/exerciseinfo/{id}/   detalle completo por ejercicio
//   GET /api/v2/muscle/              músculos (taxonomía)
//   GET /api/v2/equipment/           equipamiento (taxonomía)
//   GET /api/v2/category/            categorías (taxonomía)
//   GET /api/v2/ingredient/          ingredientes (nutrición)
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
    .where('origin')
    .equals('WGER')
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
    .where('origin')
    .equals('WGER')
    .toArray()
  return all as unknown as WgerExerciseRecord[]
}

/**
 * Obtiene taxonomía Wger (músculos, equipamiento, categorías).
 * Cacheada en localStorage para uso offline.
 */
export async function fetchWgerTaxonomy(): Promise<{
  muscles: { id: number; name: string }[]
  equipment: { id: number; name: string }[]
  categories: { id: number; name: string }[]
}> {
  const cacheKey = 'wger:taxonomy:v1'
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {return JSON.parse(cached)}
  } catch { /* noop */ }

  const { fetchMuscles, fetchEquipment, fetchCategories } = await import('./wgerClient')
  const [muscles, equipment, categories] = await Promise.all([
    fetchMuscles(),
    fetchEquipment(),
    fetchCategories(),
  ])

  const taxonomy = {
    muscles: muscles.results.map((m) => ({ id: m.id, name: m.name })),
    equipment: equipment.results.map((e) => ({ id: e.id, name: e.name })),
    categories: categories.results.map((c) => ({ id: c.id, name: c.name })),
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify(taxonomy))
  } catch { /* noop */ }

  return taxonomy
}

/**
 * Convierte un WgerExerciseRecord a Exercise (compatible Biblioteca).
 */
export function toExercise(record: WgerExerciseRecord): Exercise {
  const { origin, wgerProvenance, ...exercise } = record
  return exercise as Exercise
}
