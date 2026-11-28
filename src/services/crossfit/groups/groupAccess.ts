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

/** Mismos límites que Firestore Rules: el grupo siempre tiene nombre. */
export function validateGroupEdit(input: { name: string; description?: string; schedule?: string }): string | null {
  const name = (input.name ?? '').trim()
  if (!name) { return 'El nombre del grupo es obligatorio.' }
  if (name.length > 60) { return 'El nombre no puede superar los 60 caracteres.' }
  if ((input.description ?? '').trim().length > 300) { return 'La descripción no puede superar los 300 caracteres.' }
  if ((input.schedule ?? '').trim().length > 80) { return 'El horario no puede superar los 80 caracteres.' }
  return null
}
