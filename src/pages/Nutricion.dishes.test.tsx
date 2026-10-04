import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { addDiaryEntry } from '@/services/storage/diaryStore'
import { todayKey, addDaysToKey } from '@/utils/dates'
import { interpretDish } from '@/services/nutrition/recipeInterpreter'
import Nutricion from './Nutricion'
import fuenteNutricion from './Nutricion.tsx?raw'

// Reestructuración de la pantalla de Nutrición: entrada textual, círculo central,
// tabla objetivo/consumo, CRUD de comidas, y todo el flujo funciona sin ningún
// proveedor externo configurado.

const renderPage = () => render(<MemoryRouter><Nutricion /></MemoryRouter>)

const PERFIL = {
  id: 'me',
  displayName: 'Nico',
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: 'M',
  activityLevel: 'moderado',
  goalPrimary: 'hypertrophy',
  trainingGoal: 'hypertrophy',
  trainingTime: '18:00',
  availableDays: [1, 3, 5],
  schedule: { availableDays: [1, 3, 5] },
  units: { weight: 'kg', liquid: 'ml' },
  onboardingDone: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as never

/** Registra un plato por el flujo real de la pantalla: texto -> interpretar -> guardar. */
async function registrarPlato(user: ReturnType<typeof userEvent.setup>, texto: string) {
  await user.type(screen.getByLabelText('Qué vas a comer'), texto)
  await user.click(screen.getByRole('button', { name: /Interpretar/i }))
  await screen.findByTestId('dish-review')
  await user.click(screen.getByTestId('dish-save'))
  await waitFor(() => expect(screen.queryByTestId('dish-review')).not.toBeInTheDocument())
}

/** número que se ve en un elemento con testid (los miles van con punto) */
const num = (testid: string) =>
  Number((screen.getByTestId(testid).textContent ?? '').replace(/[^\d]/g, ''))

const texto = (testid: string) => screen.getByTestId(testid).textContent ?? ''

const carbPct = () => {
  const legend = document.querySelector('.althea-plate__legend')
  if (!legend) { return 0 }
  const items = legend.querySelectorAll('li')
  for (const item of items) {
    if (item.textContent?.includes('Carbohidratos')) {
      const text = item.textContent || ''
      const match = text.match(/(\d+)\s*\/\s*(\d+)\s*g/)
      if (match) {
        const consumed = Number(match[1])
        const goal = Number(match[2])
        return goal > 0 ? Math.round((consumed / goal) * 100) : 0
      }
    }
  }
  return 0
}

const kcalGuardada = async () => {
  const e = await db.nutritionDiary.toCollection().first()
  return e!.macros.calories
}

describe('Nutrición — flujo de comidas sin proveedores externos', () => {
  beforeEach(async () => {
    // Se vacían las tablas en vez de cerrar Dexie: la pantalla deja consultas en
    // vuelo al desmontar y cerrarla aqui las convertia en rechazos sin manejar.
    await Promise.all(db.tables.map(t => t.clear()))
    localStorage.clear()
  })

  it('día vacío: estado vacío, consumo en 0 y círculo sin progreso', async () => {
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')
    const table = screen.getByTestId('summary-table')
    expect(within(table).getByText('OBJETIVO DIARIO')).toBeInTheDocument()
    expect(within(table).getByText('CONSUMO DIARIO')).toBeInTheDocument()
    expect(within(table).getByText('CALORÍAS')).toBeInTheDocument()
    expect(within(table).getByText('GRASAS')).toBeInTheDocument()
    expect(within(table).getByText('CARBOHIDRATOS')).toBeInTheDocument()
    expect(within(table).getByText('PROTEÍNAS')).toBeInTheDocument()
    expect(texto('consumed-calories')).toContain('0 kcal')
    expect(carbPct()).toBe(0)
  })

  it('escribir un plato muestra el desglose antes de guardar y recién ahí lo registra', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')
    const expected = interpretDish('fideos con boloñesa')!

    await user.type(screen.getByLabelText('Qué vas a comer'), 'fideos con boloñesa')
    await user.click(screen.getByRole('button', { name: /Interpretar/i }))

    // revisión con ingredientes, cantidades y el descargo de estimación
    const review = await screen.findByTestId('dish-review')
    expect(within(review).getByText('Fideos')).toBeInTheDocument()
    expect(within(review).getByText('Carne picada')).toBeInTheDocument()
    expect(screen.getByText('Estimación nutricional. Podés ajustar ingredientes o cantidades.')).toBeInTheDocument()
    expect(num('dish-total-calories')).toBe(Math.round(expected.totals.calories))

    // todavía NO está guardado
    expect(screen.getByText('Todavía no registraste comidas hoy')).toBeInTheDocument()
    expect(await db.nutritionDiary.count()).toBe(0)

    await user.click(screen.getByTestId('dish-save'))

    await waitFor(() => expect(screen.queryByText('Todavía no registraste comidas hoy')).not.toBeInTheDocument())
    const meals = await screen.findByTestId('day-meals')
    expect(within(meals).getByText(/Fideos con boloñesa/)).toBeInTheDocument()
    expect(num('meal-kcal')).toBe(Math.round(expected.totals.calories))
    expect(await db.nutritionDiary.count()).toBe(1)
    // el compositor vuelve a limpio para la próxima comida
    expect(screen.queryByTestId('dish-review')).not.toBeInTheDocument()
  })

  it('funciona sin ninguna credencial externa y sin cliente de API nutricional', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    // Ninguna credencial de proveedor externo queda en el dispositivo.
    const externalKeys = Object.keys(localStorage).filter((k) => /ninja|calorie|codulia|nutrition_?api/i.test(k))
    expect(externalKeys).toEqual([])

    // No queda ningun cliente HTTP de nutricion en el arbol de modulos.
    const servicios = import.meta.glob('/src/services/**/*.ts')
    expect(Object.keys(servicios).filter((p) => /codulia|nutritionApi|ninjaService|foodProvider/i.test(p))).toEqual([])
    expect(fuenteNutricion).not.toMatch(/nutricion-api-arg|codulia|x-api-key/i)

    // Y aun asi, la composicion se resuelve localmente con datos reales.
    const plato = interpretDish('100 g de pechuga de pollo')
    expect(plato).not.toBeNull()
    expect(plato!.ingredients.length).toBeGreaterThan(0)
    expect(plato!.totals.proteins).toBeGreaterThan(0)
    expect(plato!.totals.calories).toBeGreaterThan(0)
    expect(plato!.totals.fats).toBeGreaterThanOrEqual(0)
    expect(plato!.ingredients.some((i) => /pollo/i.test(i.label))).toBe(true)
  })

  it('editar una cantidad recalcula los macros y "Guardar cambios" actualiza la comida', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')
    await registrarPlato(user, 'fideos con boloñesa')
    const antes = await kcalGuardada()

    const meals = await screen.findByTestId('day-meals')
    await user.click(within(meals).getByLabelText(/^Editar /))

    // el compositor vuelve precargado y en modo edición
    await screen.findByTestId('dish-review')
    expect(texto('dish-save')).toContain('Guardar cambios')
    const input = screen.getByLabelText('Cantidad en gramos de Fideos') as HTMLInputElement
    expect(input.value).toBe('180')

    await user.clear(input)
    await user.type(input, '360')

    // recálculo inmediato: duplicar los fideos sube el total de la comida
    const fideos = interpretDish('360 g de fideos')!
    const totalEsperado = fideos.totals.calories +
      interpretDish('fideos con boloñesa')!.totals.calories - interpretDish('180 g de fideos')!.totals.calories
    await waitFor(() => expect(num('dish-total-calories')).toBe(Math.round(totalEsperado)))

    await user.click(screen.getByTestId('dish-save'))
    await waitFor(async () => expect(Math.round(await kcalGuardada())).toBe(Math.round(totalEsperado)))

    const stored = await db.nutritionDiary.toCollection().first()
    expect(stored!.ingredients!.find(i => i.label === 'Fideos')!.grams).toBe(360)
    // el total guardado coincide con la suma de los ingredientes
    const suma = stored!.ingredients!.reduce((a, i) => a + i.calories, 0)
    expect(Math.round(suma)).toBe(Math.round(stored!.macros.calories))
    // editar no crea una segunda comida
    expect(await db.nutritionDiary.count()).toBe(1)
    expect(Math.round(stored!.macros.calories)).toBeGreaterThan(Math.round(antes))
  })

  it('eliminar una comida la saca de la lista, del círculo y de Dexie', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')
    await registrarPlato(user, 'yogur con banana')

    const meals = await screen.findByTestId('day-meals')
    expect(carbPct()).toBeGreaterThan(0)
    expect(texto('consumed-carbs')).not.toContain('0 g')

    await user.click(within(meals).getByLabelText(/^Eliminar /))

    await waitFor(() => expect(screen.getByText('Todavía no registraste comidas hoy')).toBeInTheDocument())
    expect(await db.nutritionDiary.count()).toBe(0)
    expect(carbPct()).toBe(0)
    expect(texto('consumed-carbs')).toContain('0 g')
  })

  it('usa los objetivos reales del perfil, no las metas de referencia', async () => {
    await db.userProfile.put(PERFIL)
    const { getMacroGoals } = await import('@/services/nutrition/macroService')
    const goals = await getMacroGoals()
    expect(goals.calories).not.toBe(2200)

    renderPage()
    await screen.findByTestId('summary-table')
    await waitFor(() => expect(num('goal-calories')).toBe(goals.calories))
    expect(num('goal-protein')).toBe(goals.protein)
    expect(num('goal-carbs')).toBe(goals.carbs)
    expect(num('goal-fat')).toBe(goals.fat)
    // sin la aclaración de metas de referencia
    expect(screen.queryByText(/Metas de referencia/i)).not.toBeInTheDocument()
  })

  it('sin peso ni altura aclara que las metas son de referencia en vez de inventar datos', async () => {
    renderPage()
    await screen.findByTestId('summary-table')
    expect(screen.getByText(/Metas de referencia/i)).toBeInTheDocument()
  })

  it('un día nuevo arranca en cero: lo registrado ayer no se suma a hoy', async () => {
    const ayer = addDaysToKey(todayKey(), -1)
    expect(ayer).not.toBe(todayKey())
    await addDiaryEntry({
      id: 'ayer-1',
      date: ayer,
      name: 'Arroz con pollo de ayer',
      mealType: 'Almuerzo',
      servingLabel: 'ración',
      amount: 300,
      unit: 'g',
      macros: { calories: 700, proteins: 45, carbs: 80, fats: 18 },
      addedAt: new Date().toISOString(),
    })
    renderPage()
    await screen.findByTestId('summary-table')
    await waitFor(() => expect(screen.getByText('Arroz con pollo de ayer')).toBeInTheDocument())
    // la comida de ayer está guardada pero no cuenta para el consumo de hoy
    expect(texto('consumed-carbs')).toContain('0 g')
    expect(carbPct()).toBe(0)
  })

  it('el círculo y la tabla leen los mismos totales que el registro guardado', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')
    await registrarPlato(user, 'pollo con puré')

    const kcal = Math.round(await kcalGuardada())
    expect(num('consumed-calories')).toBe(kcal)
    const centro = (document.querySelector('.althea-plate__kcal')?.textContent ?? '').replace(/\D/g, '')
    expect(centro).toBe(kcal.toLocaleString('es-AR').replace(/\D/g, ''))
  })

  it('superar el objetivo diario se avisa en la tabla sin romper el círculo', async () => {
    await db.userProfile.put(PERFIL)
    const { getMacroGoals } = await import('@/services/nutrition/macroService')
    const goals = await getMacroGoals()

    // Un único registro real que ya pasa el objetivo de calorías y grasas.
    await addDiaryEntry({
      id: 'muy-grasa',
      date: todayKey(),
      name: 'Frejol con manteca',
      mealType: 'Almuerzo',
      servingLabel: 'plato',
      amount: 400,
      unit: 'g',
      macros: { calories: goals.calories + 100, proteins: 24, carbs: 90, fats: goals.fat + 30 },
      addedAt: new Date().toISOString(),
    })

    renderPage()
    await screen.findByTestId('summary-table')
    await waitFor(() => expect(Number(texto('consumed-fat').replace(/[^\d]/g, ''))).toBe(goals.fat + 30))

    // estado "excedido" visible en la tabla
    expect(screen.getAllByTestId('macro-status-superado').length).toBeGreaterThan(0)
    // el estado "superado" se refleja en el texto del plato
    const statusEl = document.querySelector('.althea-plate__goal')
    expect(statusEl?.textContent).toContain('Objetivo superado')
  })
})
