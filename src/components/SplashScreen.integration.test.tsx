import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_SPLASH_BREAKPOINT, SplashScreen, isMobileSplashConsumedThisDocument } from './SplashScreen'

const SPLASH_FLAG = '__ALTHEA_SPLASH_SHOWN_THIS_DOCUMENT__'

function clearSplashFlag() {
  delete (window as unknown as Record<string, unknown>)[SPLASH_FLAG]
}

// Réplica del patrón de integración de App.tsx: la app real (con su ruta
// "/" = Inicio) siempre está montada debajo y el splash es un overlay
// transitorio que al completarse se desmonta y deja ver el contenido.
// El inicializador también replica al de App: un remontaje en el mismo
// documento no vuelve a armar el splash si la carga ya lo consumió.
function Harness({ onDone }: { onDone: () => void }) {
  const [splashVisible, setSplashVisible] = useState(() => {
    if (window.innerWidth >= MOBILE_SPLASH_BREAKPOINT) {
      return false
    }
    return !isMobileSplashConsumedThisDocument()
  })
  return (
    <>
      <div data-testid="inicio-screen">Inicio</div>
      {splashVisible && (
        <SplashScreen
          onComplete={() => {
            setSplashVisible(false)
            onDone()
          }}
        />
      )}
    </>
  )
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

describe('SplashScreen — integración con la pantalla Inicio', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearSplashFlag()
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined) as unknown as typeof HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.load = vi.fn() as unknown as typeof HTMLMediaElement.prototype.load
    HTMLMediaElement.prototype.pause = vi.fn() as unknown as typeof HTMLMediaElement.prototype.pause
  })

  afterEach(() => {
    clearSplashFlag()
    setViewportWidth(1024)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('en móvil, el fin del video oculta el splash y deja visible Inicio (una sola llamada)', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    const playMock = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>
    render(<Harness onDone={onDone} />)

    expect(screen.getByTestId('mobile-splash')).toBeInTheDocument()
    const video = screen.getByTestId('mobile-splash-video')

    // Secuencia real del navegador: canplay → play() → ended.
    act(() => {
      fireEvent.canPlay(video)
    })
    expect(playMock).toHaveBeenCalledTimes(1)
    act(() => {
      fireEvent.ended(video)
    })

    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)

    // Persistencia: pasado el intervalo, no hay segunda aparición.
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-splash-video')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('el fallback de error también conduce a Inicio', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    render(<Harness onDone={onDone} />)

    const video = screen.getByTestId('mobile-splash-video')
    act(() => {
      fireEvent.error(video)
    })

    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('el fallback de timeout también conduce a Inicio', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    render(<Harness onDone={onDone} />)

    expect(screen.getByTestId('mobile-splash')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(16000)
    })

    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('remontar el árbol en el mismo documento no consume una segunda reproducción', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    const playMock = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>
    const first = render(<Harness onDone={onDone} />)

    expect(screen.getByTestId('mobile-splash')).toBeInTheDocument()
    const video = screen.getByTestId('mobile-splash-video')
    act(() => {
      fireEvent.ended(video)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    first.unmount()

    // Nuevo montaje de App en la MISMA página: la marca del documento manda.
    playMock.mockClear()
    render(<Harness onDone={onDone} />)

    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-splash-video')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(playMock).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('StrictMode no duplica ni cancela la primera reproducción', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    const playMock = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>
    render(
      <StrictMode>
        <Harness onDone={onDone} />
      </StrictMode>
    )

    // Un único overlay aunque los efectos corran dos veces.
    expect(screen.getAllByTestId('mobile-splash')).toHaveLength(1)
    const video = screen.getByTestId('mobile-splash-video')
    act(() => {
      fireEvent.canPlay(video)
    })
    act(() => {
      fireEvent.canPlay(video)
    })
    expect(playMock).toHaveBeenCalledTimes(1)

    act(() => {
      fireEvent.ended(video)
    })
    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('móvil → escritorio → móvil no reactiva el splash', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    render(<Harness onDone={onDone} />)

    const video = screen.getByTestId('mobile-splash-video')
    act(() => {
      fireEvent.ended(video)
    })
    expect(onDone).toHaveBeenCalledTimes(1)

    act(() => {
      setViewportWidth(1280)
    })
    act(() => {
      setViewportWidth(390)
    })

    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-splash-video')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('el desmontaje normal no ejecuta una navegación involuntaria', () => {
    setViewportWidth(390)
    const onDone = vi.fn()
    const { unmount } = render(<Harness onDone={onDone} />)

    expect(screen.getByTestId('mobile-splash')).toBeInTheDocument()
    unmount()
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('en escritorio el splash no aparece y el comportamiento original se conserva', () => {
    setViewportWidth(1280)
    const onDone = vi.fn()
    const playMock = HTMLMediaElement.prototype.play as unknown as ReturnType<typeof vi.fn>
    render(<Harness onDone={onDone} />)

    expect(screen.queryByTestId('mobile-splash')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-splash-video')).not.toBeInTheDocument()
    expect(screen.getByTestId('inicio-screen')).toBeInTheDocument()
    expect(playMock).not.toHaveBeenCalled()
  })
})
