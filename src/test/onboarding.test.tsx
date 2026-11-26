import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import Onboarding from '@/pages/Onboarding'
import { db } from '@/services/storage/db'
import { clearOnboardingDraft, getOnboardingDraft } from '@/services/storage/db'

type User = ReturnType<typeof userEvent.setup>

const renderOnboarding = () => render(<BrowserRouter><Onboarding /></BrowserRouter>)
const nextBtn = () => screen.getByText('Siguiente →')
const ready = async () => { await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()) }

async function reachPreferences(user: User) {
  await user.click(screen.getByText('Gimnasio tradicional'))
  await user.click(nextBtn())
  await user.click(screen.getByText('Ganar masa muscular'))
  await user.click(nextBtn())
  await user.click(screen.getByText('Principiante'))
  await user.click(nextBtn())
  await user.click(screen.getByText('Lun'))
  await user.click(nextBtn())
  await user.click(screen.getByText('Mancuernas'))
  await user.click(nextBtn())
  await user.click(nextBtn()) // restricciones: se puede seguir sin ninguna
  expect(screen.getByText('Preferencias (opcional)')).toBeInTheDocument()
}

async function finish(user: User) {
  await user.click(nextBtn()) // preferencias → resumen
  await user.click(screen.getByText('COMENZAR →'))
}

describe('Onboarding — alta mínima de entrenamiento', () => {
  beforeEach(async () => {
    await db.open()
    await clearOnboardingDraft()
    await db.userProfile.clear()
  })
  afterEach(() => vi.clearAllMocks())

  it('1. empieza por modalidad y muestra 8 pasos', async () => {
    renderOnboarding()
    await ready()
    expect(screen.getByText('PASO 1 DE 8')).toBeInTheDocument()
    expect(screen.getByText('¿Cómo entrenás?')).toBeInTheDocument()
  })

  it('2. exige modalidad, objetivo, nivel, días y equipamiento', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()

    await user.click(nextBtn())
    expect(screen.getByText('Elegí tu modalidad de entrenamiento')).toBeInTheDocument()
    await user.click(screen.getByText('CrossFit'))
    await user.click(nextBtn())
    await user.click(nextBtn())
    expect(screen.getByText('Seleccioná tu objetivo principal')).toBeInTheDocument()
    await user.click(screen.getByText('Otro'))
    await user.click(nextBtn())
    expect(screen.getByText('Especificá tu objetivo personalizado')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Especificá tu objetivo'), 'Mi objetivo')
    await user.click(nextBtn())
    await user.click(nextBtn())
    expect(screen.getByText('Seleccioná tu nivel de experiencia')).toBeInTheDocument()
    await user.click(screen.getByText('Avanzado'))
    await user.click(nextBtn())
    await user.click(nextBtn())
    expect(screen.getByText('Seleccioná al menos un día disponible')).toBeInTheDocument()
    await user.click(screen.getByText('Mar'))
    await user.click(nextBtn())
    await user.click(nextBtn())
    expect(screen.getByText('Seleccioná al menos un equipamiento disponible')).toBeInTheDocument()
  })

  it('3. valida la duración en preferencias y permite seguir', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await reachPreferences(user)

    const input = screen.getByDisplayValue('60')
    await user.clear(input)
    await user.type(input, '10')
    await user.click(nextBtn())
    expect(screen.getByText('Duración entre 20 y 180 minutos')).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, '40')
    await user.click(nextBtn())
    expect(screen.getByText('Todo listo')).toBeInTheDocument()
  })

  it('4. guarda el perfil sin rutina, IMC ni datos físicos inventados', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await reachPreferences(user)
    await finish(user)

    await waitFor(async () => {
      const p: any = await db.userProfile.get('me')
      expect(p).toBeDefined()
      expect(p.trainingGoal).toBe('hypertrophy')
      expect(p.experienceLevel).toBe('beginner')
      expect(p.level).toBe('principiante')
      expect(p.availableDays).toEqual([0])
      expect(p.equipment).toEqual(['mancuernas'])
      expect(p.sessionDurationMin).toBe(60)
      expect(p.onboardingDone).toBe(true)
      expect(p.bmi).toBeUndefined()
      expect(p.targetWeightKg).toBeUndefined()
      expect(p.nutritionTargets).toBeUndefined()
      expect(p.cycle).toBeUndefined()
      expect(p.schedule.sessionTimeAvailable).toBe(60)
    })
  })

  it('5. persiste restricciones, dolencias y movimientos excluidos', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await reachPreferences(user)
    await user.click(screen.getByText('Atrás')) // preferencias → restricciones
    await user.click(screen.getByText('Sí'))
    await user.click(screen.getByText('hombros'))
    await user.type(screen.getByPlaceholderText('Contanos cuál / detalles'), 'Dolor al press')
    await user.click(screen.getByText('tiempo'))
    await user.type(screen.getByPlaceholderText('Detalle de restricciones'), '45 min')
    await user.click(screen.getByText('Sentadilla'))
    await user.click(nextBtn())
    await finish(user)

    await waitFor(async () => {
      const p: any = await db.userProfile.get('me')
      expect(p.limitations).toContain('dolor')
      expect(p.limitations).toContain('tiempo')
      expect(p.painAreas).toContain('hombros')
      expect(p.limitationDescription).toBe('Dolor al press')
      expect(p.restrictionDescription).toBe('45 min')
      expect(p.excludedMovements).toEqual(['Sentadilla'])
    })
  })

  it('6. guarda objetivos secundarios y estilo Coach sin mezclar con intensidad', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await reachPreferences(user)
    const chips = screen.getAllByText('Perder grasa / bajar de peso')
    await user.click(chips[0])
    await user.click(screen.getByText('Motivacional'))
    await user.click(screen.getByText('4'))
    await finish(user)

    await waitFor(async () => {
      const p: any = await db.userProfile.get('me')
      expect(p.goalsSecondary).toContain('Perder grasa / bajar de peso')
      expect(p.coachIntensity).toBe('motivacional')
      expect(p.trainingIntensity).toBe(4)
      expect(p.exigencia).toBeUndefined()
    })
  })

  it('7. conserva perfiles existentes (sin limpieza destructiva)', async () => {
    await db.userProfile.put({
      id: 'me', displayName: 'Existente', email: 'viejo@mail.com', weightKg: 80,
      bmi: '24.69', onboardingDone: false, createdAt: new Date().toISOString(),
    } as any)
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await reachPreferences(user)
    await finish(user)

    await waitFor(async () => {
      const p: any = await db.userProfile.get('me')
      expect(p.displayName).toBe('Existente')
      expect(p.email).toBe('viejo@mail.com')
      expect(p.weightKg).toBe(80)
      expect(p.bmi).toBe('24.69')
      expect(p.onboardingDone).toBe(true)
    })
  })

  it('8. limpia el borrador al terminar', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await ready()
    await reachPreferences(user)
    await finish(user)
    await waitFor(async () => expect(await getOnboardingDraft()).toBeNull())
  })
})
