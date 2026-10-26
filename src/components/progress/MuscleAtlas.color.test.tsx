import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MuscleAtlas } from './MuscleAtlas'
import type { MuscleDataPoint } from './MuscleAtlas'

/**
 * La escala pedida es: sin actividad = GRIS · baja = VERDE OSCURO ·
 * moderada = NARANJA · alta = AZUL MARINO. El rojo queda excluido porque el
 * fondo anatómico es rojizo.
 *
 * Estos tests verifican la correspondencia EFECTIVA entre el estado que el
 * componente emite y el token CSS que realmente aplica el relleno, leyendo las
 * hojas de estilos del repo: no basta con que los tokens estén "bien" si la
 * regla CSS conecta el estado con el token equivocado.
 *
 * También se verifica la OPACIDAD real del relleno, porque un `fill-opacity`
 * bajo es lo que hace que los colores se vean apagados sobre el fondo rojo.
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

/** `fill-opacity` inline que el componente aplica al relleno de una intensidad. */
function fillOpacityFor(intensity: number): number {
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
  const fill = container.querySelector('[data-muscle-id="pectoralis-major-sternal"] .althea-atlas__fill')
  const style = fill?.getAttribute('style') ?? ''
  return Number(style.match(/fill-opacity:\s*([\d.]+)/)?.[1] ?? 'NaN')
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

/** Luminancia relativa WCAG, para comparar contraste real entre colores. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Verde: domina el canal G sobre R y B. */
const GREEN = (h: string) => rgb(h)[1] > rgb(h)[0] && rgb(h)[1] > rgb(h)[2]
/** Azul: domina B sobre R y G. */
const BLUE = (h: string) => rgb(h)[2] > rgb(h)[0] && rgb(h)[2] > rgb(h)[1]

/** Matiz en grados (0–360). Un color es "rojo" sólo si cae en su banda. */
function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) { return 0 }
  let h: number
  if (max === r) { h = ((g - b) / d) % 6 }
  else if (max === g) { h = (b - r) / d + 2 }
  else { h = (r - g) / d + 4 }
  h *= 60
  return h < 0 ? h + 360 : h
}

/**
 * Rojo de verdad: matiz en la banda roja Y saturación suficiente.
 * El criterio por canales solos marcaba como "rojo" al naranja #ffc174, así
 * que el matiz es imprescindible para no confundir naranja con rojo.
 */
const RED = (h: string) => {
  const deg = hue(h)
  const [r, g, b] = rgb(h)
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)
  return chroma >= 40 && (deg <= 12 || deg >= 340)
}

