import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FeedbackFab from './FeedbackFab'

describe('FeedbackFab — visible solo en Inicio', () => {
  it('muestra Feedback en Inicio', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <FeedbackFab />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'Abrir Feedback' })).toBeTruthy()
  })

  it('no muestra Feedback en otras secciones', () => {
    render(
      <MemoryRouter initialEntries={['/entrenar']}>
        <FeedbackFab />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link', { name: 'Abrir Feedback' })).toBeNull()
  })
})
