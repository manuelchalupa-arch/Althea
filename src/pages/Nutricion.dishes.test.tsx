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

// Pantalla de Nutrición: la carga es directa por macro (gramos) y no hay
// registro de comidas. Todo funciona sin proveedores externos.

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

/** Escribe gramos en el input del macro y guarda al salir del campo. */
async function cargarMacro(user: ReturnType<typeof userEvent.setup>, label: string, gramos: string) {
  const input = await screen.findByLabelText(`${label} en gramos`)
  await user.clear(input)
  if (gramos !== '') { await user.type(input, gramos) }
  await user.tab()
}

describe('Nutrición — carga directa de macros sin proveedores externos', () => {
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

  it('carga proteínas, carbohidratos y grasas por separado en gramos', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('summary-table')

    await cargarMacro(user, 'Proteínas', '150')
    await waitFor(() => expect(texto('consumed-protein')).toContain('150 g'))

    await cargarMacro(user, 'Carbohidratos', '200')
    await cargarMacro(user, 'Grasas', '60')

    await waitFor(() => {
      expect(texto('consumed-carbs')).toContain('200 g')
      expect(texto('consumed-fat')).toContain('60 g')
    })

    // 150*4 + 200*4 + 60*9 = 1940 kcal
    await waitFor(() => expect(num('consumed-calories')).toBe(1940))
    expect(await db.nutritionDiary.count()).toBe(3)
    expect(await db.nutritionDiary.get(`macro-proteins-${todayKey()}`)).toBeTruthy()
  })

  it('la carga directa no se lista como comida real', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('summary-table')
    await cargarMacro(user, 'Proteínas', '120')

    await waitFor(() => expect(texto('consumed-protein')).toContain('120 g'))
    // Sigue sin comidas: los macros cargados no son un plato.
    expect(screen.getByText('Todavía no registraste comidas hoy')).toBeInTheDocument()
    expect(screen.queryByTestId('day-meals')).not.toBeInTheDocument()
  })

  it('editar gramos actualiza la misma entrada y 0 la elimina', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('summary-table')

    await cargarMacro(user, 'Carbohidratos', '180')
    await waitFor(() => expect(texto('consumed-carbs')).toContain('180 g'))
    const id = `macro-carbs-${todayKey()}`
    const antes = await db.nutritionDiary.get(id)
    expect(antes).toBeTruthy()

    await cargarMacro(user, 'Carbohidratos', '250')
    await waitFor(async () => {
      const after = await db.nutritionDiary.get(id)
      expect(after!.macros.carbs).toBe(250)
    })
    expect(await db.nutritionDiary.count()).toBe(1)

    await cargarMacro(user, 'Carbohidratos', '0')
    await waitFor(async () => expect(await db.nutritionDiary.get(id)).toBeUndefined())
    expect(texto('consumed-carbs')).toContain('0 g')
  })

  it('eliminar una comida histórica la saca de la lista, del círculo y de Dexie', async () => {
    const user = userEvent.setup()
    await addDiaryEntry({
      id: 'historica-1',
      date: todayKey(),
      name: 'Yogur con banana',
      mealType: 'Desayuno',
      servingLabel: '1 bowl',
      amount: 250,
      unit: 'g',
      macros: { calories: 300, proteins: 15, carbs: 40, fats: 8 },
      addedAt: new Date().toISOString(),
    })
    renderPage()
    const meals = await screen.findByTestId('day-meals')
    expect(screen.getByText('Yogur con banana')).toBeInTheDocument()
    expect(carbPct()).toBeGreaterThan(0)

    await user.click(within(meals).getByLabelText(/^Eliminar /))

    await waitFor(() => expect(screen.getByText('Todavía no registraste comidas hoy')).toBeInTheDocument())
    expect(await db.nutritionDiary.get('historica-1')).toBeUndefined()
    expect(carbPct()).toBe(0)
    expect(texto('consumed-carbs')).toContain('0 g')
  })

  it('funciona sin ninguna credencial externa y sin cliente de API nutricional', async () => {
    renderPage()
    await screen.findByText('Todavía no registraste comidas hoy')

    // Ninguna credencial de proveedor externo queda en el dispositivo.
    const externalKeys = Object.keys(localStorage).filter((k) => /ninja|calorie|codulia|nutrition_?api/i.test(k))
    expect(externalKeys).toEqual([])

    // No queda ningun cliente HTTP de nutricion en el arbol de modulos.
    const servicios = import.meta.glob('/src/services/**/*.ts')
    expect(Object.keys(servicios).filter((p) => /codulia|nutritionApi|ninjaService|foodProvider/i.test(p))).toEqual([])
    expect(fuenteNutricion).not.toMatch(/nutricion-api-arg|codulia|x-api-key/i)

    // Y la interpretación local de alimentos sigue disponible para históricos.
    const plato = interpretDish('100 g de pechuga de pollo')
    expect(plato).not.toBeNull()
    expect(plato!.ingredients.length).toBeGreaterThan(0)
    expect(plato!.totals.proteins).toBeGreaterThan(0)
    expect(plato!.totals.calories).toBeGreaterThan(0)
    expect(plato!.ingredients.some((i) => /pollo/i.test(i.label))).toBe(true)
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
    // La comida de ayer sigue guardada en la base, pero no se muestra hoy
    expect(await db.nutritionDiary.get('ayer-1')).toBeTruthy()
    // la comida de ayer está guardada pero no cuenta para el consumo de hoy
    expect(texto('consumed-carbs')).toContain('0 g')
    expect(carbPct()).toBe(0)
    expect(screen.getByText('Todavía no registraste comidas hoy')).toBeInTheDocument()
  })

  it('el círculo y la tabla leen los mismos totales que la carga directa', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('summary-table')
    await cargarMacro(user, 'Grasas', '50')

    await waitFor(() => expect(num('consumed-calories')).toBe(450))
    const centro = (document.querySelector('.althea-plate__kcal')?.textContent ?? '').replace(/\D/g, '')
    expect(centro).toBe('450')
  })

  it('superar el objetivo diario se avisa en la tabla sin romper el círculo', async () => {
    await db.userProfile.put(PERFIL)
    const { getMacroGoals } = await import('@/services/nutrition/macroService')
    const goals = await getMacroGoals()

    // Una carga directa que ya pasa el objetivo de grasas.
    await addDiaryEntry({
      id: `macro-fats-${todayKey()}`,
      date: todayKey(),
      name: 'Carga directa · grasas',
      mealType: 'Carga directa',
      servingLabel: `${goals.fat + 30} g`,
      amount: goals.fat + 30,
      unit: 'g',
      macros: { calories: goals.calories + 100, proteins: 0, carbs: 0, fats: goals.fat + 30 },
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
