import { describe, expect, it } from 'vitest'
import { canRemoveMember, groupRoleFor, memberLabel } from './groupAccess'
import { generateInviteToken, inviteExpiry, inviteIsUsable, inviteLink, isValidInviteToken } from './invite'
import type { CfGroup } from './types'

const group: CfGroup = {
  id: 'g1',
  name: 'Turno mañana',
  description: '',
  schedule: '',
  ownerId: 'owner',
  ownerName: 'Entrenadora',
  memberIds: ['owner', 'atleta'],
  memberNames: { owner: 'Entrenadora', atleta: 'Ana' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('grupos CrossFit — tokens de invitación', () => {
  it('genera 256 bits impredecibles en formato hexadecimal', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateInviteToken()))
    expect(tokens.size).toBe(50)
    for (const token of tokens) {
      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(isValidInviteToken(token)).toBe(true)
    }
  })

  it('rechaza tokens con formato inválido o ids de grupo', () => {
    expect(isValidInviteToken('')).toBe(false)
    expect(isValidInviteToken('g1')).toBe(false)
    expect(isValidInviteToken('A'.repeat(64))).toBe(false)
    expect(isValidInviteToken(null)).toBe(false)
  })

  it('el enlace solo contiene el token, sin datos personales', () => {
    const token = generateInviteToken()
    const link = inviteLink(token, 'https://altheafit.pages.dev/')
    expect(link).toBe(`https://altheafit.pages.dev/crossfit/invitacion/${token}`)
    expect(link).not.toContain('@')
    expect(link).not.toContain('owner')
  })

  it('una invitación revocada o vencida deja de servir', () => {
    const now = new Date('2026-11-27T12:00:00.000Z')
    const future = inviteExpiry(now).toISOString()
    const past = new Date(now.getTime() - 1000).toISOString()
    expect(inviteIsUsable({ revoked: false, expiresAt: future }, now)).toBe(true)
    expect(inviteIsUsable({ revoked: true, expiresAt: future }, now)).toBe(false)
    expect(inviteIsUsable({ revoked: false, expiresAt: past }, now)).toBe(false)
    expect(inviteIsUsable(null, now)).toBe(false)
  })
})

describe('grupos CrossFit — roles y administración', () => {
  it('distingue propietario, integrante y ajeno', () => {
    expect(groupRoleFor(group, 'owner')).toBe('owner')
    expect(groupRoleFor(group, 'atleta')).toBe('member')
    expect(groupRoleFor(group, 'otro')).toBeNull()
    expect(groupRoleFor(group, null)).toBeNull()
  })

  it('el propietario no puede quitarse a sí mismo', () => {
    expect(canRemoveMember(group, 'owner', 'owner')).toBe(false)
    expect(canRemoveMember(group, 'owner', 'atleta')).toBe(true)
    expect(canRemoveMember(group, 'atleta', 'owner')).toBe(false)
    expect(canRemoveMember(group, 'atleta', 'atleta')).toBe(false)
  })

  it('usa el nombre visible o un uid corto como respaldo', () => {
    expect(memberLabel(group, 'atleta')).toBe('Ana')
    expect(memberLabel(group, 'desconocido')).toBe('descon…')
  })
})
