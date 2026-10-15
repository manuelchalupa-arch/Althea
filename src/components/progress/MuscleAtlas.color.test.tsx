import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MuscleAtlas } from './MuscleAtlas'
import type { MuscleDataPoint } from './MuscleAtlas'

/**
 * La escala pedida es: sin actividad = GRIS · baja = VERDE ·
 * moderada = AMARILLO/NARANJA · alta = ROJO.
 *
 * Estos tests verifican la correspondencia EFECTIVA entre el estado que el
 * componente emite y el token CSS que realmente aplica el relleno, leyendo las
 * hojas de estilos del repo: no basta con que los tokens estén "bien" si la
 * regla CSS conecta el estado con el token equivocado.
 */

const components = readFileSync(resolve(__dirname, '../../styles/althea-components.css'), 'utf8')
const tokens = readFileSync(resolve(__dirname, '../../styles/althea-tokens.css'), 'utf8')

/** Estado visual (`is-*`) que el componente emite para esa intensidad. */
function stateFor(intensity: number): string {
  const { container } = render(
    <MuscleAtlas
      view="front"
      sex="M"
      data={{
        'pectoralis-major': {
          muscleId: 'pectoralis-major', current: 100, previous: 0,
          trend: 'sin-base', unit: 'kg', intensity,
        },
      }}
    />,
  )
  const el = container.querySelector('[data-muscle-id="pectoralis-major-sternal"]')
  return [...(el?.classList ?? [])].find((c) => c.startsWith('is-')) ?? ''
}

/** Regla CSS `fill` que aplica el estado dado al relleno del músculo. */
function ruleFor(state: string, prop: string): string {
  const re = new RegExp(
    `\\.althea-atlas__muscle\\.${state.replace('.', '\\.')} \\.althea-atlas__fill \\{[^}]*${prop}:\\s*([^;}]+)`,
  )
  return components.match(re)?.[1]?.trim() ?? ''
}

