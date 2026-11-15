import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '@/services/storage/db'
import Inicio from './Inicio'
import Actividad from './Actividad'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

describe('Inicio — botón Actividad', () => {
  beforeEach(async () => {
    await db.activitySessions.clear().catch(() => {})
  })

  it('el botón Actividad aparece en Inicio', async () => {
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      const btn = screen.queryByTestId('inicio-activity-btn') ?? screen.queryByTestId('inicio-activity-btn-desktop')
      expect(btn).toBeInTheDocument()
    })
  })

  it('el botón se llama «Actividad libre», sin icono de mancuerna y con color teal', async () => {
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    let btn: HTMLElement | null = null
    await waitFor(() => {
      btn = screen.queryByTestId('inicio-activity-btn') ?? screen.queryByTestId('inicio-activity-btn-desktop')
      expect(btn).toBeInTheDocument()
    })
    expect(btn!.textContent).toContain('Actividad libre')
    expect(btn!.querySelector('svg')).toBeNull()
    expect(btn!.className).toMatch(/bg-teal-700/)
  })

  it('el botón navega a /actividad (sin modal embebido)', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/actividad" element={<h1>Página Actividad</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    let btn: HTMLElement | null = null
    await waitFor(() => {
      btn = screen.queryByTestId('inicio-activity-btn') ?? screen.queryByTestId('inicio-activity-btn-desktop')
      expect(btn).toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(btn!.getAttribute('href')).toBe('/actividad')
    fireEvent.click(btn!)
    await waitFor(() => {
      expect(screen.getByText('Página Actividad')).toBeInTheDocument()
    })
  })

  it('la página /actividad continúa funcionando', async () => {
    render(<MemoryRouter><Actividad /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.getByLabelText('Actividad')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Guardar sesión' })).toBeInTheDocument()
  })

  it('muestra las calorías activas registradas hoy (deporte)', async () => {
    const { todayKey } = await import('@/utils/dates')
    const { saveActivitySession } = await import('@/services/activity/activityService')
    await saveActivitySession({
      activityId: 'correr',
      calendarDate: todayKey(),
      startedAt: `${todayKey()}T08:00:00.000Z`,
      durationMinutes: 30,
      weightKg: 70,
      variantId: '6mph',
      sessionRpe: 3,
    })
    render(<MemoryRouter><Inicio /></MemoryRouter>)
    await waitFor(() => {
      const row = screen.getByTestId('inicio-activas-hoy')
      expect(row.textContent).toMatch(/kcal/)
      expect(row.textContent).not.toMatch(/sin datos/)
    })
  })
})
