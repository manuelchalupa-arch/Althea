/**
 * Grupos privados de CrossFit (Etapa 1).
 *
 * Viven SOLO en Firestore, en colecciones top-level con reglas propias:
 *   cfGroups/{groupId}
 *   cfGroups/{groupId}/requests/{uid}
 *   cfInvites/{token}
 *
 * No tocan Dexie ni el sincronizador privado `users/{uid}`: son datos
 * compartidos, no un backup del dispositivo.
 */

export type CfGroupRole = 'owner' | 'member'

export interface CfGroup {
  id: string
  name: string
  description: string
  schedule: string
  ownerId: string
  ownerName: string
  /** El propietario SIEMPRE está incluido. Única fuente de pertenencia. */
  memberIds: string[]
  /** Nombres visibles de los integrantes, indexados por uid. */
  memberNames: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type CfJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface CfJoinRequest {
  uid: string
  groupId: string
  displayName: string
  email: string
  message: string
  status: CfJoinRequestStatus
  /** Token con el que se pidió el ingreso (auditoría; no se muestra). */
  inviteToken: string
  createdAt: string
  updatedAt: string
  reviewedBy?: string
  reviewedAt?: string
}

export interface CfGroupInvite {
  token: string
  groupId: string
  /** Snapshot del nombre: el invitado no puede leer el grupo antes de entrar. */
  groupName: string
  createdBy: string
  createdAt: string
  expiresAt: string
  revoked: boolean
  revokedAt?: string
}
