import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishComposer, type DishSavePayload } from './DishComposer'
import { listCustomFoods } from '@/services/storage/customFoodStore'
import { db } from '@/services/storage/db'
import { clearExtraFoods } from '@/services/nutrition/foodComposition'

// Flujo completo de alta: buscar un alimento en el catálogo (o crear uno
// manualmente) → agregarlo con su cantidad → la revisión lo muestra → al
// guardar, el id del alimento viaja en los ingredientes.

async function reset() {
  await db.customFoods.clear()
  clearExtraFoods()
}

describe('DishComposer — armar una comida desde la búsqueda / alta manual', () => {
  beforeEach(reset)
  afterEach(reset)

  it('buscar un alimento del catálogo y agregarlo lo suma a la revisión y al guardado', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<DishComposer onSave={onSave} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Buscar alimento'), 'arroz integral')
    const results = await screen.findByTestId('food-search-results')
    const add = within(results).getAllByRole('button', { name: /Agregar/i })[0]
    await user.click(add)

    const review = await screen.findByTestId('dish-review')
    expect(within(review).getByText('Arroz integral (cocido)')).toBeInTheDocument()

    await user.click(within(review).getByTestId('dish-save'))
    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0] as DishSavePayload
    expect(payload.ingredients.map(i => i.foodId)).toEqual(['arroz-integral-cocido'])
    // 123 kcal/100 g sobre la porción estándar de 200 g → 246 kcal
    expect(payload.totals.calories).toBeCloseTo(246, 1)
    expect(payload.totals.calories).toBeGreaterThan(0)
  })

  it('crear un alimento manualmente lo agrega a la comida y viaja al guardado', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<DishComposer onSave={onSave} onCancel={vi.fn()} />)

    await user.click(screen.getByTestId('food-search-create'))
    const form = await screen.findByTestId('custom-food-form')
    await user.type(within(form).getByLabelText('Nombre del alimento'), 'Torta de arroz casera')
    await user.type(within(form).getByLabelText('Calorías'), '180')
    await user.type(within(form).getByLabelText('Proteínas'), '4')
    await user.type(within(form).getByLabelText('Carbohidratos'), '30')
    await user.type(within(form).getByLabelText('Grasas'), '5')
    await user.click(within(form).getByTestId('cf-save'))

    const saved = await listCustomFoods()
    expect(saved).toHaveLength(1)
    const review = await screen.findByTestId('dish-review')
    expect(within(review).getByText('Torta de arroz casera')).toBeInTheDocument()

    await user.click(within(review).getByTestId('dish-save'))
    const payload = onSave.mock.calls[0][0] as DishSavePayload
    expect(payload.ingredients.map(i => i.foodId)).toEqual([saved[0].id])
    expect(payload.totals.calories).toBeGreaterThan(0)
  })

  it('agregar un alimento con cantidad explícita recalcula sus macros', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<DishComposer onSave={onSave} onCancel={vi.fn()} />)

    await user.type(screen.getByLabelText('Buscar alimento'), 'pollo')
    const results = await screen.findByTestId('food-search-results')
    const polloRow = within(results).getAllByRole('listitem').find(li =>
      within(li).queryByText(/pollo/i) !== null
    )!
    const qty = within(polloRow).getByRole('spinbutton')
    await user.clear(qty)
    await user.type(qty, '150')
    await user.click(within(polloRow).getByRole('button', { name: /Agregar/i }))

    const review = await screen.findByTestId('dish-review')
    await user.click(within(review).getByTestId('dish-save'))
    const payload = onSave.mock.calls[0][0] as DishSavePayload
    const comp = payload.ingredients.find(i => i.label.toLowerCase().includes('pollo'))
    expect(comp).toBeDefined()
    expect(comp!.grams).toBe(150)
    expect(payload.totals.calories).toBeGreaterThan(0)
  })
})
