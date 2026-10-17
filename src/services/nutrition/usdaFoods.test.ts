import { describe, it, expect, beforeEach } from 'vitest'
import { loadUsdaFoods, usdaFoodsLoaded, usdaLoaded, usdaMeta, resetUsdaCache } from './usdaFoods'
import { searchFoodsLocal } from './foodSearch'

const CODE = { foundation: 'f', fndds: 'n', sr: 's' }

describe('catálogo USDA (carga diferida)', () => {
  beforeEach(() => resetUsdaCache())

  it('está vacío antes de cargar y disponible después', async () => {
    expect(usdaLoaded()).toBe(false)
    expect(usdaFoodsLoaded()).toEqual([])
    const foods = await loadUsdaFoods()
    expect(foods.length).toBeGreaterThan(10000)
    expect(usdaLoaded()).toBe(true)
    expect(usdaFoodsLoaded().length).toBe(foods.length)
  })

  it('expone metadatos de procedencia y licencia abierta', async () => {
    await loadUsdaFoods()
    const meta = usdaMeta()
    expect(meta).not.toBeNull()
    expect(meta!.count).toBeGreaterThan(10000)
    expect(meta!.license).toMatch(/CC0|dominio/i)
    const codes = meta!.sources.map(s => s.code).sort()
    expect(codes).toEqual([CODE.foundation, CODE.fndds, CODE.sr])
    expect(meta!.sources.every(s => s.foods > 0)).toBe(true)
  })

  it('normaliza cada registro a un alimento por 100 g', async () => {
    const f = (await loadUsdaFoods())[0]
    expect(f.id.startsWith('usda-')).toBe(true)
    expect(f.unit).toBe('g')
    expect(f.source).toBe('usda')
    expect(f.per100.calories).toBeGreaterThanOrEqual(0)
    expect(f.standardGrams).toBeGreaterThan(0)
    expect(Array.isArray(f.aliases)).toBe(true)
    expect(f.aliases.length).toBeGreaterThan(0)
  })

  it('cachea: dos llamadas devuelven la misma referencia', async () => {
    const a = await loadUsdaFoods()
    const b = await loadUsdaFoods()
    expect(a).toBe(b)
  })

  it('mapea nutrientes opcionales sin inventar ceros ausentes', async () => {
    const foods = await loadUsdaFoods()
    const withSodium = foods.find(f => f.extras?.sodium !== undefined)
    expect(withSodium).toBeDefined()
    const extrasKeys = new Set(foods.flatMap(f => Object.keys(f.extras ?? {})))
    expect(extrasKeys.has('fiber') || extrasKeys.has('saturatedFat')).toBe(true)
  })
})

describe('búsqueda local con USDA cargado', () => {
  beforeEach(() => resetUsdaCache())

  it('sin cargar, no hay resultados de fuente USDA', async () => {
    const res = await searchFoodsLocal('pollo')
    expect(res.some(r => r.source === 'usda')).toBe(false)
  })

  it('tras cargar, la búsqueda incluye la fuente USDA', async () => {
    await loadUsdaFoods()
    const res = await searchFoodsLocal('pollo')
    expect(res.some(r => r.source === 'usda')).toBe(true)
    const usda = res.filter(r => r.source === 'usda')
    expect(usda.every(r => r.unit === 'g' && r.standardGrams > 0)).toBe(true)
  })

  it('el catálogo curado en español gana los empates frente a USDA', async () => {
    await loadUsdaFoods()
    const res = await searchFoodsLocal('avena')
    expect(res[0].source).not.toBe('usda')
  })
})
