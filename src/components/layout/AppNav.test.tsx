import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { createReadySession, transitionSession } from '@/services/training/sessionStore'
import AppNav from './AppNav'

const EXERCISES = [{ exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }]

describe('AppNav — móvil: 4 destinos fijos (Inicio, Entrenar, CrossFit, Más)', () => {
  beforeEach(async () => {
    try { await db.delete() } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  it('Entrenar siempre visible (sin sesión) + módulos en la barra lateral', async () => {
    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getAllByLabelText('Inicio').length).toBeGreaterThan(0)
    }, { timeout: 8000 })
    // Nuevo contrato: Entrenar es destino principal SIEMPRE (se salta el
    // requisito de sesión activa); /entrenar redirige a Inicio si no hay sesión.
    await waitFor(() => {
      expect(screen.getAllByLabelText('Entrenar').length).toBeGreaterThan(0)
    }, { timeout: 8000 })
    // Móvil: exactamente 4 destinos (Inicio, Entrenar, CrossFit, Más).
    const mobileBar = document.querySelector('nav[aria-label="Navegación principal"].md\\:hidden')
      ?? document.querySelector('nav.md\\:hidden')
    expect(mobileBar).not.toBeNull()
    const labels = Array.from(mobileBar!.querySelectorAll('a')).map(a => a.getAttribute('aria-label'))
    expect(labels).toEqual(['Inicio', 'Entrenar', 'CrossFit', 'Más'])
    // Desktop conserva estructura amplia (módulos en la barra lateral).
    expect(screen.getAllByLabelText('Nutrición').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Progreso').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Más').length).toBeGreaterThan(0)
  })

  it('con sesión activa SÍ aparece Entrenar en la navegación', async () => {
    const { sessionId } = await createReadySession({
      calendarDate: todayKey(), routineId: 'r1', routineName: 'Rutina',
      plannedDay: 1, plannedDayName: 'Pecho', actualDay: 1, actualDayName: 'Pecho',
      exercises: EXERCISES,
    })
    await transitionSession(sessionId, 'IN_PROGRESS')

    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.queryAllByLabelText('Entrenar').length).toBeGreaterThan(0)
    }, { timeout: 8000 })
  })
})
