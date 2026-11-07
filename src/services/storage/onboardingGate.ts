import { db } from './db'

/**
 * ¿Hay que enviar al usuario a /onboarding?
 *
 * Gate único (App.tsx) que se ejecuta DESPUÉS de resolverse la sesión y el
 * restore de la cuenta, para no mandar a reconfigurar en un dispositivo nuevo
 * mientras los datos de Firestore aún no bajaron.
 *
 * Reglas:
 * - Sin perfil o onboarding incompleto → sí (flujo normal).
 * - Perfil completado → no, salvo que falte el email.
 * - Perfil completado sin email: se sella con el de la sesión actual
 *   (aditivo e idempotente) en lugar de forzar de nuevo el onboarding —
 *   re-loguearse nunca debe interpretarse como crear un usuario nuevo.
 * - Sin sesión no hay email que sellar y no tiene sentido reconfigurar:
 *   se respeta el perfil existente.
 */
export async function resolveOnboardingGate(
  sessionEmail?: string | null,
): Promise<boolean> {
  const p = await db.userProfile.get('me').catch(() => null)
  if (!p?.onboardingDone) { return true }
  if (p.email) { return false }
  if (sessionEmail) {
    await db.userProfile
      .update('me', { email: sessionEmail })
      .catch(() => { /* si falla, el próximo inicio reintenta */ })
  }
  return false
}
