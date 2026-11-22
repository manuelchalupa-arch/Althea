import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { addDiaryEntry } from '@/services/storage/diaryStore'
import { todayKey } from '@/utils/dates'
import Nutricion from './Nutricion'

// Aceptación funcional de Nutrición: carga directa de macros, sugerencias por
// macro con los colores del gráfico, hidratación e históricos.

const renderPage = () => render(<MemoryRouter><Nutricion /></MemoryRouter>)

const PERFIL = {
  id: 'me',
  displayName: 'Nico',
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: 'M',
  activityLevel: 'moderado',
  trainingGoal: 'hypertrophy',
  availableDays: [1, 3, 5],
  schedule: { availableDays: [1, 3, 5] },
  units: { weight: 'kg', liquid: 'ml' },
  onboardingDone: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as never

const num = (testid: string) =>
  Number((screen.getByTestId(testid).textContent ?? '').replace(/[^\d]/g, ''))

const texto = (testid: string) => screen.getByTestId(testid).textContent ?? ''

async function cargarMacro(user: ReturnType<typeof userEvent.setup>, label: string, gramos: string) {
  const input = await screen.findByLabelText(`${label} en gramos`)
  await user.clear(input)
  await user.type(input, gramos)
  await user.tab()
}

describe('Nutrición — aceptación funcional (flujo real)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
    localStorage.clear()
  })

  afterEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('1) no existe el registro de comidas: solo carga directa de macros', async () => {
    renderPage()
    await screen.findByTestId('summary-table')
    expect(screen.queryByRole('button', { name: /Registrar una comida/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Qué vas a comer')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Proteínas en gramos')).toBeInTheDocument()
    expect(screen.getByLabelText('Carbohidratos en gramos')).toBeInTheDocument()
    expect(screen.getByLabelText('Grasas en gramos')).toBeInTheDocument()
  })

  it('2) cargar los tres macros actualiza consumo, tabla y círculo', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('summary-table')

    await cargarMacro(user, 'Proteínas', '140')
    await cargarMacro(user, 'Carbohidratos', '210')
    await cargarMacro(user, 'Grasas', '55')

    await waitFor(() => {
      expect(texto('consumed-protein')).toContain('140 g')
      expect(texto('consumed-carbs')).toContain('210 g')
      expect(texto('consumed-fat')).toContain('55 g')
    })
    // 140*4 + 210*4 + 55*9 = 1895
    await waitFor(() => expect(num('consumed-calories')).toBe(1895))
    const centro = (document.querySelector('.althea-plate__kcal')?.textContent ?? '').replace(/\D/g, '')
    expect(centro).toBe('1895')
  })

  it('3) muestra una sugerencia por macro con el color de su segmento', async () => {
    await db.userProfile.put(PERFIL)
    renderPage()
    await screen.findByTestId('summary-table')
    const proteina = await screen.findByTestId('macro-suggestion-protein')
    const carbos = screen.getByTestId('macro-suggestion-carbs')
    const grasas = screen.getByTestId('macro-suggestion-fat')
    expect(proteina.textContent).toMatch(/Proteínas/)
    expect(carbos.textContent).toMatch(/Carbohidratos/)
    expect(grasas.textContent).toMatch(/Grasas/)
    expect(proteina.getAttribute('style')).toContain('var(--althea-protein)')
    expect(carbos.getAttribute('style')).toContain('var(--althea-primary)')
    expect(grasas.getAttribute('style')).toContain('var(--althea-fat)')
  })

  it('4) conserva la hidratación del día', async () => {
    renderPage()
    await screen.findByTestId('summary-table')
    expect(screen.getAllByText(/Hidratación de hoy/i).length).toBeGreaterThan(0)
  })

  it('5) conserva los históricos de comidas reales sin sumarlos a hoy', async () => {
    await addDiaryEntry({
      id: 'historica-aceptacion',
      date: todayKey(),
      name: 'Milanesa con puré',
      mealType: 'Almuerzo',
      servingLabel: 'plato',
      amount: 400,
      unit: 'g',
      macros: { calories: 650, proteins: 35, carbs: 60, fats: 28 },
      addedAt: new Date().toISOString(),
    })
    renderPage()
    await screen.findByText('Milanesa con puré')
    expect(texto('consumed-protein')).toContain('35 g')
    // Sigue siendo una comida real listada, pero no hay composer.
    expect(screen.queryByRole('button', { name: /Registrar una comida/i })).not.toBeInTheDocument()
  })
})
