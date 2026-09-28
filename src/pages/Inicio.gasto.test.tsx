import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey, weekStartKey, dayKeyOffset } from '@/utils/dates'
import { estimateStrengthSession } from '@/services/training/exerciseEnergy'
import Inicio from './Inicio'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

/** Hora local fija: la duración depende de los timestamps, no de la zona horaria. */
function localIso(dateKey: string, h: number, m = 0): string {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m, 0, 0).toISOString()
}

async function putWeight(weightKg: number, localDate: string): Promise<void> {
  await db.bodyMeasurements.put({ id: `m-${localDate}`, localDate, weightKg, createdAt: `${localDate}T08:00:00.000Z` } as never)
}

async function putSession(o: {
  sessionId: string; date: string
  start: [number, number]; end: [number, number]
  status?: string; isDemo?: boolean
}): Promise<void> {
  const startedAt = localIso(o.date, o.start[0], o.start[1])
  const completedAt = localIso(o.date, o.end[0], o.end[1])
  await db.trainingSessions.put({
    id: o.sessionId, sessionId: o.sessionId, userId: 'me', routineId: 'r1',
    calendarDate: o.date, sessionStatus: o.status ?? 'COMPLETED',
    startedAt, completedAt, createdAt: startedAt, updatedAt: completedAt,
    ...(o.isDemo ? { isDemo: true } : {}),
  } as never)
}

async function renderInicio(): Promise<void> {
  render(<MemoryRouter><Inicio /></MemoryRouter>)
  await waitFor(() => {
    expect(screen.getByTestId('inicio-gasto-calorico')).toBeInTheDocument()
  }, { timeout: 10000 })
  await waitFor(() => {
    expect(screen.getByTestId('inicio-gasto-hoy')).toBeInTheDocument()
  }, { timeout: 10000 })
}

describe('Inicio — gasto calórico del ejercicio (fecha y semana)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('acumula el gasto de hoy y de la semana con sesiones y peso reales', async () => {
    const hoy = todayKey()
    const lunes = weekStartKey(hoy)
    await putWeight(75, dayKeyOffset(hoy, -30))
    const insertadas = [
      { date: hoy, minutos: 45 },
      { date: lunes, minutos: 60 },
    ]
    await putSession({ sessionId: 'ses-hoy', date: hoy, start: [10, 0], end: [10, 45] }) // 45 min
    await putSession({ sessionId: 'ses-semana', date: lunes, start: [9, 0], end: [10, 0] }) // 60 min

    await renderInicio()

    // Misma calculadora oficial que usan historial e informes (sin duplicar fórmula)
    const kcal = (min: number) => estimateStrengthSession({ weightKg: 75, durationMinutes: min }).grossKcal
    const esperadoHoy = insertadas.filter(s => s.date === hoy).reduce((a, s) => a + kcal(s.minutos), 0)
    const esperadoSemana = insertadas
      .filter(s => s.date >= lunes && s.date <= hoy)
      .reduce((a, s) => a + kcal(s.minutos), 0)
    const minutosHoy = insertadas.filter(s => s.date === hoy).reduce((a, s) => a + s.minutos, 0)
    const minutosSemana = insertadas.filter(s => s.date >= lunes && s.date <= hoy).reduce((a, s) => a + s.minutos, 0)

    expect(screen.getByTestId('inicio-gasto-hoy-kcal').textContent).toContain(String(Math.round(esperadoHoy)))
    expect(screen.getByTestId('inicio-gasto-hoy-min').textContent).toContain(`${minutosHoy} min`)
    expect(screen.getByTestId('inicio-gasto-semana-kcal').textContent).toContain(String(Math.round(esperadoSemana)))
    expect(screen.getByTestId('inicio-gasto-semana-min').textContent).toContain(`${minutosSemana} min`)
    expect(screen.queryByTestId('inicio-gasto-hoy-sin-datos')).toBeNull()
  }, 40000)

  it('sin peso registrado no inventa calorías (estado honesto)', async () => {
    const hoy = todayKey()
    await putSession({ sessionId: 'ses-sin-peso', date: hoy, start: [10, 0], end: [11, 0] })

    await renderInicio()

    expect(await screen.findByTestId('inicio-gasto-hoy-sin-datos')).toBeInTheDocument()
    expect(screen.getByTestId('inicio-gasto-hoy-sin-datos').textContent).toContain('Sin datos suficientes para estimar')
    expect(screen.getByTestId('inicio-gasto-semana-sin-datos')).toBeInTheDocument()
    expect(screen.queryByTestId('inicio-gasto-hoy-kcal')).toBeNull()
  }, 40000)

  it('sesiones demo o canceladas no aportan gasto', async () => {
    const hoy = todayKey()
    await putWeight(75, dayKeyOffset(hoy, -30))
    await putSession({ sessionId: 'ses-demo', date: hoy, start: [8, 0], end: [10, 0], isDemo: true })
    await putSession({ sessionId: 'ses-cancelada', date: hoy, start: [12, 0], end: [14, 0], status: 'CANCELLED' })

    await renderInicio()

    expect(screen.getByTestId('inicio-gasto-hoy-kcal').textContent).toContain('0')
    expect(screen.getByTestId('inicio-gasto-hoy-min').textContent).toContain('Sin sesiones registradas')
    expect(screen.getByTestId('inicio-gasto-semana-kcal').textContent).toContain('0')
    expect(screen.queryByTestId('inicio-gasto-hoy-sin-datos')).toBeNull()
  }, 40000)

  it('sin registros de entrenamiento muestra 0 del día (no una cifra estimada)', async () => {
    await renderInicio()

    expect(screen.getByTestId('inicio-gasto-hoy-kcal').textContent).toContain('0')
    expect(screen.getByTestId('inicio-gasto-hoy-min').textContent).toContain('Sin sesiones registradas')
    expect(screen.queryByTestId('inicio-gasto-hoy-sin-datos')).toBeNull()
  }, 40000)
})