describe('escala cromática del atlas', () => {
  it('sin actividad → estado idle → GRIS visible (#969DA7)', () => {
    expect(stateFor(0)).toContain('is-idle')
    expect(ruleFor('is-idle', 'fill')).toBe('var(--althea-muscle-idle)')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-idle', block)
      expect(hex).toBe('#969DA7')
      // Gris neutro desaturado: los tres canales casi iguales.
      const [r, g, b] = rgb(hex)
      expect(Math.max(r, g, b) - Math.min(r, g, b), `${hex} no es un gris neutro`).toBeLessThanOrEqual(20)
      expect(hex).not.toBe('#DCD8CC') // el beige apagado anterior
    }
  })

  it('baja → is-active-low (debe ser VERDE OSCURO #1B5E20)', () => {
    expect(stateFor(20)).toContain('is-active-low')
    expect(ruleFor('is-active-low', 'fill')).toBe('var(--althea-muscle-low)')
    expect(tokenValue('--althea-muscle-low', 'light')).toBe('#1B5E20')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-low', block)
      expect(hex, `sin token low en ${block}`).not.toBe('')
      expect(GREEN(hex), `${block}: low debe ser verde, es ${hex}`).toBe(true)
      // Verde saturado y profundo, no el verde apagado anterior (#3F7A52).
      expect(rgb(hex)[0], `${block}: el verde no debe verse gris`).toBeLessThan(60)
      // En claro es verde bosque bien oscuro; en oscuro se aclara un punto para
      // no fundirse con la superficie, pero sigue siendo oscuro.
      const limite = block === 'light' ? 0.12 : 0.2
      expect(luminance(hex), `${block}: el verde debe ser oscuro (${hex})`).toBeLessThan(limite)
    }
  })

  it('moderada → is-active-mid (conserva el NARANJA actual)', () => {
    expect(stateFor(50)).toContain('is-active-mid')
    expect(ruleFor('is-active-mid', 'fill')).toBe('var(--althea-muscle-mid)')
    // El tono NO se toca: el naranja que ya funcionaba se mantiene.
    expect(tokenValue('--althea-muscle-mid', 'light')).toBe('#C9A23E')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-mid', block)
      const [r, g, b] = rgb(hex)
      const naranja = r > b && g > b
      expect(naranja, `${block}: mid debe ser naranja, es ${hex}`).toBe(true)
    }
  })

  it('alta → is-active-high (AZUL MARINO #12345A, sin rojo)', () => {
    expect(stateFor(90)).toContain('is-active-high')
    expect(ruleFor('is-active-high', 'fill')).toBe('var(--althea-muscle-high)')
    expect(tokenValue('--althea-muscle-high', 'light')).toBe('#12345A')
    for (const block of ['light', 'dark'] as const) {
      const hex = tokenValue('--althea-muscle-high', block)
      expect(hex, `sin token high en ${block}`).not.toBe('')
      expect(BLUE(hex), `${block}: high debe ser azul marino, es ${hex}`).toBe(true)
      expect(RED(hex), `${block}: high NO puede ser rojo (${hex})`).toBe(false)
      expect(hex).not.toBe('#B0524B')
      expect(hex).not.toBe('#C25B5B')
    }
  })

  it('el tema oscuro también usa la escala sin rojo', () => {
    for (const token of ['--althea-muscle-idle', '--althea-muscle-low', '--althea-muscle-mid', '--althea-muscle-high']) {
      const hex = tokenValue(token, 'dark')
      expect(hex, `sin ${token} en el tema oscuro`).not.toBe('')
      expect(RED(hex), `${token} = ${hex} no puede ser rojo`).toBe(false)
    }
  })

  it('la escala completa se diferencia entre sí (sin colores duplicados)', () => {
    const escala = ['--althea-muscle-idle', '--althea-muscle-low', '--althea-muscle-mid', '--althea-muscle-high']
      .map((t) => tokenValue(t, 'light').toUpperCase())
    expect(new Set(escala).size).toBe(4)
    // Y el gris idle no puede parecerse al verde ni al azul (se lee como "nada").
    const lum = escala.map((h) => luminance(h))
    for (let i = 0; i < escala.length; i++) {
      for (let j = i + 1; j < escala.length; j++) {
        expect(Math.abs(lum[i] - lum[j])).toBeGreaterThan(0.01)
      }
    }
  })
})

