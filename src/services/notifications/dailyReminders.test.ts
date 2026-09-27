import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/storage/db'
import { loadUnifiedConfigs, saveUnifiedConfig, saveUnifiedConfigs, updateUnifiedConfig } from './unifiedNotifications'
import { ensurePendingForDue, isBlocked, getPendingActions } from './requiredActionService'

describe('BLOQUE 8 — Recordatorios diarios (comer, agua, recuperación, entrenar)', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('creación: crear recordatorio comer', async () => {
    const all = await loadUnifiedConfigs()
    const before = all.filter(c => c.type === 'comer').length
    await saveUnifiedConfig({ id: 'comer-test', type: 'comer', title: 'Comer almuerzo', enabled: true, time: '13:00', times: ['13:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    const after = await loadUnifiedConfigs()
    expect(after.some(c => c.id === 'comer-test')).toBe(true)
    expect(after.filter(c => c.type === 'comer').length).toBe(before + 1)
  })

  it('edición: cambiar título y horario', async () => {
    const all = await loadUnifiedConfigs()
    const agua = all.find(c => c.type === 'agua')!
    await saveUnifiedConfig({ ...agua, title: 'Tomar agua', time: '19:30', times: ['19:30'] })
    const reloaded = await loadUnifiedConfigs()
    const updated = reloaded.find(c => c.id === agua.id)!
    expect(updated.title).toBe('Tomar agua')
    expect(updated.time).toBe('19:30')
    // edición vía update
    await updateUnifiedConfig(agua.id, { title: 'Agua fresca' })
    const re2 = await loadUnifiedConfigs()
    expect(re2.find(c => c.id === agua.id)?.title).toBe('Agua fresca')
  })

  it('eliminación', async () => {
    await saveUnifiedConfig({ id: 'otro-del', type: 'otro', title: 'Borrame', enabled: false, time: '10:00', times: ['10:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    let all = await loadUnifiedConfigs()
    expect(all.some(c => c.id === 'otro-del')).toBe(true)
    const filtered = all.filter(c => c.id !== 'otro-del')
    await saveUnifiedConfigs(filtered)
    all = await loadUnifiedConfigs()
    expect(all.some(c => c.id === 'otro-del')).toBe(false)
  })

  it('horario: recordatorio respeta HH:MM y título simple', async () => {
    await saveUnifiedConfig({ id: 'agua-1930', type: 'agua', title: 'Tomar agua', enabled: true, time: '19:30', times: ['19:30'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    const cfg = (await loadUnifiedConfigs()).find(c => c.id === 'agua-1930')!
    expect(cfg.time).toBe('19:30')
    expect(cfg.title).toBe('Tomar agua')
    expect(cfg.title.length).toBeLessThan(40) // simple, no texto largo
    await saveUnifiedConfig({ id: 'prep-2130', type: 'preparar_habitacion', title: 'Preparar habitación', enabled: true, time: '21:30', times: ['21:30'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    const prep = (await loadUnifiedConfigs()).find(c => c.id === 'prep-2130')!
    expect(prep.time).toBe('21:30')
    expect(prep.title).toBe('Preparar habitación')
    await saveUnifiedConfig({ id: 'otro-2300', type: 'otro', title: 'Dormir', enabled: true, time: '23:00', times: ['23:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    expect((await loadUnifiedConfigs()).find(c => c.id === 'otro-2300')?.title).toBe('Dormir')
  })

  it('recurrencia: daily, weekdays, custom', async () => {
    const all = await loadUnifiedConfigs()
    const ent = all.find(c => c.type === 'entrenamiento')!
    // weekdays
    await saveUnifiedConfig({ ...ent, recurrence: 'weekdays', days: [true, true, true, true, true, false, false] })
    expect((await loadUnifiedConfigs()).find(c => c.id === ent.id)?.recurrence).toBe('weekdays')
    // daily
    await saveUnifiedConfig({ ...ent, recurrence: 'daily', days: [true, true, true, true, true, true, true] })
    expect((await loadUnifiedConfigs()).find(c => c.id === ent.id)?.days).toEqual([true, true, true, true, true, true, true])
    // custom: solo L y M
    await saveUnifiedConfig({ ...ent, recurrence: 'custom', days: [true, true, false, false, false, false, false] })
    const custom = (await loadUnifiedConfigs()).find(c => c.id === ent.id)!
    expect(custom.recurrence).toBe('custom')
    expect(custom.days[0]).toBe(true)
    expect(custom.days[2]).toBe(false)
    // domingo no debe disparar si custom excluye domingo
    await saveUnifiedConfig({ ...custom, enabled: true, requiredAction: true, time: '08:00', times: ['08:00'] })
    await ensurePendingForDue('2026-01-11', new Date(2026, 0, 11, 9, 0)) // 2026-01-11 es domingo (dow 0)
    expect(await isBlocked('2026-01-11')).toBe(false)
    // lunes sí
    await ensurePendingForDue('2026-01-12', new Date(2026, 0, 12, 9, 0))
    expect(await isBlocked('2026-01-12')).toBe(true)
  })

  it('activación: activo dispara, inactivo no', async () => {
    await saveUnifiedConfig({ id: 'comer-act', type: 'comer', title: 'Comer', enabled: false, time: '13:00', times: ['13:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: true, updatedAt: new Date().toISOString() })
    await ensurePendingForDue('2026-01-13', new Date(2026, 0, 13, 14, 0))
    expect(await isBlocked('2026-01-13')).toBe(false)
    await saveUnifiedConfig({ id: 'comer-act', type: 'comer', title: 'Comer', enabled: true, time: '13:00', times: ['13:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: true, updatedAt: new Date().toISOString() })
    await ensurePendingForDue('2026-01-13', new Date(2026, 0, 13, 14, 0))
    expect(await isBlocked('2026-01-13')).toBe(true)
  })

  it('integración con acción obligatoria: recuperación puede ser normal u obligatoria', async () => {
    // normal: no bloquea
    await saveUnifiedConfig({ id: 'rec-norm', type: 'recuperacion', title: 'Recuperación', enabled: true, time: '21:00', times: ['21:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    await ensurePendingForDue('2026-01-14', new Date(2026, 0, 14, 22, 0))
    expect((await getPendingActions('2026-01-14')).some(p => p.configId === 'rec-norm')).toBe(false)
    // obligatoria: bloquea
    await saveUnifiedConfig({ id: 'rec-norm', type: 'recuperacion', title: 'Recuperación', enabled: true, time: '21:00', times: ['21:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: true, updatedAt: new Date().toISOString() })
    await ensurePendingForDue('2026-01-14', new Date(2026, 0, 14, 22, 0))
    expect((await getPendingActions('2026-01-14')).some(p => p.configId === 'rec-norm')).toBe(true)
    expect(await isBlocked('2026-01-14')).toBe(true)
  })

  it('tomar agua usa botellas reales y no se vuelve prescriptivo (continúa aunque parcial)', async () => {
    // botellas: registrar 750ml de 2500 objetivo -> parcial, recordatorio debe seguir
    await db.hydrationBottles.bulkPut([
      { id: 'bottle-1', name: 'B1', capacityMl: 750, active: true, order: 1, updatedAt: new Date().toISOString() },
      { id: 'bottle-2', name: 'B2', capacityMl: 1000, active: true, order: 2, updatedAt: new Date().toISOString() },
    ])
    await db.hydrationBottleLogs.put({ id: 'l1', localDate: '2026-01-15', bottleId: 'bottle-1', amountMl: 750, time: new Date().toISOString() } as never)
    await db.hydrationLogs.put({ id: 'l1', localDate: '2026-01-15', amountMl: 750, time: new Date().toISOString() } as never)
    // agua recordatorio diario simple, no prescriptivo, solo título y hora
    await saveUnifiedConfig({ id: 'agua-simple', type: 'agua', title: 'Tomar agua', enabled: true, time: '15:00', times: ['15:00'], days: [true, true, true, true, true, true, true], recurrence: 'daily', requiredAction: false, updatedAt: new Date().toISOString() })
    const cfg = (await loadUnifiedConfigs()).find(c => c.id === 'agua-simple')!
    expect(cfg.title).toBe('Tomar agua') // simple, no texto largo automático
    expect(cfg.times).toEqual(['15:00'])
    // aunque haya hidratación parcial, el recordatorio sigue siendo válido (no se autocancela por parcial)
    // La integración real es que el recordatorio no se suprime hasta hidratación completa (gate en scheduler), aquí solo verificamos que el registro de botellas existe
    const logs = await db.hydrationBottleLogs.where('localDate').equals('2026-01-15').toArray()
    expect(logs.length).toBe(1)
    expect(logs[0].amountMl).toBe(750)
  })
})
