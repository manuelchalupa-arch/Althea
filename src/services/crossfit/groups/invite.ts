import type { CfGroupInvite } from './types'

/** 256 bits de entropía: el token ES la autorización, nunca el id del grupo. */
export const INVITE_TOKEN_BYTES = 32
export const INVITE_TTL_DAYS = 30
const HEX_TOKEN = /^[0-9a-f]{64}$/

/**
 * Token hexadecimal de 64 caracteres generado con crypto.getRandomValues.
 * Firestore lo usa como id del documento cfInvites/{token}.
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function isValidInviteToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && HEX_TOKEN.test(token)
}

/** Un enlace válido no contiene datos personales: solo el token aleatorio. */
export function inviteLink(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/crossfit/invitacion/${token}`
}

export function inviteExpiry(now: Date, days = INVITE_TTL_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Una invitación sirve solo si existe, no fue revocada y no expiró.
 * Las reglas de Firestore aplican exactamente estas tres condiciones.
 */
export function inviteIsUsable(
  invite: Pick<CfGroupInvite, 'revoked' | 'expiresAt'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!invite || invite.revoked) { return false }
  const expires = Date.parse(invite.expiresAt)
  return Number.isFinite(expires) && expires > now.getTime()
}
