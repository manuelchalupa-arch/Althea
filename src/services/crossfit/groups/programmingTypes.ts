/**
 * Programación semanal compartida de grupos de CrossFit (Etapa 2).
 *
 * Datos compartidos en Firestore, independientes de Dexie y del
 * sincronizador privado `users/{uid}`:
 *   cfGroups/{groupId}/weekDrafts/{weekStart}   -> borrador privado del dueño
 *   cfGroups/{groupId}/programWeeks/{weekStart} -> puntero a la versión vigente
 *     versions/{versionId}                      -> publicación inmutable
 *
 * `weekStart` es una fecha local `YYYY-MM-DD` correspondiente al lunes.
 * Cada grupo y semana tienen sus propios datos; no se mezclan programaciones.
 */

import type { CfBlockType, CfWod } from '../types'

export type CfGroupDayKind = 'rest' | 'recovery' | 'session'

export interface CfGroupWodSnapshot {
  snapshotId: string
  snapshotAt: string
  /** Copia completa e independiente del WOD. Nunca se resuelve contra Dexie. */
  wod: CfWod
}

export interface CfGroupProgramBlock {
  id: string
  type: CfBlockType
  title: string
  content: string
  order: number
  wodSnapshot?: CfGroupWodSnapshot
}

export interface CfGroupProgramSession {
  title: string
  objective: string
  estimatedDurationMin: number
  equipment: string[]
  instructions: string[]
  blocks: CfGroupProgramBlock[]
}

export interface CfGroupProgramDay {
  dayIndex: number
  date: string
  kind: CfGroupDayKind
  session?: CfGroupProgramSession
}

export interface CfGroupWeekDraft {
  groupId: string
  ownerId: string
  weekStart: string
  days: CfGroupProgramDay[]
  updatedAt: string
  updatedBy: string
}

export interface CfGroupWeekVersion {
  groupId: string
  weekStart: string
  versionId: string
  versionNumber: number
  publishedAt: string
  publishedBy: string
  days: CfGroupProgramDay[]
}

export interface CfGroupWeekPointer {
  weekStart: string
  currentVersionId: string
  currentVersionNumber: number
  publishedAt: string
  publishedBy: string
}
