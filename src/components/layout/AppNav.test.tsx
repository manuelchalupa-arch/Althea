import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { todayKey } from '@/utils/dates'
import { createReadySession, transitionSession } from '@/services/training/sessionStore'
import AppNav from './AppNav'

const EXERCISES = [{ exId: 'press', name: 'Press', sets: 1, reps: 8, weight: 80 }]

describe('AppNav — móvil: cinco destinos permanentes', () => {
  beforeEach(async () => {
    try { await db.delete() } catch {}
    try { await db.open() } catch {}
    localStorage.clear()
  })

  it('sin sesión mantiene los cinco destinos permanentes', async () => {
    render(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(screen.getAllByLabelText('Inicio').length).toBeGreaterThan(0)
    }, { timeout: 8000 })
    // La barra móvil conserva los cinco destinos, incluso sin sesión activa.
    const mobileBar = document.querySelector('.app-mobile-nav')
    expect(mobileBar).not.toBeNull()
    const labels = Array.from(mobileBar!.querySelectorAll('.althea-nav--bar a')).map(a => a.getAttribute('aria-label'))
    expect(labels).toEqual(['Inicio', 'Entrenar', 'Nutrición', 'CrossFit', 'Más'])
    // Un único nav semántico evita dos barras fijas superpuestas.
    expect(mobileBar!.querySelectorAll('nav')).toHaveLength(1)
    // Escritorio usa el mismo grupo principal y orden; Progreso queda en módulos.
    const desktopNav = document.querySelector('aside[aria-label="Menú lateral"] nav[aria-label="Navegación principal"]')
    expect(Array.from(desktopNav!.querySelectorAll('.althea-nav-item__label')).map(el => el.textContent)).toEqual([
      'Inicio', 'Entrenar', 'Nutrición', 'CrossFit', 'Más',
    ])
    expect(screen.getAllByLabelText('Progreso').length).toBeGreaterThan(0)
  })

  it('con sesión activa conserva Entrenar sin duplicar destinos', async () => {
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
