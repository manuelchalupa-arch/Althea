import { v4 as uuid } from 'uuid'
import type { CfWod } from '../types'
import type { CfGroupWodSnapshot } from './programmingTypes'

/** Copia completa e independiente de un WOD para usar como snapshot publicado. */
export function createGroupWodSnapshot(wod: CfWod): CfGroupWodSnapshot {
  const serialized = JSON.stringify(wod)
  if (!serialized) {
    throw new Error('No se pudo generar el snapshot del WOD.')
  }
  return {
    snapshotId: uuid(),
    snapshotAt: new Date().toISOString(),
    wod: JSON.parse(serialized) as CfWod,
  }
}
