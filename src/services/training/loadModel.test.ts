import { describe, it, expect } from 'vitest'
import { kg, lb, stackCount, plateCount, toKg, canConvertToKg, formatLoad, parseLoad } from './loadModel'

describe('loadModel — creación', () => {
  it('crea carga KG', () => {
    expect(kg(80)).toEqual({ value: 80, unit: 'KG' })
  })

  it('crea carga LB', () => {
    expect(lb(176)).toEqual({ value: 176, unit: 'LB' })
  })

  it('crea carga STACK_COUNT sin equivalencia', () => {
    expect(stackCount(8)).toEqual({ value: 8, unit: 'STACK_COUNT', conversionFactor: undefined })
  })

  it('crea carga STACK_COUNT con equivalencia', () => {
    expect(stackCount(8, 5)).toEqual({ value: 8, unit: 'STACK_COUNT', conversionFactor: 5 })
  })

  it('crea carga PLATE_COUNT', () => {
    expect(plateCount(2, 20)).toEqual({ value: 2, unit: 'PLATE_COUNT', conversionFactor: 20 })
  })
})

describe('loadModel — conversión a kg', () => {
  it('KG convierte directo', () => {
    expect(toKg(kg(80))).toBe(80)
  })

  it('LB convierte con equivalencia conocida', () => {
    const result = toKg(lb(176))
    expect(result).toBeCloseTo(79.8, 1)
  })

  it('STACK_COUNT con equivalencia convierte', () => {
    expect(toKg(stackCount(8, 5))).toBe(40)
  })

  it('STACK_COUNT sin equivalencia retorna null (NO inventa)', () => {
    expect(toKg(stackCount(8))).toBeNull()
  })

  it('PLATE_COUNT sin equivalencia retorna null', () => {
    expect(toKg(plateCount(2))).toBeNull()
  })

  it('PLATE_COUNT con equivalencia convierte', () => {
    expect(toKg(plateCount(3, 20))).toBe(60)
  })

  it('UNIT sin equivalencia retorna null', () => {
    expect(toKg({ value: 5, unit: 'UNIT' })).toBeNull()
  })

  it('UNIT con equivalencia convierte', () => {
    expect(toKg({ value: 5, unit: 'UNIT', conversionFactor: 2.5 })).toBe(12.5)
  })
})

describe('loadModel — canConvertToKg', () => {
  it('KG siempre convertible', () => {
    expect(canConvertToKg(kg(80))).toBe(true)
  })

  it('STACK_COUNT sin equivalencia no convertible', () => {
    expect(canConvertToKg(stackCount(8))).toBe(false)
  })

  it('STACK_COUNT con equivalencia convertible', () => {
    expect(canConvertToKg(stackCount(8, 5))).toBe(true)
  })
})

describe('loadModel — formatLoad', () => {
  it('muestra KG simple', () => {
    expect(formatLoad(kg(80))).toBe('80 KG')
  })

  it('muestra LB con equivalencia', () => {
    expect(formatLoad(lb(176))).toBe('176 LB (~79.8 kg)')
  })

  it('muestra STACK_COUNT sin equivalencia', () => {
    expect(formatLoad(stackCount(8))).toBe('8 STACK_COUNT (sin equivalencia kg)')
  })

  it('muestra STACK_COUNT con equivalencia', () => {
    expect(formatLoad(stackCount(8, 5))).toBe('8 STACK_COUNT (~40 kg)')
  })

  it('conserva siempre el valor original', () => {
    const load = stackCount(8, 5)
    const formatted = formatLoad(load)
    expect(formatted).toContain('8')
    expect(formatted).toContain('STACK_COUNT')
  })
})

describe('loadModel — parseLoad', () => {
  it('parsea número como KG', () => {
    expect(parseLoad(80)).toEqual({ value: 80, unit: 'KG' })
  })

  it('parsea "80 KG"', () => {
    expect(parseLoad('80 KG')).toEqual({ value: 80, unit: 'KG' })
  })

  it('parsea "176 LB"', () => {
    expect(parseLoad('176 LB')).toEqual({ value: 176, unit: 'LB' })
  })

  it('parsea "8 lingotes"', () => {
    expect(parseLoad('8 lingotes')).toEqual({ value: 8, unit: 'STACK_COUNT', conversionFactor: undefined })
  })

  it('parsea "80" como KG por defecto', () => {
    expect(parseLoad('80')).toEqual({ value: 80, unit: 'KG' })
  })

  it('parsea "2 placas"', () => {
    expect(parseLoad('2 placas')).toEqual({ value: 2, unit: 'PLATE_COUNT', conversionFactor: undefined })
  })
})

describe('loadModel — datos persistentes', () => {
  it('el valor original no se destruye al convertir', () => {
    const original = stackCount(8, 5)
    const kgValue = toKg(original)
    expect(kgValue).toBe(40)
    // El original sigue intacto
    expect(original.value).toBe(8)
    expect(original.unit).toBe('STACK_COUNT')
  })

  it('JSON roundtrip conserva todos los campos', () => {
    const original = { value: 8, unit: 'STACK_COUNT' as const, conversionFactor: 5 }
    const roundtrip = JSON.parse(JSON.stringify(original))
    expect(roundtrip).toEqual(original)
    expect(toKg(roundtrip)).toBe(40)
  })
})
