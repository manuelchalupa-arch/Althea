import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import ChatWidget from './ChatWidget'

describe('Chat — contraste y sin tecnicismos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('abierto sin IA: mensaje humano breve, sin variables técnicas', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar')).toBeInTheDocument()
    })
    const text = document.body.textContent || ''
    expect(text).not.toContain('VITE_GROQ_API_KEY')
    expect(text).not.toContain('.env.local')
    expect(text).not.toContain('import.meta')
  })

  it('panel opaco y controles accesibles', async () => {
    const { fireEvent } = await import('@testing-library/react')
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar chat')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Borrar historial')).toBeInTheDocument()
    expect(screen.getByLabelText('Enviar mensaje')).toBeInTheDocument()
    expect(screen.getByLabelText('Mensaje para el Coach')).toBeInTheDocument()
  })
})
