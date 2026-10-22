import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import InstallAppButton from './InstallAppButton'
import { clearInstallPrompt, type InstallPromptEvent } from '@/services/pwa/installPrompt'

function fakePromptEvent(outcome: 'accepted' | 'dismissed'): InstallPromptEvent {
  const e = new Event('beforeinstallprompt') as InstallPromptEvent
  e.prompt = vi.fn().mockResolvedValue(undefined)
  e.userChoice = Promise.resolve({ outcome })
  return e
}

describe('InstallAppButton — instalación de la PWA', () => {
  beforeEach(() => {
    clearInstallPrompt()
  })

  afterEach(() => {
    // matchMedia sólo existe en el test de standalone (jsdom no lo trae).
    delete (window as { matchMedia?: unknown }).matchMedia
    clearInstallPrompt()
  })

  it('muestra el botón mientras la app no esté instalada', () => {
    render(<InstallAppButton />)
    expect(screen.getByRole('button', { name: 'Instalar aplicación' })).toBeInTheDocument()
  })

  it('el prompt nativo aceptado instala y oculta el botón', async () => {
    const evt = fakePromptEvent('accepted')
    window.dispatchEvent(evt)
    render(<InstallAppButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicación' }))
    await waitFor(() => expect(evt.prompt).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Instalar aplicación' })).not.toBeInTheDocument()
    })
  })

  it('prompt descartado: el botón sigue visible', async () => {
    const evt = fakePromptEvent('dismissed')
    window.dispatchEvent(evt)
    render(<InstallAppButton />)

    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicación' }))
    await waitFor(() => expect(evt.prompt).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Instalar aplicación' })).toBeInTheDocument()
  })

  it('sin prompt disponible abre las instrucciones y se puede cerrar', async () => {
    render(<InstallAppButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicación' }))

    const dialog = await screen.findByRole('dialog', { name: 'Cómo instalar la aplicación' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.textContent).toMatch(/menú|Compartir/i)

    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('evento appinstalled esconde el botón', async () => {
    render(<InstallAppButton />)
    expect(screen.getByRole('button', { name: 'Instalar aplicación' })).toBeInTheDocument()

    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Instalar aplicación' })).not.toBeInTheDocument()
    })
  })

  it('en modo standalone (app ya instalada) no renderiza nada', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const { container } = render(<InstallAppButton />)
    expect(container.innerHTML).toBe('')
  })
})
