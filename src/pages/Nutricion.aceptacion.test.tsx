import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import {
  listCustomFoods,
  updateCustomFood,
  deleteCustomFood,
} from '@/services/storage/customFoodStore'
import { clearExtraFoods } from '@/services/nutrition/foodComposition'
import Nutricion from './Nutricion'

// Pruebas de aceptación funcional de Nutrición sobre la aplicación real
// (pantalla completa en jsdom). Playwright no está instalado en el proyecto, así
// que el flujo de usuario se ejerce con Testing Library sobre el componente real.

const renderPage = () => render(<MemoryRouter><Nutricion /></MemoryRouter>)

const num = (testid: string) =>
  Number((screen.getByTestId(testid).textContent ?? '').replace(/[^\d]/g, ''))

const texto = (testid: string) => screen.getByTestId(testid).textContent ?? ''

async function crearAlimento(
  user: ReturnType<typeof userEvent.setup>,
  datos: { nombre: string; kcal: string; p: string; c: string; g: string },
) {
  await user.click(screen.getByTestId('food-search-create'))
  const form = await screen.findByTestId('custom-food-form')
  await user.type(within(form).getByLabelText('Nombre del alimento'), datos.nombre)
  await user.type(within(form).getByLabelText('Calorías'), datos.kcal)
  await user.type(within(form).getByLabelText('Proteínas'), datos.p)
  await user.type(within(form).getByLabelText('Carbohidratos'), datos.c)
  await user.type(within(form).getByLabelText('Grasas'), datos.g)
  await user.click(within(form).getByTestId('cf-save'))
  return savedLast()
}

async function savedLast() {
  const rows = await listCustomFoods()
  return rows[rows.length - 1]
}

