import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FoodSearchPanel } from './FoodSearchPanel'
import { listCustomFoods } from '@/services/storage/customFoodStore'
import { db } from '@/services/storage/db'
import { clearExtraFoods } from '@/services/nutrition/foodComposition'

async function reset() {
  await db.customFoods.clear()
  clearExtraFoods()
}

describe('FoodSearchPanel — buscar y armar la comida a mano', () => {
  beforeEach(reset)
  afterEach(reset)

  it('busca en el catálogo local y permite agregar un resultado', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<FoodSearchPanel onPick={onPick} />)

    await user.type(screen.getByLabelText('Buscar alimento'), 'arroz')
    const results = await screen.findByTestId('food-search-results')
    expect(results).toBeInTheDocument()

    const firstAdd = within(results).getAllByRole('button', { name: /Agregar/i })[0]
    await user.click(firstAdd)
    expect(onPick).toHaveBeenCalledTimes(1)
    const [result, grams] = onPick.mock.calls[0]
    expect(typeof result.id).toBe('string')
    expect(grams).toBeGreaterThan(0)
  })

  it('sin resultados en el catálogo ofrece buscar en línea o crear manualmente', async () => {
    const user = userEvent.setup()
    render(<FoodSearchPanel onPick={vi.fn()} />)
    await user.type(screen.getByLabelText('Buscar alimento'), 'zzzznoexistezzz')
    expect(await screen.findByTestId('food-search-empty')).toBeInTheDocument()
    expect(screen.getByTestId('food-search-create')).toBeInTheDocument()
  })

  it('abre el formulario de alimento manual, valida campos vacíos y lo crea', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<FoodSearchPanel onPick={onPick} />)

    await user.click(screen.getByTestId('food-search-create'))
    const form = await screen.findByTestId('custom-food-form')

    // Dejar una macro vacía: no es 0, hay que pedir explícitamente.
    await user.type(within(form).getByLabelText('Nombre del alimento'), 'Merklet sin gluten')
    await user.type(within(form).getByLabelText('Calorías'), '210')
    // proteínas/carbohidratos/grasas vacíos
    await user.click(within(form).getByTestId('cf-save'))
    expect(await within(form).findByTestId('cf-errors')).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()

    // Completar el resto con 0 explícito donde corresponda.
    await user.type(within(form).getByLabelText('Proteínas'), '0')
    await user.type(within(form).getByLabelText('Carbohidratos'), '0')
    await user.type(within(form).getByLabelText('Grasas'), '0')
    await user.click(within(form).getByTestId('cf-save'))

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    const saved = await listCustomFoods()
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Merklet sin gluten')
    expect(saved[0].source).toBe('manual')
    expect(saved[0].per100.calories).toBe(210)
  })

  it('muestra el aviso si las calorías no cuadran con los macros pero permite guardar', async () => {
    const user = userEvent.setup()
    render(<FoodSearchPanel onPick={vi.fn()} />)
    await user.click(screen.getByTestId('food-search-create'))
    const form = await screen.findByTestId('custom-food-form')

    await user.type(within(form).getByLabelText('Nombre del alimento'), 'Barra rara')
    await user.type(within(form).getByLabelText('Calorías'), '500')
    await user.type(within(form).getByLabelText('Proteínas'), '1')
    await user.type(within(form).getByLabelText('Carbohidratos'), '2')
    await user.type(within(form).getByLabelText('Grasas'), '1')

    expect(await within(form).findByTestId('cf-warning')).toBeInTheDocument()
    // el aviso no bloquea: aún se puede guardar
    await user.click(within(form).getByTestId('cf-save'))
    await waitFor(() => expect(screen.queryByTestId('custom-food-form')).not.toBeInTheDocument())
    expect(await listCustomFoods()).toHaveLength(1)
  })

  it('normaliza el alimento por porción a per100 antes de guardarlo', async () => {
    const user = userEvent.setup()
    render(<FoodSearchPanel onPick={vi.fn()} />)
    await user.click(screen.getByTestId('food-search-create'))
    const form = await screen.findByTestId('custom-food-form')

    await user.selectOptions(within(form).getByLabelText('Base de cálculo'), 'perServing')
    await user.type(within(form).getByLabelText('Nombre del alimento'), 'Galleta')
    await user.type(within(form).getByLabelText('Peso de la porción'), '50')
    await user.type(within(form).getByLabelText('Calorías'), '60')
    await user.type(within(form).getByLabelText('Proteínas'), '1')
    await user.type(within(form).getByLabelText('Carbohidratos'), '6')
    await user.type(within(form).getByLabelText('Grasas'), '2')
    await user.click(within(form).getByTestId('cf-save'))

    await waitFor(() => expect(screen.queryByTestId('custom-food-form')).not.toBeInTheDocument())
    const saved = await listCustomFoods()
    expect(saved[0].basis).toBe('perServing')
    expect(saved[0].servingGrams).toBe(50)
    // 60 kcal por porción de 50 g → 120 kcal por 100 g
    expect(saved[0].per100.calories).toBe(120)
    expect(saved[0].entered.calories).toBe(60)
  })
})
