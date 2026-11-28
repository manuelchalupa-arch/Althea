/**
 * Conserva el destino de una invitación mientras la persona pasa por
 * login/registro y onboarding. Solo guarda una ruta de invitación válida:
 * nunca datos personales ni rutas arbitrarias (evita redirects abiertos).
 */
const KEY = 'althea:groups-invite-return'
const INVITE_PATH = /^\/crossfit\/invitacion\/[0-9a-f]{64}$/

export function isInvitePath(path: string | null | undefined): path is string {
  return typeof path === 'string' && INVITE_PATH.test(path)
}

export function rememberInviteReturn(path: string | null | undefined): void {
  if (!isInvitePath(path)) { return }
  try { sessionStorage.setItem(KEY, path) } catch { /* sin sessionStorage: no recordar */ }
}

export function consumeInviteReturn(): string | null {
  try {
    const stored = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return isInvitePath(stored) ? stored : null
  } catch {
    return null
  }
}

export function clearInviteReturn(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* noop */ }
}
