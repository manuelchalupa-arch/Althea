import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { db } from '@/services/storage/db'
import { isDateInPeriod } from '@/services/training/metrics'
import { todayKey, toDateKey } from '@/utils/dates'
import PeriodizationEditor from '@/components/recovery/PeriodizationEditor'

// FASE 2 - S7: los dos call sites que quedaban en componentes/UI.
//  - Progreso.tsx filtraba el periodo con `createdAt.slice(0,10)` (dia UTC) en la
//    misma linea 281, mientras la linea 326 del MISMO archivo usaba toDateKey.
//  - PeriodizationEditoroffers "Fecha inicio" = dia UTC, y generaba la secuencia
//    semanal desde ahi.
const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0)

afterEach(() => { vi.useRealTimers() })

describe('S7 - Progreso: el filtro de periodo usa el dia civil local', () => {
  it('un set de las 21:30 cuenta en el periodo de HOY (no en el de manana)', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))
    const createdAt = atLocal(2026, 3, 10, 21, 30).toISOString()
    const hoy = { customStart: '2026-03-10', customEnd: '2026-03-10' }
    const manana = { customStart: '2026-03-11', customEnd: '2026-03-11' }

    // expresion corregida (Progreso.tsx:281)
    expect(isDateInPeriod(toDateKey(createdAt), 'custom', hoy)).toBe(true)
    expect(isDateInPeriod(toDateKey(createdAt), 'custom', manana)).toBe(false)

    // expresion anterior: el dia UTC lo mandaba al periodo equivocado
    expect(isDateInPeriod(createdAt.slice(0, 10), 'custom', hoy)).toBe(false)
    expect(isDateInPeriod(createdAt.slice(0, 10), 'custom', manana)).toBe(true)
  })

  it('un set de la madrugada cuenta en el dia local, no en el anterior', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 11, 0, 30))
    const createdAt = atLocal(2026, 3, 11, 0, 30).toISOString()

    expect(isDateInPeriod(toDateKey(createdAt), 'custom', { customStart: '2026-03-11', customEnd: '2026-03-11' })).toBe(true)
    expect(toDateKey(createdAt)).toBe(todayKey())
  })
})

describe('S7 - Periodizacion: "Fecha inicio" es el dia local', () => {
  it('a las 21:30 el calendario ofrece hoy, no manana', async () => {
    await db.delete()
    await db.open()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocal(2026, 3, 10, 21, 30))

    render(<PeriodizationEditor />)
    const trigger = await screen.findByRole('button', { name: 'Fecha de inicio de la secuencia' })
    // El control visual es un calendario accesible, no un input nativo.
    expect(trigger.textContent).toContain('10/03/2026')
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Fecha de inicio de la secuencia' })
    const selectedDay = within(dialog).getByRole('button', { name: '10', exact: true })
    expect(selectedDay).toHaveAttribute('aria-pressed', 'true')
    expect(todayKey()).toBe('2026-03-10')
    // el dia UTC habria sido manana: ese era el bug
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-03-11')
  })
})
