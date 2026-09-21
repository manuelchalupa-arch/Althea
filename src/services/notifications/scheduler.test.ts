import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  dueNotifications, localDayIdx, loadConfigs, saveConfigs, passesGates,
  ensureKinds, defaultConfigs, checkAndFire, type NotifConfig,
} from './scheduler'
import { getNotificationLog, addNotificationLog, clearNotificationLog, sendNotification } from './push'
import { db } from '@/services/storage/db'

const base: NotifConfig = {
  id: 'agua', kind: 'agua', title: 'Agua', enabled: true,
  times: ['10:00'], days: [true, true, true, true, true, false, false],
}
// Lunes 2026-09-14 10:30 hora local
const monday = new Date(2026, 8, 14, 10, 30)

const GATES_OFF = { hydrationMet: false, recoveryDone: false, goalsPersonalized: false, hasCoachData: false }

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  await db.delete()
  await db.open()
})

describe('FASE 9 — scheduler (§41): vencimiento, días, duplicados', () => {
  it('dispara horario vencido en día habilitado', () => {
    expect(localDayIdx(monday)).toBe(0)
    const due = dueNotifications([base], monday, () => true, new Set())
    expect(due.map((c) => c.id)).toEqual(['agua'])
  })
  it('no dispara antes del horario', () => {
    const early = new Date(2026, 8, 14, 9, 59)
    expect(dueNotifications([base], early, () => true, new Set())).toEqual([])
  })
  it('respeta días y activación', () => {
    const sunday = new Date(2026, 8, 20, 10, 30)
    expect(dueNotifications([base], sunday, () => true, new Set())).toEqual([])
    expect(dueNotifications([{ ...base, enabled: false }], monday, () => true, new Set())).toEqual([])
  })
  it('entrenamiento solo en día programado', () => {
    const cfg: NotifConfig = { ...base, id: 'ent', kind: 'entrenamiento', times: ['07:30'] }
    expect(dueNotifications([cfg], new Date(2026, 8, 14, 8, 0), () => true, new Set())).toHaveLength(1)
    expect(dueNotifications([cfg], new Date(2026, 8, 14, 8, 0), () => false, new Set())).toEqual([])
  })
  it('horario ya disparado hoy no se repite (idempotencia)', () => {
    const fired = new Set(['agua|2026-09-14|10:00'])
    expect(dueNotifications([base], monday, () => true, fired)).toEqual([])
  })
})

describe('FASE 9 — puertas de realidad por categoría', () => {
  const agua = { ...base }
  const cues = { ...base, id: 'cuestionario', kind: 'cuestionario' as const }
  const prot = { ...base, id: 'proteina', kind: 'proteina' as const }
  const coach = { ...base, id: 'coach', kind: 'coach' as const }
  it('agua se omite con objetivo cumplido', () => {
    expect(passesGates(agua, { ...GATES_OFF, hydrationMet: true })).toBe(false)
    expect(passesGates(agua, GATES_OFF)).toBe(true)
  })
  it('check-in se omite si ya existe', () => {
    expect(passesGates(cues, { ...GATES_OFF, recoveryDone: true })).toBe(false)
    expect(passesGates(cues, GATES_OFF)).toBe(true)
  })
  it('proteína requiere metas personalizadas', () => {
    expect(passesGates(prot, GATES_OFF)).toBe(false)
    expect(passesGates(prot, { ...GATES_OFF, goalsPersonalized: true })).toBe(true)
  })
  it('coach requiere datos reales', () => {
    expect(passesGates(coach, GATES_OFF)).toBe(false)
    expect(passesGates(coach, { ...GATES_OFF, hasCoachData: true })).toBe(true)
  })
})

describe('FASE 9 — persistencia Dexie + reload', () => {
  it('configs persisten y sobreviven reload; kinds nuevos se agregan', async () => {
    const cfgs = await loadConfigs()
    expect(cfgs.length).toBeGreaterThanOrEqual(7)
    expect(cfgs.some(c => c.id === 'coach')).toBe(true)
    const toggled = cfgs.map(c => (c.id === 'agua' ? { ...c, enabled: true } : c))
    await saveConfigs(toggled)
    await db.close()
    await db.open()
    const reloaded = await loadConfigs()
    expect(reloaded.find(c => c.id === 'agua')?.enabled).toBe(true)
  })
  it('ensureKinds agrega faltantes sin duplicar', () => {
    const partial = defaultConfigs().filter(c => c.id !== 'coach')
    const merged = ensureKinds(partial)
    expect(merged.filter(c => c.id === 'coach')).toHaveLength(1)
    expect(ensureKinds(merged).length).toBe(merged.length)
  })
  it('migración legacy una sola vez', async () => {
    localStorage.setItem('althea:notifs:v1', JSON.stringify([{ ...base, enabled: true }]))
    const cfgs = await loadConfigs()
    expect(cfgs.find(c => c.id === 'agua')?.enabled).toBe(true)
    expect(localStorage.getItem('althea:notifs:v1')).toBeNull()
  })
})

describe('FASE 9 — plataforma y honestidad', () => {
  it('sin API de notificaciones no se envía ni se marca', async () => {
    // jsdom: Notification indefinido → false, sin pedir permiso
    const ok = await sendNotification('agua', 'T', 'B')
    expect(ok).toBe(false)
  })
  it('checkAndFire sin plataforma no dispara ni escribe dominio', async () => {
    await saveConfigs(defaultConfigs().map(c => ({ ...c, enabled: true })))
    const fired = await checkAndFire()
    expect(fired).toEqual([])
    expect(await db.trainingSessions.count()).toBe(0)
    expect(await db.nutritionDiary.count()).toBe(0)
    expect(await db.recoveryChecks.count()).toBe(0)
  })
})

describe('Notification Log API (Dexie)', () => {
  it('add/get/clear con ids deterministas', async () => {
    const id = await addNotificationLog({
      type: 'agua', title: 'Test', body: 'Body',
      date: '2026-09-14', time: '10:30', sent: true,
    })
    expect(id).toBe('2026-09-14T10:30:agua')
    // Re-registro del mismo evento no duplica (upsert por id)
    await addNotificationLog({
      type: 'agua', title: 'Test', body: 'Body',
      date: '2026-09-14', time: '10:30', sent: true,
    })
    expect(await getNotificationLog()).toHaveLength(1)
    await clearNotificationLog()
    expect(await getNotificationLog()).toHaveLength(0)
  })
})
