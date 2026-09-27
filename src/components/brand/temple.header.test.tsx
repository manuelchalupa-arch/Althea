import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { AppHeader } from './temple'

// FASE 2 - S8 - plan U1 (temple.tsx decorativo), criterio de aceptacion:
// "sin falsa funcionalidad". El header ofrecia tres cosas que no hacian nada:
//   1. un <form role="search"> con un input sin name/value/onChange y sin onSubmit
//      (visible solo en /biblioteca y /rutina, que ya traen su propio buscador);
//   2. un <button aria-label="Notificaciones"> sin onClick;
//   3. un badge "Coach activo" con un punto `animate-pulse` que sugeria
//      actividad en vivo, aunque no existe ningun estado coachEnabled que
//      Anime al usuario.
const renderAt = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><AppHeader /></MemoryRouter>)

describe('S8 - AppHeader: sin falsa funcionalidad', () => {
  it('no expone un boton de notificaciones sin accion', () => {
    renderAt('/')
    expect(screen.queryByLabelText('Notificaciones')).not.toBeInTheDocument()
  })

  it('no expone ningun control con role=search', () => {
    renderAt('/')
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar en Althea')).not.toBeInTheDocument()
  })

  it('tampoco en /biblioteca ni en /rutina (las dos rutas donde aparecia)', () => {
    for (const path of ['/biblioteca', '/rutina']) {
      const { unmount } = renderAt(path)
      expect(screen.queryByLabelText('Buscar en Althea')).not.toBeInTheDocument()
      expect(screen.queryByRole('search')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('el badge "Coach activo" no simula actividad en vivo', () => {
    const { container } = renderAt('/')
    expect(screen.getByText('Coach activo')).toBeInTheDocument()
    // el punto de estado es decorativo y estatico
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('el punto de estado del badge es aria-hidden (no texto leido en voz alta)', () => {
    const { container } = renderAt('/')
    const dot = container.querySelector('.bg-primary.rounded-full') as HTMLElement
    expect(dot.getAttribute('aria-hidden')).toBe('true')
  })

  it('el header sigue funcionando: identidad, seccion y toggle de tema', () => {
    renderAt('/entrenar')
    expect(screen.getByText('ALTHEA')).toBeInTheDocument()
    expect(screen.getByText('Entrenamiento')).toBeInTheDocument()
    expect(screen.getByLabelText(/modo (claro|oscuro)/)).toBeInTheDocument()
  })
})
