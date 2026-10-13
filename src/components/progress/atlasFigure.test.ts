import { describe, it, expect } from 'vitest'
import {
  getAtlasImage,
  getAtlasLayout,
  atlasImageFiles,
  type AtlasAssetLayout,
} from '@/components/progress/atlasFigure'

const VIEWS = ['front', 'back'] as const

describe('getAtlasImage', () => {
  it('M selecciona los dos PNG masculinos', () => {
    expect(getAtlasImage('M', 'front')).toMatch(/male-front.*\.png$/)
    expect(getAtlasImage('M', 'back')).toMatch(/male-back.*\.png$/)
  })

  it('F selecciona los dos PNG femeninos', () => {
    expect(getAtlasImage('F', 'front')).toMatch(/female-front.*\.png$/)
    expect(getAtlasImage('F', 'back')).toMatch(/female-back.*\.png$/)
  })

  it('X no tiene ilustración: devuelve null (silueta SVG neutral)', () => {
    for (const view of VIEWS) {
      expect(getAtlasImage('X', view)).toBeNull()
    }
  })

  it('ninguna combinación devuelve undefined', () => {
    for (const sex of ['M', 'F', 'X'] as const) {
      for (const view of VIEWS) {
        expect(getAtlasImage(sex, view)).not.toBeUndefined()
      }
    }
  })
})

describe('archivos empaquetados', () => {
  it('existen los cuatro PNG del atlas', () => {
    expect(atlasImageFiles()).toEqual([
      'female-back.png',
      'female-front.png',
      'male-back.png',
      'male-front.png',
    ])
  })
})

describe('getAtlasLayout', () => {
  it('X no tiene layout', () => {
    expect(getAtlasLayout('X', 'front')).toBeNull()
    expect(getAtlasLayout('X', 'back')).toBeNull()
  })

  it('M y F tienen layout definido para ambas vistas', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const view of VIEWS) {
        const l = getAtlasLayout(sex, view)
        expect(l).toBeTruthy()
        expect(l?.s).toBeGreaterThan(0)
      }
    }
  })

  it('la escala es uniforme (no deforma el cuerpo)', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const view of VIEWS) {
        const l = getAtlasLayout(sex, view) as AtlasAssetLayout
        // La caja de la figura mapeada debe medir exactamente BODY_HEIGHT.
        expect(l.figH * l.s).toBeCloseTo(388.1, 1)
      }
    }
  })

  it('centra la figura horizontalmente en x=100 del viewBox', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const view of VIEWS) {
        const l = getAtlasLayout(sex, view) as AtlasAssetLayout
        const figCx = l.figX + l.figW / 2
        expect(l.tx + figCx * l.s).toBeCloseTo(100, 1)
      }
    }
  })

  it('coloca la coronilla en y=8 del viewBox', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const view of VIEWS) {
        const l = getAtlasLayout(sex, view) as AtlasAssetLayout
        expect(l.ty + l.figY * l.s).toBeCloseTo(8, 1)
      }
    }
  })

  it('la proporción de la figura medida es cercana a la del viewBox (0.5)', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const view of VIEWS) {
        const l = getAtlasLayout(sex, view) as AtlasAssetLayout
        const ratio = l.figW / l.figH
        expect(ratio).toBeGreaterThan(0.4)
        expect(ratio).toBeLessThan(0.55)
      }
    }
  })

  it('las medidas son de un lienzo cuadrado de 512', () => {
    for (const sex of ['M', 'F'] as const) {
      for (const view of VIEWS) {
        const l = getAtlasLayout(sex, view) as AtlasAssetLayout
        expect(l.canvas).toBe(512)
        expect(l.figX).toBeGreaterThanOrEqual(0)
        expect(l.figY).toBeGreaterThanOrEqual(0)
        expect(l.figX + l.figW).toBeLessThanOrEqual(512)
        expect(l.figY + l.figH).toBeLessThanOrEqual(512)
      }
    }
  })
})
