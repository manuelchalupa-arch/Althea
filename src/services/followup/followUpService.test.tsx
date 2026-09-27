import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { FollowUpForm } from '@/components/followup/FollowUpForm'
import {
  followUpRange, followUpDate, hasFollowUpData, saveFollowUp, listFollowUps,
} from '@/services/followup/followUpService'
import { FOLLOW_UP_PERIODS, followUpPeriodLabel } from '@/services/followup/periods'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'

const TODAY = todayKey()

describe('períodos de seguimiento', () => {
  it('son exactamente 3: semanal, mensual, personalizado', () => {
    expect(FOLLOW_UP_PERIODS.map(p => p.id)).toEqual(['7', '30', 'custom'])
    expect(FOLLOW_UP_PERIODS.map(p => p.label)).toEqual(['Semanal', 'Mensual', 'Personalizado'])
  })

  it('followUpPeriodLabel devuelve la etiqueta', () => {
    expect(followUpPeriodLabel('7')).toBe('Semanal')
    expect(followUpPeriodLabel('30')).toBe('Mensual')
    expect(followUpPeriodLabel('custom')).toBe('Personalizado')
  })

  it('semanal = 7 días inclusivos terminando hoy', () => {
    const r = followUpRange('7', undefined, undefined, TODAY)
    expect(r.end).toBe(TODAY)
    expect(r.start).toBe(followUpRange('7', undefined, undefined, TODAY).start)
  })

  it('mensual = 30 días inclusivos terminando hoy', () => {
    const r = followUpRange('30', undefined, undefined, TODAY)
    expect(r.end).toBe(TODAY)
  })

  it('personalizado usa las fechas informadas', () => {
    expect(followUpRange('custom', '2026-01-01', '2026-01-31')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('personalizado invierte fechas desordenadas', () => {
    expect(followUpRange('custom', '2026-01-31', '2026-01-01')).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('followUpDate usa la fecha explícita', () => {
    expect(followUpDate({ period: '7', date: '2026-02-02' })).toBe('2026-02-02')
  })

  it('followUpDate cae en el fin del período', () => {
    expect(followUpDate({ period: '7', customStart: '2026-01-01' })).toBe(followUpRange('7').end)
  })
})

describe('hasFollowUpData', () => {
  it('false sin datos', () => {
    expect(hasFollowUpData({ period: '7' })).toBe(false)
    expect(hasFollowUpData({ period: '7', measurements: {}, recovery: {} })).toBe(false)
  })

  it('true con una sola medida', () => {
    expect(hasFollowUpData({ period: '7', measurements: { weightKg: 80 } })).toBe(true)
  })

  it('true con un solo campo de recuperación', () => {
    expect(hasFollowUpData({ period: '7', recovery: { sleepHours: 7 } })).toBe(true)
  })
})

describe('saveFollowUp', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

  it('guarda medidas en bodyMeasurements con id determinista', async () => {
    const res = await saveFollowUp({ period: '7', measurements: { weightKg: 80.04, waistCm: 88 } })
    expect(res.savedMeasurement).toBe(true)
    const row = await db.bodyMeasurements.get(`followup-${res.date}`)
    expect(row?.weightKg).toBe(80)
    expect(row?.waistCm).toBe(88)
    expect(row?.isDemo).toBe(false)
  })

  it('no crea fila si no hay medidas', async () => {
    const res = await saveFollowUp({ period: '7', recovery: { sleepHours: 7.5 } })
    expect(res.savedMeasurement).toBe(false)
    expect(res.savedRecovery).toBe(true)
  })

  it('guarda recuperación en recoveryChecks con la fecha del período', async () => {
    const res = await saveFollowUp({ period: '7', recovery: { sleepHours: 7.5, energy: 8, fatigue: 3 } })
    const rec = await db.recoveryChecks.get(res.date)
    expect(rec?.sleepHours).toBe(7.5)
    expect(rec?.energy).toBe(8)
    expect(rec?.fatigue).toBe(3)
  })

  it('calcula el índice solo con los 7 campos completos', async () => {
    const res = await saveFollowUp({ period: '7', recovery: { sleepHours: 7, energy: 8, fatigue: 3 } })
    const parcial = await db.recoveryChecks.get(res.date)
    expect(parcial?.score).toBeUndefined()

    await saveFollowUp({
      period: '7',
      recovery: { soreness: 2, mood: 8, motivation: 9, stress: 2, perceivedExertion: 5 },
    })
    const full = await db.recoveryChecks.get(res.date)
    expect(full?.score).toBeTypeOf('number')
    expect(full?.color).toBeTypeOf('string')
  })

  it('respeta la fecha personalizada', async () => {
    const res = await saveFollowUp({ period: 'custom', customStart: '2026-01-01', customEnd: '2026-01-15', measurements: { weightKg: 70 } })
    expect(res.date).toBe('2026-01-15')
    const row = await db.bodyMeasurements.get('followup-2026-01-15')
    expect(row?.localDate).toBe('2026-01-15')
  })

  it('sobrescribe el mismo día sin duplicar filas', async () => {
    const d = '2026-03-03'
    await saveFollowUp({ period: '7', date: d, measurements: { weightKg: 80 } })
    await saveFollowUp({ period: '7', date: d, measurements: { weightKg: 79 } })
    const rows = await db.bodyMeasurements.toArray()
    expect(rows.length).toBe(1)
    expect(rows[0].weightKg).toBe(79)
  })

  it('conserva createdAt original al actualizar', async () => {
    const d = '2026-03-04'
    await saveFollowUp({ period: '7', date: d, measurements: { weightKg: 80 } })
    const first = await db.bodyMeasurements.get(`followup-${d}`)
    await saveFollowUp({ period: '7', date: d, measurements: { weightKg: 81 } })
    const second = await db.bodyMeasurements.get(`followup-${d}`)
    expect(second?.createdAt).toBe(first?.createdAt)
  })

  it('no guarda NaN', async () => {
    const res = await saveFollowUp({ period: '7', measurements: { weightKg: NaN } })
    expect(res.savedMeasurement).toBe(false)
  })

  it('ignora measurements demo', async () => {
    await db.bodyMeasurements.put({ id: 'x', localDate: '2026-01-01', weightKg: 99, isDemo: true, createdAt: new Date().toISOString() } as never)
    const list = await listFollowUps()
    expect(list.find(x => x.date === '2026-01-01')).toBeUndefined()
  })
})

describe('listFollowUps', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })

  it('ordena de más reciente a más antiguo', async () => {
    await db.bodyMeasurements.bulkPut([
      { id: 'a', localDate: '2026-01-01', weightKg: 80, createdAt: '' },
      { id: 'b', localDate: '2026-03-01', weightKg: 78, createdAt: '' },
    ] as never)
    const list = await listFollowUps()
    expect(list[0].date).toBe('2026-03-01')
    expect(list[1].date).toBe('2026-01-01')
  })

  it('respeta el límite', async () => {
    await db.bodyMeasurements.bulkPut(
      Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, localDate: `2026-01-${String(i + 1).padStart(2, '0')}`, weightKg: 80, createdAt: '' })),
    )
    expect((await listFollowUps(5)).length).toBe(5)
  })
})

