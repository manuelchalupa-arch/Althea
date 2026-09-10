import { describe, it, expect, beforeEach } from 'vitest'
import { dueNotifications, localDayIdx, type NotifConfig } from './scheduler'

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
