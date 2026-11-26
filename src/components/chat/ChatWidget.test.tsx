import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import ChatWidget from './ChatWidget'

describe('Chat — panel responsive y exclusión de FABs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('data-chat-open')
  })

  it('abierto sin IA: mensaje humano breve, sin variables técnicas', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar ventana del chat')).toBeInTheDocument()
      expect(document.documentElement).toHaveAttribute('data-chat-open', 'true')
    })
    const text = document.body.textContent || ''
    expect(text).not.toContain('VITE_GROQ_API_KEY')
    expect(text).not.toContain('.env.local')
    expect(text).not.toContain('import.meta')
  })

  it('panel opaco y controles accesibles', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar ventana del chat')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Borrar conversación')).toBeInTheDocument()
    expect(screen.getByLabelText('Enviar mensaje')).toBeInTheDocument()
    expect(screen.getByLabelText('Mensaje para el Coach')).toBeInTheDocument()
  })

  it('quita la marca global al cerrar el chat', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-chat-open', 'true')
    })
    fireEvent.click(screen.getByLabelText('Cerrar ventana del chat'))
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute('data-chat-open')
    })
  })
})
