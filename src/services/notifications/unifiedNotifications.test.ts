import { describe, it, expect, beforeEach } from 'vitest'
import { todayKey } from '@/utils/dates'
import { db } from '@/services/storage/db'
import { loadUnifiedConfigs, saveUnifiedConfig, NOTIF_TYPE_LABEL } from './unifiedNotifications'
import { ensurePendingForDue, getPendingActions, isBlocked, completeAction, completeRecoveryCheck, hasPendingOnReopen } from './requiredActionService'
import { updateRecoveryCheck } from '@/services/recovery/recoveryService'

describe('BLOQUE 4 — Notificaciones + Acciones obligatorias', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('1. notificación activa persiste en Dexie', async () => {
    const cfgs = await loadUnifiedConfigs()
    const comer = cfgs.find(c => c.type === 'comer')!
    comer.enabled = true
    await saveUnifiedConfig(comer)
    const reloaded = await loadUnifiedConfigs()
    expect(reloaded.find(c => c.id === comer.id)?.enabled).toBe(true)
  })

  it('2. notificación inactiva no genera pending', async () => {
    const cfgs = await loadUnifiedConfigs()
    const agua = cfgs.find(c => c.type === 'agua')!
    agua.enabled = false
    agua.requiredAction = true
    await saveUnifiedConfig(agua)
    await ensurePendingForDue(todayKey(), new Date(2026, 0, 10, 12, 0))
    expect(await isBlocked()).toBe(false)
  })

  it('3. horario respeta hora (no due antes, due después)', async () => {
    const cfgs = await loadUnifiedConfigs()
    const prep = cfgs.find(c => c.type === 'preparar_habitacion')!
    prep.enabled = true
    prep.requiredAction = true
    prep.time = '22:00'
    prep.times = ['22:00']
    prep.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(prep)
    const date = '2026-01-10'
    await ensurePendingForDue(date, new Date(2026, 0, 10, 21, 0))
    expect(await isBlocked(date)).toBe(false)
    await ensurePendingForDue(date, new Date(2026, 0, 10, 22, 30))
    expect(await isBlocked(date)).toBe(true)
  })

  it('4. título personalizado se guarda (usuario define título)', async () => {
    const cfgs = await loadUnifiedConfigs()
    const otro = cfgs.find(c => c.type === 'otro')!
    otro.title = 'Mi recordatorio personalizado'
    await saveUnifiedConfig(otro)
    const reloaded = await loadUnifiedConfigs()
    expect(reloaded.find(c => c.id === otro.id)?.title).toBe('Mi recordatorio personalizado')
    expect(NOTIF_TYPE_LABEL['otro']).toBe('Otro recordatorio')
  })

  it('5. acción normal (requiredAction false) nunca bloquea', async () => {
    const cfgs = await loadUnifiedConfigs()
    const ent = cfgs.find(c => c.type === 'entrenamiento')!
    ent.enabled = true
    ent.requiredAction = false
    ent.time = '07:30'
    ent.times = ['07:30']
    ent.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(ent)
    await ensurePendingForDue('2026-01-11', new Date(2026, 0, 11, 8, 0))
    const pending = await getPendingActions('2026-01-11')
    expect(pending.length).toBe(0)
    expect(await isBlocked('2026-01-11')).toBe(false)
  })

  it('6. acción obligatoria crea pending', async () => {
    const cfgs = await loadUnifiedConfigs()
    const agua = cfgs.find(c => c.type === 'agua')!
    agua.enabled = true
    agua.requiredAction = true
    agua.time = '10:00'
    agua.times = ['10:00']
    agua.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(agua)
    await ensurePendingForDue('2026-01-12', new Date(2026, 0, 12, 10, 30))
    const pending = await getPendingActions('2026-01-12')
    expect(pending.length).toBe(1)
    expect(pending[0].status).toBe('pending')
  })

  it('7. bloqueo: pending impide continuar (isBlocked true)', async () => {
    const cfgs = await loadUnifiedConfigs()
    const rec = cfgs.find(c => c.type === 'recuperacion')!
    rec.enabled = true
    rec.requiredAction = true
    rec.time = '09:00'
    rec.times = ['09:00']
    rec.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(rec)
    await ensurePendingForDue('2026-01-13', new Date(2026, 0, 13, 9, 30))
    expect(await isBlocked('2026-01-13')).toBe(true)
  })

  it('8. completar acción', async () => {
    const cfgs = await loadUnifiedConfigs()
    const rec = cfgs.find(c => c.type === 'recuperacion')!
    rec.enabled = true
    rec.requiredAction = true
    rec.time = '09:00'
    rec.times = ['09:00']
    rec.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(rec)
    await ensurePendingForDue('2026-01-14', new Date(2026, 0, 14, 9, 30))
    expect(await isBlocked('2026-01-14')).toBe(true)
    await completeAction(rec.id, '2026-01-14')
    const status = await db.requiredActionStates.get(`${rec.id}|2026-01-14`) as unknown as { status: string } | undefined
    expect(status?.status).toBe('completed')
  })

  it('9. desbloqueo: tras completar, isBlocked false', async () => {
    const cfgs = await loadUnifiedConfigs()
    const rec = cfgs.find(c => c.type === 'recuperacion')!
    rec.enabled = true
    rec.requiredAction = true
    rec.time = '09:00'
    rec.times = ['09:00']
    rec.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(rec)
    await ensurePendingForDue('2026-01-15', new Date(2026, 0, 15, 9, 30))
    await completeAction(rec.id, '2026-01-15')
    expect(await isBlocked('2026-01-15')).toBe(false)
    expect((await getPendingActions('2026-01-15')).length).toBe(0)
  })

  it('10. recuperación obligatoria bloquea y se desbloquea al guardar RecoveryCheck', async () => {
    const cfgs = await loadUnifiedConfigs()
    const rec = cfgs.find(c => c.type === 'recuperacion')!
    rec.enabled = true
    rec.requiredAction = true
    rec.time = '09:00'
    rec.times = ['09:00']
    rec.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(rec)
    const date = '2026-01-16'
    await ensurePendingForDue(date, new Date(2026, 0, 16, 9, 30))
    expect(await isBlocked(date)).toBe(true)
    // completar RecoveryCheck como lo hace el formulario
    await updateRecoveryCheck({ energy: 7, fatigue: 3, stress: 3, soreness: 3, motivation: 7, perceivedExertion: 5, painArea: '', painObservation: '', score: 80, color: 'green' } as never, date)
    await completeRecoveryCheck(date)
    expect(await isBlocked(date)).toBe(false)
    // si ya existe RecoveryCheck, no vuelve a crear pending ese día
    await ensurePendingForDue(date, new Date(2026, 0, 16, 10, 0))
    expect(await isBlocked(date)).toBe(false)
  })

  it('11. volver a abrir aplicación con acción pendiente (Dexie, no React state)', async () => {
    const cfgs = await loadUnifiedConfigs()
    const prep = cfgs.find(c => c.type === 'preparar_habitacion')!
    prep.enabled = true
    prep.requiredAction = true
    prep.time = '22:00'
    prep.times = ['22:00']
    prep.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(prep)
    const date = '2026-01-17'
    await ensurePendingForDue(date, new Date(2026, 0, 17, 23, 0))
    expect(await hasPendingOnReopen(date)).toBe(true)
    // simular cierre/reapertura Dexie
    await db.close()
    await db.open()
    expect(await hasPendingOnReopen(date)).toBe(true)
    expect(await isBlocked(date)).toBe(true)
  })

  it('12. persistencia Dexie: configs y estados sobreviven reload, no solo React', async () => {
    const cfgs = await loadUnifiedConfigs()
    // Preparar habitación simple: solo horario + título + activar
    const prep = cfgs.find(c => c.type === 'preparar_habitacion')!
    prep.title = 'Preparar cuarto antes de dormir'
    prep.time = '22:30'
    prep.times = ['22:30']
    prep.enabled = true
    prep.requiredAction = false
    await saveUnifiedConfig(prep)
    const agua = cfgs.find(c => c.type === 'agua')!
    agua.enabled = true
    agua.requiredAction = true
    agua.time = '10:00'
    agua.times = ['10:00']
    agua.days = [true, true, true, true, true, true, true]
    await saveUnifiedConfig(agua)
    await ensurePendingForDue('2026-01-18', new Date(2026, 0, 18, 10, 30))
    await db.close()
    await db.open()
    const reloaded = await loadUnifiedConfigs()
    expect(reloaded.find(c => c.id === prep.id)?.title).toBe('Preparar cuarto antes de dormir')
    expect(reloaded.find(c => c.id === prep.id)?.time).toBe('22:30')
    expect(reloaded.find(c => c.id === prep.id)?.enabled).toBe(true)
    const pendingAfter = await getPendingActions('2026-01-18')
    expect(pendingAfter.length).toBe(1)
    expect(pendingAfter[0].config.type).toBe('agua')
    // verificar que no depende de localStorage
    expect(localStorage.getItem('requiredAction')).toBeNull()
  })
})
