import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * R4 (FASE FINAL) — unificación funcional de notifConfigs (histórico) y
 * unifiedNotifConfigs (unificado): un solo motor de disparo, regla explícita
 * de (tipo, hora) con prioridad del histórico, sin duplicados, sin migraciones
 * destructivas y con compatibilidad total de los datos existentes.
 */

const sendSpy = vi.hoisted(() => vi.fn(async (_type: string, _title: string, _body: string): Promise<boolean> => true))

vi.mock('./push', () => ({
  sendNotification: (...args: unknown[]) => sendSpy(...(args as [string, string, string])),
}))

import {
  loadReminders, normalizeLegacy, normalizeUnified, dueReminders, legacyFiredKindTime,
  LEGACY_OVERLAP, type NormalizedReminder,
} from './reminders'
import { loadConfigs, saveConfigs, defaultConfigs, checkAndFire, firedId, type NotifConfig } from './scheduler'
import { loadUnifiedConfigs, saveUnifiedConfig, type UnifiedNotifConfig } from './unifiedNotifications'
import { db } from '@/services/storage/db'

// Lunes 2026-09-14 10:30 hora local
const monday = new Date(2026, 8, 14, 10, 30)
const ALL_DAYS = [true, true, true, true, true, true, true]

const legacyAgua = (over: Partial<NotifConfig> = {}): NotifConfig => ({
  id: 'agua', kind: 'agua', title: 'Tomar agua', enabled: true,
  times: ['10:00'], days: ALL_DAYS, ...over,
})

const unifiedAgua = (over: Partial<UnifiedNotifConfig> = {}): UnifiedNotifConfig => ({
  id: 'agua-1', type: 'agua', title: 'Tomar agua', enabled: true, time: '10:00',
  times: ['10:00'], days: ALL_DAYS, recurrence: 'daily', requiredAction: false,
  updatedAt: '2026-09-01T00:00:00.000Z', ...over,
})

beforeEach(async () => {
  vi.clearAllMocks()
  sendSpy.mockResolvedValue(true)
  localStorage.clear()
  await db.delete()
  await db.open()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(monday)
})

afterEach(() => { vi.useRealTimers() })

