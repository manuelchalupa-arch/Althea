import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dueNotifications, localDayIdx, type NotifConfig } from './scheduler'
import { getNotificationLog, addNotificationLog, clearNotificationLog } from './push'

const base: NotifConfig = {
  id: 'agua', kind: 'agua', title: 'Agua', enabled: true,
  times: ['10:00'], days: [true, true, true, true, true, false, false],
}
// Lunes 2026-09-14 10:30 hora local
const monday = new Date(2026, 8, 14, 10, 30)

beforeEach(() => { localStorage.clear() })

describe('scheduler (§41)', () => {
  it('dispara horario vencido en día habilitado', () => {
    expect(localDayIdx(monday)).toBe(0)
    const due = dueNotifications([base], monday)
    expect(due.map((c) => c.id)).toEqual(['agua'])
  })
  it('no dispara antes del horario', () => {
    const early = new Date(2026, 8, 14, 9, 59)
    expect(dueNotifications([base], early)).toEqual([])
  })
  it('respeta días y activación', () => {
    const sunday = new Date(2026, 8, 20, 10, 30)
    expect(dueNotifications([base], sunday)).toEqual([])
    expect(dueNotifications([{ ...base, enabled: false }], monday)).toEqual([])
  })
  it('entrenamiento solo en día programado', () => {
    const cfg: NotifConfig = { ...base, id: 'ent', kind: 'entrenamiento', times: ['07:30'] }
    expect(dueNotifications([cfg], new Date(2026, 8, 14, 8, 0), () => true)).toHaveLength(1)
    expect(dueNotifications([cfg], new Date(2026, 8, 14, 8, 0), () => false)).toEqual([])
  })
})

describe('Notification Log API', () => {
  it('addNotificationLog creates entry with id', () => {
    const id = addNotificationLog({
      type: 'pre-entreno',
      title: 'Test',
      body: 'Body',
      date: '2026-09-14',
      time: '10:30',
      sent: true,
    })
    expect(id).toBe('2026-09-14T10:30:pre-entreno')
  })

  it('getNotificationLog returns entries', () => {
    addNotificationLog({
      type: 'pre-entreno',
      title: 'Test 1',
      body: 'Body 1',
      date: '2026-09-14',
      time: '10:30',
      sent: true,
    })
    addNotificationLog({
      type: 'agua',
      title: 'Test 2',
      body: 'Body 2',
      date: '2026-09-14',
      time: '12:00',
      sent: false,
    })
    const log = getNotificationLog()
    expect(log).toHaveLength(2)
    expect(log[0].type).toBe('agua')
    expect(log[1].type).toBe('pre-entreno')
  })

  it('clearNotificationLog removes all entries', () => {
    addNotificationLog({
      type: 'pre-entreno',
      title: 'Test',
      body: 'Body',
      date: '2026-09-14',
      time: '10:30',
      sent: true,
    })
    expect(getNotificationLog()).toHaveLength(1)
    clearNotificationLog()
    expect(getNotificationLog()).toHaveLength(0)
  })

  it('limits log to 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      addNotificationLog({
        type: 'pre-entreno',
        title: `Test ${i}`,
        body: 'Body',
        date: '2026-09-14',
        time: `${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}`,
        sent: true,
      })
    }
    const log = getNotificationLog()
    expect(log.length).toBe(100)
  })
})
