import { describe, it, expect } from 'vitest'
import { normalizeSex, SEX_LABEL } from '@/utils/sex'

describe('normalizeSex', () => {
  it('acepta el código canónico', () => {
    expect(normalizeSex('M')).toBe('M')
    expect(normalizeSex('F')).toBe('F')
    expect(normalizeSex('X')).toBe('X')
  })

  it('normaliza el vocabulario legacy del onboarding', () => {
    expect(normalizeSex('masculino')).toBe('M')
    expect(normalizeSex('femenino')).toBe('F')
    expect(normalizeSex('otro')).toBe('X')
  })

  it('es tolerante a mayúsculas y espacios', () => {
    expect(normalizeSex(' M ')).toBe('M')
    expect(normalizeSex('Femenino')).toBe('F')
    expect(normalizeSex('OtRo')).toBe('X')
  })

  it('todo lo desconocido o vacío cae en X (figura neutral)', () => {
    expect(normalizeSex(undefined)).toBe('X')
    expect(normalizeSex(null)).toBe('X')
    expect(normalizeSex('')).toBe('X')
    expect(normalizeSex('inventado')).toBe('X')
    expect(normalizeSex(42)).toBe('X')
    expect(normalizeSex({})).toBe('X')
  })
})

describe('SEX_LABEL', () => {
  it('tiene etiqueta para los tres códigos', () => {
    expect(SEX_LABEL.M).toBeTruthy()
    expect(SEX_LABEL.F).toBeTruthy()
    expect(SEX_LABEL.X).toBeTruthy()
  })
})
