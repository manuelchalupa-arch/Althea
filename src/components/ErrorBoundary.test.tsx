import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ErrorBoundary, EntrenarErrorBoundary } from './ErrorBoundary'

function Boom({ message = 'boom render' }: { message?: string }): never {
  throw new Error(message)
}

describe('ErrorBoundary (montado en App.tsx)', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  beforeEach(() => { spy.mockClear() })
  afterEach(() => { spy.mockClear() })

  it('un error de render muestra el fallback y nunca pantalla en blanco', () => {
    render(
      <ErrorBoundary componentName="App">
        <Boom message="fallo de render" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument()
    expect(screen.getByText(/fallo de render/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recargar aplicación/i })).toBeInTheDocument()
  })

  it('"Intentar continuar" limpia el error y vuelve a renderizar', () => {
    let shouldThrow = true
    function Flaky() {
      if (shouldThrow) { throw new Error('transitorio') }
      return <p>contenido sano</p>
    }
    render(
      <ErrorBoundary componentName="App">
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument()
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /Intentar continuar/i }))
    expect(screen.getByText('contenido sano')).toBeInTheDocument()
    expect(screen.queryByText('Algo salió mal')).not.toBeInTheDocument()
  })

  it('boundary de Entrenar usa su propio mensaje (sesión a salvo)', () => {
    render(
      <EntrenarErrorBoundary componentName="Entrenar">
        <Boom />
      </EntrenarErrorBoundary>,
    )
    expect(screen.getByText('Error en Entrenamiento')).toBeInTheDocument()
    expect(screen.getByText(/Tu sesión está guardada/)).toBeInTheDocument()
  })
})