describe('opacidad y renderizado del relleno', () => {
  it('el relleno es prácticamente sólido en TODO el rango (nada de 0.4)', () => {
    for (const intensity of [0, 1, 20, 33, 34, 50, 66, 67, 90, 100]) {
      const opacity = fillOpacityFor(intensity)
      expect(Number.isNaN(opacity), `intensidad ${intensity}: sin fill-opacity`).toBe(false)
      expect(opacity, `intensidad ${intensity}: relleno demasiado transparente (${opacity})`).toBeGreaterThanOrEqual(0.9)
      expect(opacity, `intensidad ${intensity}: relleno demasiado transparente (${opacity})`).toBeLessThanOrEqual(1)
    }
  })

  it('el fondo rojo NO puede contaminar el relleno (opacidad mínima 0.90)', () => {
    // Regresión: con 0.4 + 0.6·i/100 la intensidad baja quedaba en ~0.41 y el
    // PNG rojizo se colaba por debajo de todo el mapa.
    expect(fillOpacityFor(1)).toBeGreaterThanOrEqual(0.9)
  })

  it('el velo de sombreado es suave: no lava los colores del relleno', () => {
    const source = readFileSync(resolve(__dirname, './MuscleAtlas.tsx'), 'utf8')
    const stops = [...source.matchAll(/stopOpacity="([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(stops.length).toBeGreaterThan(0)
    for (const s of stops) {
      expect(s, `velo de ${s} demasiado fuerte`).toBeLessThanOrEqual(0.2)
    }
  })

  it('el PNG se dibuja ANTES que los músculos: la figura no los tapa', () => {
    const source = readFileSync(resolve(__dirname, './MuscleAtlas.tsx'), 'utf8')
    const img = source.indexOf('althea-atlas__figure-image')
    const muscles = source.indexOf('renderHalf(false)')
    expect(img).toBeGreaterThan(-1)
    expect(muscles).toBeGreaterThan(-1)
    expect(img, 'el PNG debe renderizarse antes que las regiones').toBeLessThan(muscles)
  })

  it('no hay mix-blend-mode ni filtro que altere el color de las regiones', () => {
    expect(components).not.toContain('mix-blend-mode')
    const source = readFileSync(resolve(__dirname, './MuscleAtlas.tsx'), 'utf8')
    // El único filtro permitido es el de la máscara de silueta.
    const filtros = [...source.matchAll(/filter:\s*'([^']+)'/g)].map((m) => m[1])
    for (const f of filtros) {
      expect(f, `filtro inesperado sobre el render: ${f}`).toBe('brightness(0) invert(1)')
    }
  })

  it('el fondo PNG conserva exactamente su aspecto original', () => {
    // La figura se dibuja desde el asset original, sin filtros de color ni
    // modos de fusión: el recorte por máscara usa el alfa de la propia imagen.
    const tsx = readFileSync(resolve(__dirname, './MuscleAtlas.tsx'), 'utf8')
    expect(tsx).toContain('althea-atlas__figure-image')
    expect(components).not.toMatch(/\.althea-atlas__figure-image[^}]*filter/)
    expect(components).not.toMatch(/\.althea-atlas__figure-image[^}]*mix-blend/)
    expect(components).not.toMatch(/\.althea-atlas__figure-image[^}]*opacity/)
  })
})

describe('leyenda y coherencia de la interfaz', () => {
  it('la insignia de intensidad usa el MISMO color que el relleno', () => {
    // Si la insignia dijera "Alta" en rojo mientras el músculo es azul, la
    // escala sería contradictoria para quien lee el texto.
    expect(components).toMatch(/\.althea-atlas__badge\.is-active-high \{[^}]*--althea-muscle-high/)
    expect(components).toMatch(/\.althea-atlas__badge\.is-active-low \{[^}]*--althea-muscle-low/)
    expect(components).toMatch(/\.althea-atlas__badge\.is-idle \{[^}]*--althea-muscle-idle/)
    // Y en ningún estado de la insignia queda el rojo de la escala anterior.
    expect(components).not.toMatch(/\.althea-atlas__badge\.is-active-high \{[^}]*--althea-error/)
  })

  it('las muestras de la leyenda usan los tokens de la escala', () => {
    expect(components).toMatch(/\.atlas-legend__sw\.is-idle \{[^}]*--althea-muscle-idle/)
    expect(components).toMatch(/\.atlas-legend__sw\.is-low \{[^}]*--althea-muscle-low/)
    expect(components).toMatch(/\.atlas-legend__sw\.is-mid \{[^}]*--althea-muscle-mid/)
    expect(components).toMatch(/\.atlas-legend__sw\.is-high \{[^}]*--althea-muscle-high/)
  })

  it('NO hay estilos de barras y el rojo no aparece en el CSS del atlas', () => {
    expect(components).not.toContain('.atlas-chart')
    // Bloque del atlas: el rojo no puede asignarse a ningún nivel de intensidad.
    const bloqueAtlas = components.slice(components.indexOf('MAPA MUSCULAR'), components.indexOf('.atlas-error'))
    expect(bloqueAtlas).not.toMatch(/--althea-muscle-\w+:\s*#(?:[A-Fa-f0-9]{2})?[0-9a-fA-F]{0,2}[Bb]0[0-9a-fA-F]{2}4[Bb]/)
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
