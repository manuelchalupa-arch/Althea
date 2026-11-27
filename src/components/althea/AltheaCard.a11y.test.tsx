import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AltheaCard } from './AltheaCard'

describe('AltheaCard accessibility', () => {
  it('exposes clickable cards as keyboard-operable buttons', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<AltheaCard onClick={onClick}>Abrir rutina</AltheaCard>)

    const card = screen.getByRole('button', { name: 'Abrir rutina' })
    expect(card.getAttribute('tabindex')).toBe('0')

    card.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('keeps non-interactive cards out of the tab order', () => {
    const { container } = render(<AltheaCard>Resumen</AltheaCard>)
    const card = container.firstElementChild
    expect(card?.getAttribute('role')).toBeNull()
    expect(card?.getAttribute('tabindex')).toBeNull()
  })
})
