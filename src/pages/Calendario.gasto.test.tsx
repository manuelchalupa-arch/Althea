import { describe, it, expect, beforeEach, vi } from 'vitest'
import { todayKey, dayKeyOffset } from '@/utils/dates'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { estimateStrengthSession } from '@/services/training/exerciseEnergy'
import Calendario from './Calendario'

const today = todayKey()

async function openToday(): Promise<void> {
  render(<MemoryRouter><Calendario /></MemoryRouter>)
  await waitFor(() => {
    expect(screen.getByText('Calendario y recuperación')).toBeInTheDocument()
  })
  let todayBtn = screen.queryByRole('button', { name: today }) as HTMLButtonElement | null
  if (!todayBtn) {
    const btns = screen.getAllByRole('button')
    todayBtn = (btns.find(b => b.getAttribute('data-date') === today) as HTMLButtonElement) || null
  }
  expect(todayBtn).toBeTruthy()
  fireEvent.click(todayBtn!)
  await waitFor(() => {
    expect(screen.getByText(/Gasto calórico del ejercicio:/)).toBeInTheDocument()
  }, { timeout: 8000 })
}

describe('Calendario (historial) — gasto calórico con el motor central', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('muestra el gasto de la sesión y el total del día (igual que Inicio)', async () => {
    await db.bodyMeasurements.put({
      id: 'm1', localDate: dayKeyOffset(today, -10), weightKg: 75,
      createdAt: `${dayKeyOffset(today, -10)}T08:00:00Z`,
    } as never)
    await db.trainingSessions.put({
      id: 'ts1', sessionId: 'ts1', userId: 'me', routineId: 'r1', routineName: 'Fuerza',
      plannedDay: 1, actualDay: 1, calendarDate: today,
      sessionStatus: 'COMPLETED',
      startedAt: `${today}T10:00:00.000Z`, completedAt: `${today}T10:45:00.000Z`,
      createdAt: `${today}T10:00:00.000Z`, updatedAt: `${today}T10:45:00.000Z`,
    } as never)

    await openToday()

    const esperado = estimateStrengthSession({ weightKg: 75, durationMinutes: 45 }).grossKcal
    const total = await screen.findByTestId('dia-gasto-total')
    expect(total.textContent).toContain(String(Math.round(esperado)))
    const deSesion = screen.getByTestId('sesion-gasto')
    expect(deSesion.textContent).toContain(String(Math.round(esperado)))
    expect(deSesion.textContent).toContain('45 min')
    expect(screen.queryByTestId('dia-gasto-sin-datos')).toBeNull()
  }, 40000)

  it('sin duración medida el historial dice «Sin datos suficientes», no un número', async () => {
    await db.bodyMeasurements.put({
      id: 'm1', localDate: dayKeyOffset(today, -10), weightKg: 75,
      createdAt: `${dayKeyOffset(today, -10)}T08:00:00Z`,
    } as never)
    await db.trainingSessions.put({
      id: 'ts2', sessionId: 'ts2', userId: 'me', routineId: 'r1', routineName: 'Fuerza',
      plannedDay: 1, actualDay: 1, calendarDate: today,
      sessionStatus: 'COMPLETED',
      createdAt: `${today}T10:00:00.000Z`, updatedAt: `${today}T11:00:00.000Z`,
    } as never)

    await openToday()

    expect(await screen.findByTestId('dia-gasto-sin-datos')).toBeInTheDocument()
    expect(screen.getByTestId('dia-gasto-sin-datos').textContent).toContain('Sin datos suficientes para estimar')
    expect(screen.getByTestId('sesion-gasto-sin-datos')).toBeInTheDocument()
    expect(screen.queryByTestId('dia-gasto-total')).toBeNull()
  }, 40000)

  it('día sin sesiones reales lo dice explícitamente (0 kcal, sin estimar)', async () => {
    await openToday()

    expect(await screen.findByTestId('dia-gasto-vacio')).toBeInTheDocument()
    expect(screen.getByTestId('dia-gasto-vacio').textContent).toContain('Sin sesiones registradas')
    expect(screen.queryByTestId('dia-gasto-total')).toBeNull()
    expect(screen.queryByTestId('dia-gasto-sin-datos')).toBeNull()
  }, 40000)
})