describe('Nutrición — aceptación funcional (flujo real)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
    localStorage.clear()
    clearExtraFoods()
  })

  afterEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
    clearExtraFoods()
  })

  it('1) buscar “avena” distingue la seca de la cocida', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    await user.type(screen.getByLabelText('Buscar alimento'), 'avena')
    const results = await screen.findByTestId('food-search-results')

    expect(within(results).getByText('Avena (seca)')).toBeInTheDocument()
    expect(within(results).getByText('Avena cocida')).toBeInTheDocument()
    // valores distintos por 100 g: la seca no hereda los macros de la cocida.
    // (Se mira dentro de cada fila: la base USDA amplía el catálogo y puede haber
    // otros alimentos con las mismas kcal.)
    expect(within(screen.getByTestId('food-result-avena-seca')).getByText(/389 kcal\/100g/)).toBeInTheDocument()
    expect(within(screen.getByTestId('food-result-avena-cocida')).getByText(/71 kcal\/100g/)).toBeInTheDocument()
  })

  it('2) buscar “porotos” distingue las variantes (seco ≠ hervido)', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    await user.type(screen.getByLabelText('Buscar alimento'), 'porotos')
    const results = await screen.findByTestId('food-search-results')

    expect(within(results).getByText('Porotos negros (secos)')).toBeInTheDocument()
    expect(within(results).getByText('Porotos negros (hervidos)')).toBeInTheDocument()
    expect(within(results).getAllByText(/333 kcal\/100g/).length).toBeGreaterThan(0)
    expect(within(results).getAllByText(/132 kcal\/100g/).length).toBeGreaterThan(0)
  })

  it('3) buscar “leche” muestra opciones por tipo y en mililitros', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    await user.type(screen.getByLabelText('Buscar alimento'), 'leche')
    const results = await screen.findByTestId('food-search-results')

    expect(within(results).getByText('Leche entera')).toBeInTheDocument()
    expect(within(results).getByText('Leche descremada')).toBeInTheDocument()
    expect(within(results).getByText('Leche sin lactosa')).toBeInTheDocument()
    // la referencia es por 100 ml, no por 100 g
    expect(within(results).getByText(/61 kcal\/100ml/)).toBeInTheDocument()
    expect(within(results).getByLabelText('Cantidad en ml de Leche entera')).toBeInTheDocument()
  })

  it('4) un alimento inexistente ofrece crearlo manualmente', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    await user.type(screen.getByLabelText('Buscar alimento'), 'zzkk alimento raro yy')
    expect(await screen.findByTestId('food-search-empty')).toBeInTheDocument()
    expect(screen.getByTestId('food-search-create')).toBeInTheDocument()
  })

  it('5-6-8) crear un alimento, usarlo en una comida, escalar los 4 macros y verlo en el resumen', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    const food = await crearAlimento(user, { nombre: 'Yogur de coco', kcal: '200', p: '10', c: '20', g: '5' })
    expect(food.name).toBe('Yogur de coco')

    // el alta lo agrega con su porción estándar (100 g)
    const review = await screen.findByTestId('dish-review')
    expect(within(review).getByText('Yogur de coco')).toBeInTheDocument()
    expect(num('dish-total-calories')).toBe(200)

    // 6) cambiar la cantidad escala los cuatro macros proporcionalmente
    const qty = screen.getByLabelText('Cantidad en gramos de Yogur de coco')
    await user.clear(qty)
    await user.type(qty, '200')
    await waitFor(() => expect(num('dish-total-calories')).toBe(400))
    expect(num('dish-total-protein')).toBe(20)
    expect(num('dish-total-carbs')).toBe(40)
    expect(num('dish-total-fat')).toBe(10)

    // 8) guardar y comprobar el resumen diario
    await user.click(screen.getByTestId('dish-save'))
    await waitFor(() => expect(screen.queryByTestId('dish-review')).not.toBeInTheDocument())
    const meals = await screen.findByTestId('day-meals')
    expect(within(meals).getAllByText(/Yogur de coco/).length).toBeGreaterThan(0)
    expect(num('consumed-calories')).toBe(400)
    expect(num('consumed-protein')).toBe(20)
    expect(num('consumed-carbs')).toBe(40)
    expect(num('consumed-fat')).toBe(10)
  })

  it('7) el alimento personalizado sigue disponible tras recargar la aplicación', async () => {
    const user = userEvent.setup()
    const { unmount } = renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')
    await crearAlimento(user, { nombre: 'Yogur de coco', kcal: '200', p: '10', c: '20', g: '5' })

    // "recargar": se pierde la memoria en vivo, pero Dexie persiste
    unmount()
    clearExtraFoods()
    renderPage()
    await screen.findByTestId('summary-table')

    await user.type(screen.getByLabelText('Buscar alimento'), 'yogur de coco')
    const results = await screen.findByTestId('food-search-results')
    expect(within(results).getByText('Yogur de coco')).toBeInTheDocument()
  })

  it('9) editar o eliminar un alimento personalizado no altera los registros históricos', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    const food = await crearAlimento(user, { nombre: 'Yogur de coco', kcal: '200', p: '10', c: '20', g: '5' })
    await user.click(screen.getByTestId('dish-save'))
    await waitFor(() => expect(screen.queryByTestId('dish-review')).not.toBeInTheDocument())

    const antes = await db.nutritionDiary.toCollection().first()
    expect(antes).toBeTruthy()
    const kcalAntes = antes!.macros.calories
    const ingAntes = antes!.ingredients![0].calories

    // editar el alimento (mitad de macros) y luego borrarlo
    await updateCustomFood(food.id, { name: 'Yogur de coco', basis: 'per100g', calories: 100, proteins: 5, carbs: 10, fats: 2 })
    await deleteCustomFood(food.id)

    const despues = await db.nutritionDiary.get(antes!.id)
    expect(despues).toBeTruthy()
    expect(despues!.macros.calories).toBe(kcalAntes)
    expect(despues!.ingredients![0].calories).toBe(ingAntes)
    expect(texto('consumed-calories')).toContain(String(Math.round(kcalAntes)))
  })
})
