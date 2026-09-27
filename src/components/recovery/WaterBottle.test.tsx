import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { WaterBottle } from '@/components/recovery/WaterBottle'
import { db } from '@/services/storage/db'
import { getBottleConfigs, saveBottleConfigs, completeBottle } from '@/services/recovery/hydrationBottles'
import { todayKey } from '@/utils/dates'

const today = todayKey()

describe('WaterBottle', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
  })
  afterEach(() => { cleanup() })

  it('muestra consumo y objetivo reales', async () => {
    render(<WaterBottle />)
    const readout = await screen.findByTestId('water-bottle-readout')
    await waitFor(() => {
      expect(readout.textContent).toMatch(/\d+/)
    })
    expect(screen.getByTestId('water-bottle-svg')).toBeTruthy()
  })

  it('expone el consumo, el objetivo y el porcentaje en el SVG', async () => {
    render(<WaterBottle />)
    const svg = await screen.findByTestId('water-bottle-svg')
    await waitFor(() => {
      expect(svg.getAttribute('data-goal-ml')).not.toBe('0')
    })
    expect(Number(svg.getAttribute('data-consumed-ml'))).toBe(0)
    expect(svg.getAttribute('data-pct')).toBe('0')
  })

  it('el relleno del agua crece al registrar una botella', async () => {
    const cfgs = await getBottleConfigs()
    const target = cfgs.find(c => c.active) ?? cfgs[0]
    await saveBottleConfigs(cfgs.map(c => (c.id === target.id ? { ...c, active: true } : c)))

    render(<WaterBottle />)
    const btn = await screen.findByTestId(`water-bottle-add-${target.id}`)
    fireEvent.click(btn)

    await waitFor(() => {
      const svg = screen.getByTestId('water-bottle-svg')
      expect(Number(svg.getAttribute('data-consumed-ml'))).toBe(target.capacityMl)
      // el relleno refleja el consumo: pct > 0
      expect(Number(svg.getAttribute('data-pct'))).toBeGreaterThan(0)
    })
  })

  it('confirma el objetivo alcanzado cuando el consumo supera la meta', async () => {
    await db.userProfile.put({ id: 'p1', weightKg: 50, activityLevel: 'poco_activo', createdAt: new Date().toISOString() } as never)
    const cfgs = await getBottleConfigs()
    const target = cfgs[0]
    await completeBottle(target.id, today)
    await completeBottle(target.id, today)
    await completeBottle(target.id, today)

    render(<WaterBottle />)
    expect(await screen.findByText(/objetivo alcanzado/i)).toBeTruthy()
  })

  it('el porcentaje de llenado es proporcional al consumo real', async () => {
    const cfgs = await getBottleConfigs()
    const b = cfgs[0]
    await db.hydrationBottleLogs.put({
      id: 'x1', localDate: today, bottleId: b.id, amountMl: b.capacityMl, time: new Date().toISOString(),
    })
    await db.hydrationBottles.bulkPut(cfgs.map(c => ({ id: c.id, name: c.name, capacityMl: c.capacityMl, active: true, order: c.order, updatedAt: new Date().toISOString() })))

    render(<WaterBottle />)
    const svg = await screen.findByTestId('water-bottle-svg')
    await waitFor(() => {
      const consumed = Number(svg.getAttribute('data-consumed-ml'))
      const goal = Number(svg.getAttribute('data-goal-ml'))
      const pct = Number(svg.getAttribute('data-pct'))
      expect(consumed).toBe(b.capacityMl)
      expect(goal).toBeGreaterThan(0)
      expect(pct).toBe(Math.min(100, Math.round((consumed / goal) * 100)))
    })
  })

  it('lista un botón por botella activa configurada', async () => {
    render(<WaterBottle />)
    await waitFor(() => {
      expect(screen.getByTestId('water-bottle-actions')).toBeTruthy()
    })
    const cfgs = (await getBottleConfigs()).filter(c => c.active)
    for (const c of cfgs) {
      expect(screen.getByTestId(`water-bottle-add-${c.id}`)).toBeTruthy()
    }
  })

  it('el registro escribe en la tabla real de botellas', async () => {
    const cfgs = await getBottleConfigs()
    const target = cfgs.find(c => c.active) ?? cfgs[0]
    render(<WaterBottle />)
    fireEvent.click(await screen.findByTestId(`water-bottle-add-${target.id}`))
    await waitFor(async () => {
      const rows = await db.hydrationBottleLogs.where('localDate').equals(today).toArray()
      expect(rows.length).toBe(1)
    })
  })

  it('no renderiza acciones si allowQuickAdd es false', async () => {
    render(<WaterBottle allowQuickAdd={false} />)
    await screen.findByTestId('water-bottle-svg')
    expect(screen.queryByTestId('water-bottle-actions')).toBeNull()
  })

  it('funciona en modo compacto', async () => {
    render(<WaterBottle compact />)
    expect(await screen.findByTestId('water-bottle')).toBeTruthy()
    expect(screen.getByTestId('water-bottle-readout')).toBeTruthy()
  })

  it('es una sola botella, no una lista', async () => {
    const { container } = render(<WaterBottle />)
    await screen.findByTestId('water-bottle-svg')
    expect(container.querySelectorAll('svg[data-testid="water-bottle-svg"]').length).toBe(1)
  })

  it('el objetivo de hidratación se calcula con datos reales del perfil', async () => {
    await db.userProfile.put({ id: 'p1', weightKg: 80, activityLevel: 'moderado', createdAt: new Date().toISOString() } as never)
    render(<WaterBottle />)
    const svg = await screen.findByTestId('water-bottle-svg')
    await waitFor(() => {
      const goal = Number(svg.getAttribute('data-goal-ml'))
      // 80kg * 35 + 150 (moderado) = 2950 -> redondeo a 3000
      expect(goal).toBe(3000)
    })
  })
})
