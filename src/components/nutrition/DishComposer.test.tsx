import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { DishComposer, type DishSavePayload } from './DishComposer'

// Pantalla de confirmación de una comida: texto -> interpretación -> componentes
// -> cantidades -> revisión -> guardar. Nada se guarda sin que el usuario vea
// y pueda corregir lo que se va a registrar.

const interpretar = async (user: ReturnType<typeof userEvent.setup>, texto: string) => {
  await user.type(screen.getByLabelText('Qué vas a comer'), texto)
  await user.click(screen.getByRole('button', { name: /Interpretar/i }))
  return screen.findByTestId('dish-review')
}

describe('Revisión de comida — plato + composición antes de guardar', () => {
  it('"Hamburguesa con queso, lechuga y tomate" muestra el plato con su composición, no una lista suelta', async () => {
    const user = userEvent.setup()
    render(<DishComposer onSave={vi.fn()} onCancel={vi.fn()} />)
    const review = await interpretar(user, 'Hamburguesa con queso, lechuga y tomate')

    expect(within(review).getByText('Plato principal')).toBeInTheDocument()
    expect(within(review).getByLabelText('Cantidad en unidades de Pan de hamburguesa')).toBeInTheDocument()
    expect(within(review).getAllByText('1 unidad estimada')).toHaveLength(2)

    expect(within(review).getByText('Composición')).toBeInTheDocument()
    expect(within(review).getByTestId('component-type').textContent ?? '').toContain('tipo no especificado')
    expect(within(review).getByLabelText('Quitar Lechuga')).toBeInTheDocument()
    expect(within(review).getByLabelText('Quitar Tomate')).toBeInTheDocument()

    // no hay plato suelto fuera de la sección: 2 hijos del plato + 3 toppings
    expect(within(review).getAllByTestId('ingredient-macros')).toHaveLength(5)
    expect(screen.getByTestId('dish-estimated')).toBeInTheDocument()
  })

  it('el queso genérico bloquea el guardado hasta elegir un tipo y jamás se guarda como rallado', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<DishComposer onSave={onSave} onCancel={vi.fn()} />)
    await interpretar(user, 'Hamburguesa con queso, lechuga y tomate')

    const save = screen.getByTestId('dish-save')
    expect(save).toBeDisabled()
    expect(screen.getByTestId('dish-blocked')).toBeInTheDocument()
    expect(screen.getByText('¿Qué tipo de queso usaste?')).toBeInTheDocument()

    await user.click(screen.getByTestId('dish-option-mozzarella'))

    expect(screen.queryByTestId('dish-ambiguity')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dish-blocked')).not.toBeInTheDocument()
    expect(save).not.toBeDisabled()
    expect(screen.getByText('Mozzarella')).toBeInTheDocument()
    expect(screen.queryByText('Queso rallado')).not.toBeInTheDocument()

    await user.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0] as DishSavePayload
    const ids = payload.ingredients.map(i => i.foodId)
    expect(ids).toEqual(['pan-hamburguesa', 'medallon-carne', 'mozzarella', 'lechuga', 'tomate'])
    expect(payload.totals.calories).toBeGreaterThan(0)
  })

  it('"fideos con boloñesa" arma pasta + salsa y se puede guardar sin preguntas', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<DishComposer onSave={onSave} onCancel={vi.fn()} />)
    const review = await interpretar(user, 'fideos con boloñesa')

    expect(within(review).getByText('Fideos')).toBeInTheDocument()
    expect(within(review).getByText('Carne picada')).toBeInTheDocument()
    expect(screen.queryByTestId('dish-ambiguity')).not.toBeInTheDocument()
    expect(screen.getByTestId('dish-save')).not.toBeDisabled()

    await user.click(screen.getByTestId('dish-save'))
    const payload = onSave.mock.calls[0][0] as DishSavePayload
    expect(payload.ingredients.map(i => i.foodId)).toEqual(['fideos', 'carne-picada', 'salsa-tomate', 'cebolla'])
    expect(payload.totals.calories).toBeGreaterThan(0)
  })

  it('"fideos con boloñesa y queso rallado" reconoce el tipo y no pregunta', async () => {
    const user = userEvent.setup()
    render(<DishComposer onSave={vi.fn()} onCancel={vi.fn()} />)
    await interpretar(user, 'fideos con boloñesa y queso rallado')

    expect(screen.getByText('Queso rallado')).toBeInTheDocument()
    expect(screen.queryByTestId('dish-ambiguity')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dish-blocked')).not.toBeInTheDocument()
    expect(screen.getByTestId('dish-save')).not.toBeDisabled()
    // no duplica la pasta de la receta
    expect(screen.getAllByText('Fideos')).toHaveLength(1)
  })

  it('editar una cantidad recalcula los macros al instante y viajan al guardado', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<DishComposer onSave={onSave} onCancel={vi.fn()} />)
    await interpretar(user, 'fideos con boloñesa')

    const antes = Number(screen.getByTestId('dish-total-calories').textContent?.replace(/[^\d]/g, ''))
    const input = screen.getByLabelText('Cantidad en gramos de Fideos')
    await user.clear(input)
    await user.type(input, '360')

    const despues = Number(screen.getByTestId('dish-total-calories').textContent?.replace(/[^\d]/g, ''))
    expect(despues).toBeGreaterThan(antes)

    await user.click(screen.getByTestId('dish-save'))
    const payload = onSave.mock.calls[0][0] as DishSavePayload
    expect(payload.ingredients.find(i => i.foodId === 'fideos')!.grams).toBe(360)
    expect(Math.round(payload.totals.calories)).toBe(despues)
  })

  it('texto irreconocible no arma ninguna revisión ni inventa ingredientes', async () => {
    const user = userEvent.setup()
    render(<DishComposer onSave={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Qué vas a comer'), 'comida rara sin sentido')
    await user.click(screen.getByRole('button', { name: /Interpretar/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent ?? '').toMatch(/No pude identificar los ingredientes/i)
    expect(screen.queryByTestId('dish-review')).not.toBeInTheDocument()
  })
})
