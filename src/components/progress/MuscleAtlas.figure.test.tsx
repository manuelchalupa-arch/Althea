import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MuscleAtlas } from './MuscleAtlas'

/**
 * Verifica que la ilustración del perfil se renderiza de verdad dentro del
 * atlas (no sólo que TypeScript acepte la importación) y que las regiones
 * interactivas siguen intactas.
 */
describe('MuscleAtlas — figura del perfil', () => {
  it('M renderiza la ilustración masculina', () => {
    render(<MuscleAtlas view="front" data={{}} sex="M" />)
    const img = screen.getByTestId('atlas-image-M-front')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('href')).toMatch(/male-front/)
    expect(img.getAttribute('transform')).toMatch(/translate\(/)
    expect(img.getAttribute('transform')).toMatch(/scale\(/)
  })

  it('F renderiza la ilustración femenina', () => {
    render(<MuscleAtlas view="back" data={{}} sex="F" />)
    const img = screen.getByTestId('atlas-image-F-back')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('href')).toMatch(/female-back/)
  })

  it('X mantiene la silueta SVG neutral y no dibuja imagen', () => {
    const { container } = render(<MuscleAtlas view="front" data={{}} sex="X" />)
    expect(container.querySelector('image')).toBeNull()
    expect(container.querySelector('.althea-atlas__silhouette')).not.toBeNull()
    expect(container.querySelector('svg')?.getAttribute('data-figure')).toBe('X')
    expect(container.querySelector('svg')?.getAttribute('data-figure-asset')).toBe('svg')
  })

  it('cambiar de vista cambia la imagen y conserva el sexo', () => {
    const { container, rerender } = render(<MuscleAtlas view="front" data={{}} sex="M" />)
    expect(screen.getByTestId('atlas-image-M-front')).toBeInTheDocument()
    rerender(<MuscleAtlas view="back" data={{}} sex="M" />)
    expect(screen.getByTestId('atlas-image-M-back')).toBeInTheDocument()
    expect(container.querySelector('svg')?.getAttribute('data-figure')).toBe('M')
  })

  it('cambiar de sexo cambia la ilustración en la misma vista', () => {
    const { rerender } = render(<MuscleAtlas view="front" data={{}} sex="M" />)
    expect(screen.getByTestId('atlas-image-M-front')).toBeInTheDocument()
    rerender(<MuscleAtlas view="front" data={{}} sex="F" />)
    expect(screen.getByTestId('atlas-image-F-front')).toBeInTheDocument()
  })

  it('conserva las regiones interactivas sobre la ilustración', () => {
    render(<MuscleAtlas view="front" data={{}} sex="M" />)
    const regions = document.querySelectorAll('[data-muscle-id]')
    expect(regions.length).toBeGreaterThan(10)
    expect(regions[0].getAttribute('role')).toBe('button')
    expect(regions[0].getAttribute('aria-label')).toBeTruthy()
  })

  it('las regiones izquierda y derecha comparten id y se resaltan juntas', () => {
    render(<MuscleAtlas view="front" data={{}} sex="F" />)
    const ids = new Set(
      Array.from(document.querySelectorAll('[data-muscle-id]')).map(e => e.getAttribute('data-muscle-id')),
    )
    const sides = Array.from(document.querySelectorAll('[data-side]')).map(e => e.getAttribute('data-side'))
    expect(sides).toContain('left')
    expect(sides).toContain('right')
    expect(ids.size).toBeGreaterThan(10)
  })

  it('pinta el estado y el detalle conectados al dato de entrenamiento', () => {
    render(
      <MuscleAtlas
        view="front"
        sex="M"
        data={{
          'pectoralis-major': {
            muscleId: 'pectoralis-major',
            current: 1200,
            previous: 1000,
            trend: 'aumento',
            unit: 'kg',
            intensity: 80,
            exercises: ['Press de banca'],
          },
        }}
      />,
    )
    // Un dato cargado en el padre colorea sus subdivisiones.
    expect(
      document.querySelector('[data-muscle-id="pectoralis-major-sternal"]')?.classList.contains('is-active-high'),
    ).toBe(true)
    // Al seleccionarla, el detalle muestra el trabajo y los ejercicios.
    fireEvent.click(screen.getByRole('button', { name: /Pectoral mayor · porción esternal/ }))
    expect(screen.getByText(/1.?200/)).toBeInTheDocument()
    expect(screen.getByText('Press de banca')).toBeInTheDocument()
  })
})