describe('R4 — capa común de lectura (compatibilidad con datos existentes)', () => {
  it('lee ambas tablas sin cambiar identificadores ni valores', async () => {
    await saveConfigs([legacyAgua()])
    await saveUnifiedConfig(unifiedAgua({ title: 'Agua custom' }))

    const reminders = await loadReminders()

    const legacy = reminders.find((r) => r.id === 'agua')
    const unified = reminders.find((r) => r.id === 'agua-1')
    expect(legacy?.source).toBe('legacy')
    expect(unified?.source).toBe('unified')
    expect(unified?.title).toBe('Agua custom')
    // Ambos siguen presentes: nada se fusiona ni se borra.
    expect((await loadConfigs()).map((c) => c.id)).toContain('agua')
    expect((await loadUnifiedConfigs()).map((c) => c.id)).toContain('agua-1')
  })

  it('normaliza la tabla unificada respetando la regla de time de preparar_habitacion', () => {
    const [prep] = normalizeUnified([{
      id: 'preparar_habitacion-1', type: 'preparar_habitacion', title: 'Preparar', enabled: true,
      time: '22:00', times: ['08:00'], days: ALL_DAYS, recurrence: 'daily',
      requiredAction: false, updatedAt: 'x',
    }])
    expect(prep.times).toEqual(['22:00'])
  })

  it('normaliza el histórico conservando extra (proteína)', () => {
    const [prot] = normalizeLegacy([{ ...legacyAgua(), id: 'proteina', kind: 'proteina', extra: '120' }])
    expect(prot.extra).toBe('120')
    expect(prot.source).toBe('legacy')
  })

  it('los tipos de ambos sistemas son disjuntos en ids (sin colisiones)', async () => {
    const reminders = await loadReminders()
    const ids = reminders.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('R4 — regla explícita de conflicto (dueReminders, pura)', () => {
  const u = (over: Partial<NormalizedReminder> = {}): NormalizedReminder => ({
    source: 'unified', id: 'agua-1', kind: 'agua', title: 'T', enabled: true,
    times: ['10:00'], days: ALL_DAYS, ...over,
  })

  it('dispara si el histórico no notificó esa hora', () => {
    expect(dueReminders([u()], monday, new Set())).toHaveLength(1)
  })

  it('no duplica cuando el histórico YA notificó (tipo, hora)', () => {
    expect(dueReminders([u()], monday, new Set(['agua|10:00']))).toHaveLength(0)
  })

  it('la prioridad es por (tipo, hora): otro horario del unificado sí dispara', () => {
    const later = u({ times: ['18:00'] })
    expect(dueReminders([later], new Date(2026, 8, 14, 18, 30), new Set(['agua|10:00']))).toHaveLength(1)
  })

  it('tipos sin equivalente histórico (comer) no compiten', () => {
    const comer: NormalizedReminder = { ...u(), id: 'comer-1', kind: 'comer' }
    expect(LEGACY_OVERLAP.has('comer')).toBe(false)
    expect(dueReminders([comer], monday, new Set(['agua|10:00']))).toHaveLength(1)
  })

  it('respeta días, hora, activación e idempotencia por id propio', () => {
    expect(dueReminders([u({ enabled: false })], monday, new Set())).toHaveLength(0)
    expect(dueReminders([u({ days: [false, false, false, false, false, false, false] })], monday, new Set())).toHaveLength(0)
    const early = new Date(2026, 8, 14, 9, 59)
    expect(dueReminders([u()], early, new Set())).toHaveLength(0)
    const fired = new Set([firedId('agua-1', '2026-09-14', '10:00')])
    expect(dueReminders([u()], monday, new Set(), () => true, fired)).toHaveLength(0)
  })

  it('entrenamiento unificado exige día de entrenamiento (igual que el histórico)', () => {
    const ent = u({ id: 'entrenamiento-1', kind: 'entrenamiento', times: ['07:30'] })
    expect(dueReminders([ent], monday, new Set(), () => true)).toHaveLength(1)
    expect(dueReminders([ent], monday, new Set(), () => false)).toHaveLength(0)
  })

  it('legacyFiredKindTime deriva (tipo|hora) desde las claves del histórico', () => {
    const fired = new Set([firedId('agua', '2026-09-14', '10:00')])
    const keys = legacyFiredKindTime([{ id: 'agua', kind: 'agua', times: ['10:00'] }], '2026-09-14', fired)
    expect(keys.has('agua|10:00')).toBe(true)
  })
})

describe('R4 — checkAndFire: un solo motor, sin duplicados', () => {
  it('regresión: el sistema histórico sigue disparando igual', async () => {
    await saveConfigs(defaultConfigs().map((c) => (c.id === 'agua' ? legacyAgua() : { ...c, enabled: false })))

    const fired = await checkAndFire(() => {}, () => true)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe('agua')
    expect(fired).toContain('agua@10:00')
  })

  it('el unificado dispara cuando el histórico está deshabilitado', async () => {
    await saveConfigs(defaultConfigs().map((c) => ({ ...c, enabled: false })))
    await saveUnifiedConfig(unifiedAgua())

    const fired = await checkAndFire(() => {}, () => true)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    // El primer argumento es el TIPO ('agua'); la procedencia la da el id en firedOut.
    expect(fired).toContain('agua-1@10:00')
    expect(fired).not.toContain('agua@10:00')
  })

  it('mismo tipo y hora en ambos sistemas → UNA sola notificación (prioridad histórica)', async () => {
    await saveConfigs(defaultConfigs().map((c) => (c.id === 'agua' ? legacyAgua() : { ...c, enabled: false })))
    await saveUnifiedConfig(unifiedAgua())

    const fired = await checkAndFire(() => {}, () => true)

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe('agua')
    // El unificado quedó suprimido: sin segunda entrada en firedOut.
    expect(fired.filter((f) => f.startsWith('agua-1'))).toHaveLength(0)
  })

  it('comer (sin equivalente histórico) dispara junto con el histórico, sin chocar', async () => {
    await saveConfigs(defaultConfigs().map((c) => (c.id === 'agua' ? legacyAgua() : { ...c, enabled: false })))
    await saveUnifiedConfig(unifiedAgua({ id: 'comer-1', type: 'comer', title: 'Comer' }))

    const firedOut = await checkAndFire(() => {}, () => true)

    expect(sendSpy).toHaveBeenCalledTimes(2)
    const types = sendSpy.mock.calls.map((c) => c[0]).sort()
    expect(types).toEqual(['agua', 'comer'])
    expect(firedOut).toContain('comer-1@10:00')
  })

  it('idempotencia: un segundo ciclo no vuelve a notificar lo ya disparado', async () => {
    await saveConfigs(defaultConfigs().map((c) => ({ ...c, enabled: false })))
    await saveUnifiedConfig(unifiedAgua())

    await checkAndFire(() => {}, () => true)
    await checkAndFire(() => {}, () => true)

    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('el histórico ya disparado hoy sigue suprimiendo al unificado en ciclos posteriores', async () => {
    await saveConfigs(defaultConfigs().map((c) => (c.id === 'agua' ? legacyAgua() : { ...c, enabled: false })))
    await saveUnifiedConfig(unifiedAgua())

    await checkAndFire(() => {}, () => true) // dispara el histórico
    await checkAndFire(() => {}, () => true) // ciclo siguiente

    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0]).toBe('agua')
  })

  it('sin plataforma no dispara ni escribe dominio (honestidad conservada)', async () => {
    sendSpy.mockResolvedValue(false)
    await saveConfigs(defaultConfigs().map((c) => (c.id === 'agua' ? legacyAgua() : { ...c, enabled: false })))
    await saveUnifiedConfig(unifiedAgua())

    const fired = await checkAndFire(() => {}, () => true)

    expect(fired).toEqual([])
    expect(await db.trainingSessions.count()).toBe(0)
    expect(await db.recoveryChecks.count()).toBe(0)
  })
})
