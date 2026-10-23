import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import GymPaymentCard, { addOneMonthKey, gymExpiry } from './GymPaymentCard'

const STORAGE_KEY = 'althea:gymPaymentDate'

describe('Gimnasio — calendario real', () => {
  it('sumar un mes usa el calendario real (3 abr → 3 may)', () => {
    expect(addOneMonthKey('2026-04-03')).toBe('2026-05-03')
    expect(addOneMonthKey('2026-01-31')).toBe('2026-02-28')
    expect(addOneMonthKey('2028-01-31')).toBe('2028-02-29')
    expect(addOneMonthKey('2026-12-15')).toBe('2027-01-15')
  })

  it('estados ok / pronto / vencido según días restantes', () => {
    expect(gymExpiry('2026-05-03', '2026-05-20')).toMatchObject({ due: '2026-06-03', status: 'ok' })
    expect(gymExpiry('2026-05-03', '2026-05-29')).toMatchObject({ daysLeft: 5, status: 'soon' })
    expect(gymExpiry('2026-05-03', '2026-06-03')).toMatchObject({ daysLeft: 0, status: 'soon' })
    expect(gymExpiry('2026-05-03', '2026-06-04')).toMatchObject({ daysLeft: -1, status: 'expired' })
  })
})

describe('Gimnasio — tarjeta en Inicio', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ now: new Date(2026, 4, 29, 12), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sin fecha de pago muestra el input para cargarla', () => {
    render(<GymPaymentCard />)
    expect(screen.getByTestId('gym-card').getAttribute('data-status')).toBe('none')
    expect(screen.getByTestId('gym-card-input')).toBeInTheDocument()
  })

  it('con pago registrado muestra el vencimiento y avisa a 5 días', () => {
    localStorage.setItem(STORAGE_KEY, '2026-05-03')
    render(<GymPaymentCard />)
    expect(screen.getByTestId('gym-card').getAttribute('data-status')).toBe('soon')
    expect(screen.getByTestId('gym-card-due').textContent).toContain('Pagado 3 may')
    expect(screen.getByTestId('gym-card-due').textContent).toContain('en 5 días')
  })

  it('cambia a estado vencido cuando pasó el vencimiento', () => {
    localStorage.setItem(STORAGE_KEY, '2026-05-03')
    vi.setSystemTime(new Date(2026, 5, 4, 12))
    render(<GymPaymentCard />)
    expect(screen.getByTestId('gym-card').getAttribute('data-status')).toBe('expired')
    expect(screen.getByTestId('gym-card-due').textContent).toContain('renová la cuota')
  })
})
