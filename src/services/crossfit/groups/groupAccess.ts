import type { CfGroup, CfGroupRole } from './types'

/** Rol efectivo de una cuenta en un grupo. El propietario manda sobre memberIds. */
export function groupRoleFor(group: Pick<CfGroup, 'ownerId' | 'memberIds'>, uid: string | null | undefined): CfGroupRole | null {
  if (!uid) { return null }
  if (group.ownerId === uid) { return 'owner' }
  return group.memberIds.includes(uid) ? 'member' : null
}

/**
 * El propietario no puede quitarse a sí mismo: el grupo quedaría sin
 * administración. La regla de Firestore también lo impide.
 */
export function canRemoveMember(group: Pick<CfGroup, 'ownerId' | 'memberIds'>, actorUid: string, memberUid: string): boolean {
  return group.ownerId === actorUid
    && memberUid !== group.ownerId
    && group.memberIds.includes(memberUid)
}

export function memberLabel(group: Pick<CfGroup, 'memberNames'>, uid: string): string {
  const name = group.memberNames[uid]?.trim()
  return name || `${uid.slice(0, 6)}…`
}
