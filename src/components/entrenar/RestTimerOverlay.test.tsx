import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import RestTimerOverlay from '@/components/entrenar/RestTimerOverlay'

describe('RestTimerOverlay — descanso bloqueante con Fin a doble toque', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.style.overflow = ''
  })

  it('muestra diálogo modal con label, contador y los tres controles', () => {
    render(<RestTimerOverlay seconds={45} label="Descanso entre series" onAdjust={vi.fn()} onFinish={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Descanso entre series' })).toBeInTheDocument()
    expect(screen.getByRole('timer').textContent).toContain('0:45')
    expect(screen.getByLabelText('Restar 15 segundos')).toBeInTheDocument()
    expect(screen.getByLabelText('Agregar 15 segundos')).toBeInTheDocument()
    expect(screen.getByLabelText('Terminar descanso')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('sin tiempo no renderiza nada', () => {
    const { container, unmount } = render(<RestTimerOverlay seconds={0} label="Descanso entre series" onAdjust={vi.fn()} onFinish={vi.fn()} />)
    expect(container.innerHTML).toBe('')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('−15 s y +15 s ajustan el tiempo', () => {
    const onAdjust = vi.fn()
    render(<RestTimerOverlay seconds={60} label="Descanso entre series" onAdjust={onAdjust} onFinish={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Restar 15 segundos'))
    fireEvent.click(screen.getByLabelText('Agregar 15 segundos'))
    expect(onAdjust).toHaveBeenCalledTimes(2)
    expect(onAdjust).toHaveBeenNthCalledWith(1, -15)
    expect(onAdjust).toHaveBeenNthCalledWith(2, 15)
  })

  it('Fin exige doble toque: el primero arma, el segundo termina una sola vez', () => {
    const onFinish = vi.fn()
    render(<RestTimerOverlay seconds={90} label="Descanso entre ejercicios" onAdjust={vi.fn()} onFinish={onFinish} />)
    const fin = screen.getByLabelText('Terminar descanso')

    fireEvent.click(fin)
    expect(onFinish).not.toHaveBeenCalled()
    expect(fin.textContent).toMatch(/Seguro/i)

    fireEvent.click(fin)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('el armado del Fin revierte a los 3 s', () => {
    vi.useFakeTimers()
    const onFinish = vi.fn()
    render(<RestTimerOverlay seconds={90} label="Descanso entre series" onAdjust={vi.fn()} onFinish={onFinish} />)
    const fin = screen.getByLabelText('Terminar descanso')

    fireEvent.click(fin)
    act(() => { vi.advanceTimersByTime(3100) })
    expect(fin.textContent?.trim()).toBe('Fin')

    fireEvent.click(fin)
    expect(onFinish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Terminar descanso'))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('cambiar de tipo de descanso desarma el Fin', () => {
    const { rerender } = render(<RestTimerOverlay seconds={90} label="Descanso entre series" onAdjust={vi.fn()} onFinish={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Terminar descanso'))
    expect(screen.getByLabelText('Terminar descanso').textContent).toMatch(/Seguro/i)

    rerender(<RestTimerOverlay seconds={90} label="Descanso entre ejercicios" onAdjust={vi.fn()} onFinish={vi.fn()} />)
    expect(screen.getByLabelText('Terminar descanso').textContent?.trim()).toBe('Fin')
  })
})
