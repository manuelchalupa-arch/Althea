import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { resolveOnboardingGate } from './onboardingGate'

describe('onboardingGate — no reinicializa perfiles existentes', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  it('sin perfil: pide onboarding (dispositivo nuevo sin datos)', async () => {
    expect(await resolveOnboardingGate('nico@mail.com')).toBe(true)
  })

  it('perfil con onboarding incompleto: pide onboarding', async () => {
    await db.userProfile.put({ id: 'me', onboardingDone: false } as never)
    expect(await resolveOnboardingGate('nico@mail.com')).toBe(true)
  })

  it('perfil completado con email: no toca nada', async () => {
    await db.userProfile.put({ id: 'me', onboardingDone: true, email: 'nico@mail.com' } as never)
    expect(await resolveOnboardingGate('otro@mail.com')).toBe(false)
    const p = await db.userProfile.get('me')
    expect(p?.email).toBe('nico@mail.com')
  })

  it('perfil completado sin email + sesión: no fuerza onboarding y sella el email de la cuenta', async () => {
    await db.userProfile.put({ id: 'me', onboardingDone: true, goal: 'fuerza' } as never)
    expect(await resolveOnboardingGate('nico@mail.com')).toBe(false)
    const p = await db.userProfile.get('me')
    expect(p?.email).toBe('nico@mail.com')
    // Aditivo: el resto del perfil queda intacto.
    expect((p as any)?.goal).toBe('fuerza')
    expect(p?.onboardingDone).toBe(true)
  })

  it('sin sesión: respeta el perfil completado aunque le falte email', async () => {
    await db.userProfile.put({ id: 'me', onboardingDone: true } as never)
    expect(await resolveOnboardingGate(null)).toBe(false)
    expect(await resolveOnboardingGate(undefined)).toBe(false)
  })

  it('idempotente: al sellar no modifica updatedAt ni reescribe en llamadas posteriores', async () => {
    const stamp = '2026-01-01T00:00:00.000Z'
    await db.userProfile.put({ id: 'me', onboardingDone: true, updatedAt: stamp } as never)
    await resolveOnboardingGate('nico@mail.com')
    expect((await db.userProfile.get('me'))?.updatedAt).toBe(stamp)
    // Segunda pasada (p.ej. re-login): sin cambios.
    await resolveOnboardingGate('nico@mail.com')
    const p = await db.userProfile.get('me')
    expect(p?.email).toBe('nico@mail.com')
    expect(p?.updatedAt).toBe(stamp)
  })
})
