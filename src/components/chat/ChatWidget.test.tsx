import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
      expect(screen.getByLabelText('Cerrar ventana del chat')).toBeTruthy()
      expect(document.documentElement.getAttribute('data-chat-open')).toBe('true')
    })
    const text = document.body.textContent || ''
    expect(text).not.toContain('VITE_GROQ_API_KEY')
    expect(text).not.toContain('.env.local')
    expect(text).not.toContain('import.meta')
  })

  it('cierra y oculta el chatbot cuando aparece una ventana emergente', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar ventana del chat')).toBeTruthy()
    })
    const overlay = document.createElement('div')
    overlay.className = 'althea-modal'
    document.body.appendChild(overlay)
    await waitFor(() => {
      expect(screen.queryByLabelText('Cerrar ventana del chat')).toBeNull()
      expect(screen.queryByLabelText('Abrir chat')).toBeNull()
    })
    overlay.remove()
    await waitFor(() => {
      expect(screen.getByLabelText('Abrir chat')).toBeTruthy()
    })
  })

  it('panel opaco y controles accesibles', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(screen.getByLabelText('Cerrar ventana del chat')).toBeTruthy()
    })
    expect(screen.getByLabelText('Borrar conversación')).toBeTruthy()
    expect(screen.getByLabelText('Enviar mensaje')).toBeTruthy()
    expect(screen.getByLabelText('Mensaje para el Coach')).toBeTruthy()
  })

  it('quita la marca global al cerrar el chat', async () => {
    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Abrir chat'))
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-chat-open')).toBe('true')
    })
    fireEvent.click(screen.getByLabelText('Cerrar ventana del chat'))
    await waitFor(() => {
      expect(document.documentElement.hasAttribute('data-chat-open')).toBe(false)
    })
  })
})