describe('FollowUpForm (UI)', () => {
  beforeEach(async () => { await Promise.all(db.tables.map(t => t.clear())) })
  afterEach(() => { cleanup() })

  it('ofrece los 3 períodos', () => {
    render(<FollowUpForm />)
    expect(screen.getByTestId('followup-period-7')).toBeTruthy()
    expect(screen.getByTestId('followup-period-30')).toBeTruthy()
    expect(screen.getByTestId('followup-period-custom')).toBeTruthy()
    expect(screen.queryByTestId('followup-period-365')).toBeNull()
  })

  it('muestra el rango del período semanal', () => {
    render(<FollowUpForm />)
    expect(screen.getByTestId('followup-range').textContent).toContain(TODAY)
  })

  it('pide fechas solo en personalizado', () => {
    render(<FollowUpForm />)
    expect(screen.queryByTestId('followup-start')).toBeNull()
    fireEvent.click(screen.getByTestId('followup-period-custom'))
    expect(screen.getByTestId('followup-start')).toBeTruthy()
    expect(screen.getByTestId('followup-end')).toBeTruthy()
  })

  it('el rango refleja las fechas personalizadas', () => {
    render(<FollowUpForm />)
    fireEvent.click(screen.getByTestId('followup-period-custom'))
    fireEvent.change(screen.getByTestId('followup-start'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByTestId('followup-end'), { target: { value: '2026-01-31' } })
    expect(screen.getByTestId('followup-range').textContent).toBe('2026-01-01 → 2026-01-31')
  })

  it('guarda medidas y recuperación desde la UI', async () => {
    render(<FollowUpForm />)
    fireEvent.change(screen.getByTestId('followup-weightKg'), { target: { value: '81.5' } })
    fireEvent.change(screen.getByTestId('followup-sleepHours'), { target: { value: '7.5' } })
    fireEvent.click(screen.getByTestId('followup-save'))
    await waitFor(() => {
      expect(screen.getByTestId('followup-msg').textContent).toContain('guardado')
    }, { timeout: 5000 })
    const m = await db.bodyMeasurements.toArray()
    expect(m.find(x => x.weightKg === 81.5)).toBeTruthy()
    const r = await db.recoveryChecks.toArray()
    expect(r.find(x => x.sleepHours === 7.5)).toBeTruthy()
  })

  it('el botón está deshabilitado sin datos', () => {
    render(<FollowUpForm />)
    expect((screen.getByTestId('followup-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('el botón se habilita al cargar un dato', () => {
    render(<FollowUpForm />)
    fireEvent.change(screen.getByTestId('followup-waistCm'), { target: { value: '85' } })
    expect((screen.getByTestId('followup-save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('lista los seguimientos guardados', async () => {
    await saveFollowUp({ period: '7', date: '2026-02-02', measurements: { weightKg: 79 } })
    render(<FollowUpForm />)
    await waitFor(() => {
      expect(screen.getByTestId('followup-history').textContent).toContain('2026-02-02')
    }, { timeout: 5000 })
  })
})
