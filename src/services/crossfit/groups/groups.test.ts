import { beforeEach, describe, expect, it } from 'vitest'
import { canRemoveMember, groupRoleFor, memberLabel, validateGroupEdit } from './groupAccess'
import { generateInviteToken, inviteExpiry, inviteIsUsable, inviteLink, isValidInviteToken } from './invite'
import { clearInviteReturn, consumeInviteReturn, isInvitePath, rememberInviteReturn } from './inviteReturn'
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

describe('grupos CrossFit — edición del grupo', () => {
  it('acepta nombre y campos opcionales dentro de los límites', () => {
    expect(validateGroupEdit({ name: '  Turno mañana  ', description: 'x'.repeat(300), schedule: 'x'.repeat(80) })).toBeNull()
  })

  it('rechaza nombre vacío y campos demasiado largos', () => {
    expect(validateGroupEdit({ name: '   ' })).toBe('El nombre del grupo es obligatorio.')
    expect(validateGroupEdit({ name: 'x'.repeat(61) })).toContain('60 caracteres')
    expect(validateGroupEdit({ name: 'ok', description: 'x'.repeat(301) })).toContain('300 caracteres')
    expect(validateGroupEdit({ name: 'ok', schedule: 'x'.repeat(81) })).toContain('80 caracteres')
  })
})

describe('grupos CrossFit — retorno desde onboarding', () => {
  const token = 'a'.repeat(64)
  const path = `/crossfit/invitacion/${token}`

  beforeEach(() => { clearInviteReturn() })

  it('solo recuerda rutas de invitación con token válido', () => {
    expect(isInvitePath(path)).toBe(true)
    expect(isInvitePath('/crossfit/invitacion/corto')).toBe(false)
    expect(isInvitePath('https://otro.dominio/crossfit/invitacion/' + token)).toBe(false)
    expect(isInvitePath(null)).toBe(false)
    rememberInviteReturn('/crossfit/invitacion/corto')
    expect(consumeInviteReturn()).toBeNull()
  })

  it('conserva la invitación durante login/registro y la devuelve una sola vez', () => {
    rememberInviteReturn(path)
    // El mismo token se recuerda otra vez al cambiar de ruta a /login.
    rememberInviteReturn(path)
    expect(consumeInviteReturn()).toBe(path)
    expect(consumeInviteReturn()).toBeNull()
  })
})
