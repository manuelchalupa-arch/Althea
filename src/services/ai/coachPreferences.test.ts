import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/services/storage/db'
import { resolveCoachTone, METHOD_COACHING_STYLES } from './coachPersonality'
import { setCoachMethodView } from './coachPreferences'
import { buildTrainingContext } from './contextBuilder'
import { DEFAULT_CYCLE } from '@/utils/cycle'

const PROFILE_BASE = {
  id: 'me', goal: 'hipertrofia', level: 'intermedio', availableDays: [1, 3, 5],
  trainingTime: '18:00', equipment: ['barra'], units: { weight: 'kg', liquid: 'ml' },
  lang: 'es', coachIntensity: 'profesional', onboardingDone: true, hydrationGoalMl: 2500,
  createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z',
} as never

async function putProfile(extra: Record<string, unknown>) {
  await db.userProfile.put({ ...(PROFILE_BASE as object), ...extra } as never)
}

describe('S6 · resolución canónica del tono del Coach', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('1 · la fuente canónica (coachTone) gana sobre método e intensity', () => {
    expect(resolveCoachTone({
      coachTone: 'PSYCHO', coachIntensity: 'motivacional', methodId: 'hypertrophy',
    })).toBe('PSYCHO')
  })

  it('2 · sin coachTone, deriva del método canónico', () => {
    expect(resolveCoachTone({ coachIntensity: 'profesional', methodId: 'strength_endurance' }))
      .toBe(METHOD_COACHING_STYLES.strength_endurance.tone)
  })

  it('3 · sin método, coachIntensity sigue funcionando como fallback legacy', () => {
    expect(resolveCoachTone({ coachIntensity: 'motivacional' })).toBe('PADELERO')
    expect(resolveCoachTone({ coachIntensity: 'duro' })).toBe('ARNOLD')
    expect(resolveCoachTone({ coachIntensity: 'extremo' })).toBe('PSYCHO')
  })

  it('4 · ausencia total de preferencias: ABUELITOS, sin lanzar', () => {
    expect(resolveCoachTone({})).toBe('ABUELITOS')
    expect(resolveCoachTone({ coachTone: null, coachIntensity: null, methodId: null })).toBe('ABUELITOS')
  })

  it('5 · método desconocido cae al intensity legacy en vez de romper', () => {
    expect(resolveCoachTone({ coachIntensity: 'motivacional', methodId: 'metodo-inexistente' })).toBe('PADELERO')
  })

  it('6 · el AIContext recibe el tono canónico (lectura desde la fuente)', async () => {
    await putProfile({ coachTone: 'ARNOLD', cycle: { ...DEFAULT_CYCLE, methodId: 'strength_endurance' } })
    const ctx = await buildTrainingContext()
    expect(ctx.personalidad).toBe('ARNOLD')
  })

  it('7 · el AIContext hereda el método cuando no hay tono explícito', async () => {
    await putProfile({ cycle: { ...DEFAULT_CYCLE, methodId: 'strength_endurance' } })
    const ctx = await buildTrainingContext()
    expect(ctx.personalidad).toBe(METHOD_COACHING_STYLES.strength_endurance.tone)
  })

  it('8 · sin preferencias el AIContext no inventa personalidad', async () => {
    await putProfile({ coachIntensity: undefined })
    const ctx = await buildTrainingContext()
    expect(ctx.personalidad).toBe('ABUELITOS')
  })

  it('9 · cambiar el método NO pisa la preferencia canónica (escritor duplicado eliminado)', async () => {
    await putProfile({ coachTone: 'PSYCHO' })

    await setCoachMethodView('power')

    const p = (await db.userProfile.get('me')) as unknown as Record<string, unknown>
    expect(p.coachMethodView).toBe('power')
    expect(p.coachTone).toBe('PSYCHO')

    // Y el tono efectivo sigue siendo el canónico, no el del método nuevo.
    expect(resolveCoachTone({
      coachTone: p.coachTone as string,
      methodId: p.coachMethodView as string,
    })).toBe('PSYCHO')
  })

  it('10 · cambiar el método sin tono previo deriva del método nuevo (sin crear copia)', async () => {
    await putProfile({})

    await setCoachMethodView('power')

    const p = (await db.userProfile.get('me')) as unknown as Record<string, unknown>
    expect(p.coachTone).toBeUndefined()
    expect(resolveCoachTone({ methodId: p.coachMethodView as string }))
      .toBe(METHOD_COACHING_STYLES.power.tone)
  })

  it('11 · una actualización no deja una segunda copia persistente divergente', async () => {
    await putProfile({ coachTone: 'ABUELITOS' })

    // Ningún otro consumidor escribe preferencias del Coach en localStorage.
    await setCoachMethodView('hypertrophy')
    await buildTrainingContext()

    const clavesPersistentes = Object.keys(localStorage).filter(k =>
      /coach/i.test(k) && !k.startsWith('althea:migration')
    )
    expect(clavesPersistentes).toEqual([])

    const p = (await db.userProfile.get('me')) as unknown as Record<string, unknown>
    expect(p.coachTone).toBe('ABUELITOS')
    expect(p.coachIntensity).toBe('profesional')
  })
})