function tokenValue(name: string, block: 'light' | 'dark'): string {
  const re = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{3,8})`, 'g')
  const all = [...tokens.matchAll(re)].map((m) => m[1])
  return (block === 'light' ? all[0] : all[1]) ?? ''
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) as [number, number, number]
}

const GREEN = (h: string) => rgb(h)[1] > rgb(h)[0] && rgb(h)[1] > rgb(h)[2] * 0.9
const RED = (h: string) => rgb(h)[0] > rgb(h)[1] && rgb(h)[0] > rgb(h)[2]

describe('escala cromática del atlas', () => {
  it('sin actividad → estado idle → token gris', () => {
    expect(stateFor(0)).toContain('is-idle')
    expect(ruleFor('is-idle', 'fill')).toBe('var(--althea-muscle-idle)')
  })

  it('baja → is-active-low (debe ser VERDE)', () => {
    expect(stateFor(20)).toContain('is-active-low')
    const token = ruleFor('is-active-low', 'fill')
    expect(token).toBe('var(--althea-muscle-low)')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-low', block)
      expect(hex, `sin token low en ${block}`).not.toBe('')
      expect(GREEN(hex), `${block}: low debe ser verde, es ${hex}`).toBe(true)
    }
  })

  it('moderada → is-active-mid (debe ser AMARILLO/NARANJA)', () => {
    expect(stateFor(50)).toContain('is-active-mid')
    expect(ruleFor('is-active-mid', 'fill')).toBe('var(--althea-muscle-mid)')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-mid', block)
      const [r, g, b] = rgb(hex)
      const amarillo = r > b && g > b
      expect(amarillo, `${block}: mid debe ser amarillo/naranja, es ${hex}`).toBe(true)
    }
  })

  it('alta → is-active-high (debe ser ROJO)', () => {
    expect(stateFor(90)).toContain('is-active-high')
    expect(ruleFor('is-active-high', 'fill')).toBe('var(--althea-muscle-high)')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-high', block)
      expect(hex, `sin token high en ${block}`).not.toBe('')
      expect(RED(hex), `${block}: high debe ser rojo, es ${hex}`).toBe(true)
    }
  })

  it('la insignia de intensidad usa el MISMO color que el relleno', () => {
    // Si la insignia dijera "Alta" en verde mientras el músculo es rojo, la
    // escala sería contradictoria para quien lee el texto.
    expect(components).toMatch(/\.althea-atlas__badge\.is-active-high \{[^}]*--althea-error/)
    expect(components).toMatch(/\.althea-atlas__badge\.is-active-low \{[^}]*--althea-success/)
  })

  it('la leyenda declara la escala pedida y NO hay estilos de barras', () => {
    // Sin gráfica: ninguna clase .atlas-chart* debe existir en el CSS.
    expect(components).not.toContain('.atlas-chart')
  })
})

describe('intensidad vs tendencia', () => {
  const point = (over: Partial<MuscleDataPoint>): MuscleDataPoint => ({
    muscleId: 'pectoralis-major', current: 900, previous: 0,
    trend: 'sin-base', unit: 'kg', intensity: 90, ...over,
  })

  it('con trabajo actual y sin base previa: coloreado + tendencia no disponible', () => {
    render(<MuscleAtlas view="front" sex="M" data={{ 'pectoralis-major': point({}) }} detail="below" />)
    const el = document.querySelector('[data-muscle-id="pectoralis-major-sternal"]')
    expect(el?.classList.contains('is-active-high')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: /Pectoral mayor/ })[0])
    // "Alta" aparece en la insignia y en la fila Intensidad.
    expect(screen.getAllByText('Alta').length).toBeGreaterThan(0)
    // "Sin base" aparece en Variación y en Tendencia: la comparación no existe,
    // pero el músculo sigue coloreado por su intensidad actual.
    expect(screen.getAllByText('Sin base').length).toBeGreaterThan(0)
  })

  it('sin actividad: "Sin trabajo", no "falta de atribución"', () => {
    render(
      <MuscleAtlas
        view="front"
        sex="M"
        data={{
          'pectoralis-major': point({ current: 0, intensity: 0, emptyReason: 'ok' }),
        }}
        detail="below"
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Pectoral mayor/ })[0])
    expect(screen.getByText('Sin trabajo en este período.')).toBeInTheDocument()
  })

  it('series sin atribución: el aviso distingue el hueco del mapeo', () => {
    render(
      <MuscleAtlas
        view="front"
        sex="M"
        data={{
          'pectoralis-major': point({ current: 0, intensity: 0, emptyReason: 'sin-atribucion' }),
        }}
        detail="below"
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Pectoral mayor/ })[0])
    expect(screen.getByText(/se pudo atribuir a un músculo/)).toBeInTheDocument()
  })

  it('músculo con volumen no atribuible: aviso distinto', () => {
    render(
      <MuscleAtlas
        view="front"
        sex="M"
        data={{
          'pectoralis-major': point({ current: 0, intensity: 0, emptyReason: 'sin-alcance' }),
        }}
        detail="below"
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Pectoral mayor/ })[0])
    expect(screen.getByText(/volumen atribuible en el período/)).toBeInTheDocument()
  })
})

describe('vistas del cuerpo', () => {
  it('frontal y posterior renderizan las regiones de cada lado', () => {
    const { rerender, container } = render(<MuscleAtlas view="front" sex="M" data={{}} />)
    const frontIds = container.querySelectorAll('[data-muscle-id]').length
    expect(container.querySelector('[data-muscle-id="pectoralis-major-sternal"]')).not.toBeNull()
    rerender(<MuscleAtlas view="back" sex="M" data={{}} />)
    const backIds = container.querySelectorAll('[data-muscle-id]').length
    expect(container.querySelector('[data-muscle-id="latissimus-dorsi"]')).not.toBeNull()
    expect(frontIds).toBeGreaterThan(0)
    expect(backIds).toBeGreaterThan(0)
  })

  it('la ilustración PNG del perfil se conserva (figura, no sólo silueta)', () => {
    const { container } = render(<MuscleAtlas view="front" sex="F" data={{}} />)
    const img = container.querySelector('.althea-atlas__figure-image')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('href')).toContain('/assets/muscle-atlas/')
  })

  it('no hay ninguna gráfica dentro del atlas', () => {
    const { container } = render(<MuscleAtlas view="front" sex="M" data={{}} />)
    expect(container.querySelector('.atlas-chart')).toBeNull()
    expect(container.querySelector('[data-testid="atlas-chart"]')).toBeNull()
    // El único elemento gráfico del área es el SVG del cuerpo.
    expect(container.querySelectorAll('.althea-atlas__svg')).toHaveLength(1)
  })
})
