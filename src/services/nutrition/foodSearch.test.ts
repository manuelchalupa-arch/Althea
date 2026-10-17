import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchFoodsLocal, searchExternalFoods, searchExternalFoodsDetailed, recipePer100, clearExternalCache } from './foodSearch'
import { createCustomFood } from '@/services/storage/customFoodStore'
import { db } from '@/services/storage/db'
import { clearExtraFoods } from './foodComposition'

async function reset() {
  await db.customFoods.clear()
  clearExtraFoods()
  clearExternalCache()
}

describe('búsqueda local (personalizados → catálogo → recetas)', () => {
  beforeEach(reset)
  afterEach(reset)

  it('consulta vacía no devuelve nada', async () => {
    expect(await searchFoodsLocal('   ')).toEqual([])
  })

  it('encuentra alimentos del catálogo por prefijo y exacto', async () => {
    const res = await searchFoodsLocal('arroz')
    expect(res.length).toBeGreaterThan(0)
    expect(res.every(r => r.label.toLowerCase().includes('arroz'))).toBe(true)
    expect(res.some(r => r.source === 'catalog')).toBe(true)
  })

  it('encuentra recetas como fuente ' + 'recipe', async () => {
    const res = await searchFoodsLocal('fideos con boloñesa')
    const recipe = res.find(r => r.source === 'recipe')
    expect(recipe).toBeDefined()
    expect(recipe!.recipe).toBeDefined()
    expect(recipe!.per100.calories).toBeGreaterThan(0)
  })

  it('el alimento personalizado tiene prioridad sobre el catálogo', async () => {
    await createCustomFood({
      name: 'Arroz maracuyá',
      basis: 'per100g',
      calories: 400, proteins: 5, carbs: 80, fats: 6,
    })
    const res = await searchFoodsLocal('arroz maracuyá')
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].source).toBe('custom')
    expect(res[0].label).toBe('Arroz maracuyá')
  })

  it('respeta el límite de resultados', async () => {
    const res = await searchFoodsLocal('a', 3)
    expect(res.length).toBeLessThanOrEqual(3)
  })

  it('la receta expone su porción estimada en gramos', () => {
    const recipes = [{ id: 'x', name: 'Fideos con boloñesa', aliases: ['fideos'], items: [{ foodId: 'fideos', grams: 180 }] }]
    const { per100, grams } = recipePer100(recipes[0] as never)
    expect(grams).toBe(180)
    expect(per100.calories).toBeGreaterThan(0)
  })
})

describe('búsqueda en línea (Open Food Facts, degradada)', () => {
  beforeEach(() => { clearExternalCache() })
  afterEach(() => { vi.unstubAllGlobals(); clearExternalCache() })

  it('devuelve resultados cuando la API responde', async () => {
    const payload = {
      products: [
        {
          code: '123',
          product_name: 'Yogur batido',
          brands: 'Marca Norte',
          serving_quantity: 170,
          nutriments: {
            'energy-kcal_100g': '90',
            proteins_100g: '3',
            carbohydrates_100g: '12',
            fat_100g: '2.5',
          },
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    })))

    const res = await searchExternalFoods('yogur batido')
    expect(res).toHaveLength(1)
    expect(res[0].source).toBe('external')
    expect(res[0].label).toContain('Yogur batido')
    expect(res[0].per100.calories).toBe(90)
    expect(res[0].per100.fats).toBe(2.5)
    expect(res[0].standardGrams).toBe(170)
    expect(res[0].externalCode).toBe('123')
  })

  it('sin conexión devuelve [] (nunca rompe la pantalla)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await searchExternalFoods('cualquier cosa')).toEqual([])
  })

  it('una respuesta no ok degrada a []', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    expect(await searchExternalFoods('algo')).toEqual([])
  })

  it('consulta vacía no llama a la red', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchExternalFoods('  ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('una búsqueda sin resultados devuelve []', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ products: [] }) })))
    expect(await searchExternalFoods('zzz sin resultados')).toEqual([])
  })

  it('el tiempo de espera agotado degrada a [] sin colgar la pantalla', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }))
    const res = await searchExternalFoods('servidor lento', 15, 20)
    expect(res).toEqual([])
  })
})

describe('búsqueda en línea: estado detallado (vacío ≠ error)', () => {
  beforeEach(() => { clearExternalCache() })
  afterEach(() => { vi.unstubAllGlobals(); clearExternalCache() })

  it('status "ok" con productos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ products: [{ code: '9', product_name: 'Yogur natural', nutriments: { 'energy-kcal_100g': '60' } }] }),
    })))
    const out = await searchExternalFoodsDetailed('yogur')
    expect(out.status).toBe('ok')
    expect(out.results).toHaveLength(1)
  })

  it('status "empty" cuando el proveedor responde sin resultados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ products: [] }) })))
    const out = await searchExternalFoodsDetailed('zzzznoexistezzz')
    expect(out.status).toBe('empty')
    expect(out.results).toEqual([])
  })

  it('status "error" cuando el proveedor falla (503), sin inventar resultados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
    const out = await searchExternalFoodsDetailed('yogur', 15, 5000, 0)
    expect(out.status).toBe('error')
    expect(out.results).toEqual([])
    expect(out.message).toBeTruthy()
  })
})

describe('normalización de plurales en la búsqueda', () => {
  it('buscar en singular encuentra el plural del catálogo', async () => {
    const res = await searchFoodsLocal('lenteja')
    expect(res.some(r => /lentejas/i.test(r.label))).toBe(true)
  })

  it('buscar en plural encuentra el singular del catálogo', async () => {
    const res = await searchFoodsLocal('huevos')
    expect(res.some(r => /huevo/i.test(r.label))).toBe(true)
  })
})
