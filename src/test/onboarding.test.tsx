import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import Onboarding from '@/pages/Onboarding'
import { db } from '@/services/storage/db'
import { clearOnboardingDraft, getOnboardingDraft } from '@/services/storage/db'

const clickMainObjective = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
    const buttons = screen.getAllByRole('button', { name: text })
    await user.click(buttons[0])
  }

const renderOnboarding = () => {
  return render(
    <BrowserRouter>
      <Onboarding />
    </BrowserRouter>
  )
}

const waitForOnboardingReady = async () => {
  await waitFor(() => {
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })
}

describe('Onboarding - Encuesta Inicial', () => {
  beforeEach(async () => {
    await db.open()
    await clearOnboardingDraft()
    await db.userProfile.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('1. debe iniciar en el paso 0 (Objetivo) y mostrar progreso 1/7', async () => {
    renderOnboarding()
    await waitForOnboardingReady()
    expect(screen.getByText('PASO 1 DE 7')).toBeInTheDocument()
    expect(screen.getByText('¿Cuál es tu objetivo principal?')).toBeInTheDocument()
  })

  it('2. debe validar objetivo principal requerido y permitir avance', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('Seleccioná tu objetivo principal')).toBeInTheDocument()
    
    await clickMainObjective(user, 'Perder grasa / bajar de peso')
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('¿Cuál es tu nivel de experiencia?')).toBeInTheDocument()
  })

  it('3. debe validar objetivo "Otro" requiere customGoal', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Otro')
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('Especificá tu objetivo personalizado')).toBeInTheDocument()
    
    await user.type(screen.getByPlaceholderText('Especificá tu objetivo'), 'Mi objetivo personal')
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('¿Cuál es tu nivel de experiencia?')).toBeInTheDocument()
  })

  it('4. debe requerir al menos un día disponible', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('Seleccioná al menos un día disponible')).toBeInTheDocument()
    
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('¿Qué equipamiento tenés disponible?')).toBeInTheDocument()
  })

  it('5. debe requerir al menos un equipamiento', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('Seleccioná al menos un equipamiento disponible')).toBeInTheDocument()
    
    // Seleccionar equipamiento
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    // El siguiente paso es Horario (paso 4), no Coach
    expect(await screen.findByText('¿Cuándo y cuánto entrenás?')).toBeInTheDocument()
  })

  it('6. debe validar duración de sesión (20-180 min)', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    
    const durationInput = screen.getByDisplayValue('60')
    await user.clear(durationInput)
    await user.type(durationInput, '10')
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('Duración entre 20 y 180 minutos')).toBeInTheDocument()
    
    await user.clear(durationInput)
    await user.type(durationInput, '60')
    await user.click(screen.getByText('Siguiente →'))
    expect(await screen.findByText('Configurá tu Coach')).toBeInTheDocument()
  })

  it('7. debe completar onboarding y persistir en Dexie', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    await user.click(screen.getByText('COMENZAR →'))
    
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile).toBeDefined()
      expect(profile?.displayName).toBe('Test User')
      expect(profile?.email).toBe('test@test.com')
      expect(profile?.weightKg).toBe(80)
      expect(profile?.heightCm).toBe(180)
      expect(profile?.onboardingDone).toBe(true)
      expect(profile?.coachIntensity).toBe('profesional')
      // exigencia fields removed per spec (only coachIntensity in onboarding)
      expect(profile?.exigencia).toBeUndefined()
    })
  })

  it('8. debe guardar objetivo secundario y customGoal', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    // Seleccionar objetivo secundario (chip - segundo elemento con ese texto)
    const secondaryChips = screen.getAllByText('Perder grasa / bajar de peso')
    await user.click(secondaryChips[1])
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    await user.click(screen.getByText('COMENZAR →'))
    
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile?.goalsSecondary).toContain('Perder grasa / bajar de peso')
    })
  })

  it('9. debe integrar restricciones y dolencias en limitations', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    
    await user.click(screen.getByText('Sí'))
    await user.click(screen.getByText('hombros'))
    await user.type(screen.getByPlaceholderText('Contanos cuál / detalles'), 'Dolor en press militar')
    
    await user.click(screen.getByText('equipamiento'))
    await user.click(screen.getByText('tiempo'))
    await user.type(screen.getByPlaceholderText('Otras restricciones'), 'Solo 45 min por sesión')
    
    await user.click(screen.getByText('COMENZAR →'))
    
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile?.limitations).toContain('dolor')
      expect(profile?.limitations).toContain('equipamiento')
      expect(profile?.limitations).toContain('tiempo')
      expect(profile?.painAreas).toContain('hombros')
      expect(profile?.limitationDescription).toBe('Dolor en press militar')
      expect(profile?.restrictions).toEqual(['equipamiento', 'tiempo'])
      expect(profile?.restrictionDescription).toBe('Solo 45 min por sesión')
    })
  })

  it('10. debe guardar peso objetivo', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Perder grasa / bajar de peso')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    await user.type(screen.getByPlaceholderText('75'), '75')
    await user.click(screen.getByText('COMENZAR →'))
    
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile?.targetWeightKg).toBe(75)
    })
  })

  it('11. debe limpiar borrador al completar onboarding', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    await user.click(screen.getByText('COMENZAR →'))
    
    await waitFor(async () => {
      const draft = await getOnboardingDraft()
      expect(draft).toBeNull()
    })
  })

  it('12. debe guardar borrador en Dexie en cada paso', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    
    // Verificar borrador guardado hasta paso 2 (días completado, guardado antes de ir a equipamiento)
    const draft = await getOnboardingDraft()
    expect(draft).not.toBeNull()
    expect(draft?.step).toBe(2)
    expect(draft?.data.objPrincipal).toBe('Ganar masa muscular')
    expect(draft?.data.nivel).toBe('Principiante')
    expect(draft?.data.diasDisponibles).toEqual([0])
  })

  it('13. debe permitir peso y altura opcionales y mostrar IMC solo cuando ambos están presentes', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    // Sin peso ni altura - IMC no debe mostrarse
    expect(screen.queryByText('24.7')).not.toBeInTheDocument()
    expect(screen.getByText('Opcional: completa peso y altura para calcular IMC = peso / altura²')).toBeInTheDocument()
    await user.click(screen.getByText('COMENZAR →'))
    
    // Debe permitir completar sin peso/altura
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile).toBeDefined()
      expect(profile?.weightKg).toBeUndefined()
      expect(profile?.heightCm).toBeUndefined()
    })
    
    // Ahora probar con peso y altura
    const { unmount } = renderOnboarding()
    unmount()
    
    const user2 = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user2, 'Ganar masa muscular')
    await user2.click(screen.getByText('Siguiente →'))
    await user2.click(screen.getByText('Principiante'))
    await user2.click(screen.getByText('Siguiente →'))
    await user2.click(screen.getByText('Lun'))
    await user2.click(screen.getByText('Siguiente →'))
    await user2.click(screen.getByText('Peso corporal'))
    await user2.click(screen.getByText('Siguiente →'))
    await user2.click(screen.getByText('Siguiente →'))
    await user2.click(screen.getByText('Profesional'))
    await user2.click(screen.getByText('Siguiente →'))
    
    // Usar getAllByPlaceholderText y tomar el último (la nueva instancia)
    const nombreInputs = screen.getAllByPlaceholderText('Manuel')
    await user2.type(nombreInputs[nombreInputs.length - 1], 'Test User 2')
    const emailInputs = screen.getAllByPlaceholderText('manuel@mail.com')
    await user2.type(emailInputs[emailInputs.length - 1], 'test2@test.com')
    const pesoInputs = screen.getAllByPlaceholderText('80')
    await user2.type(pesoInputs[pesoInputs.length - 1], '80')
    const alturaInputs = screen.getAllByPlaceholderText('180')
    await user2.type(alturaInputs[alturaInputs.length - 1], '180')
    const comenzarButtons = screen.getAllByText('COMENZAR →')
    await user2.click(comenzarButtons[comenzarButtons.length - 1])
    
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile?.weightKg).toBe(80)
      expect(profile?.heightCm).toBe(180)
      expect(profile?.bmi).toBe('24.69') // 80 / 1.8^2 = 24.69
    })
  })

  it('14. debe permitir configurar coach intensity', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    // Coach step: click on Motivacional card
    await user.click(screen.getByText('Motivacional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    await user.click(screen.getByText('COMENZAR →'))
    
    await waitFor(async () => {
      const profile = await db.userProfile.get('me')
      expect(profile?.coachIntensity).toBe('motivacional')
    })
  })

  it('15. debe calcular IMC y mostrar categoría', async () => {
    const user = userEvent.setup()
    renderOnboarding()
    await waitForOnboardingReady()
    
    await clickMainObjective(user, 'Ganar masa muscular')
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Principiante'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Lun'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Peso corporal'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Profesional'))
    await user.click(screen.getByText('Siguiente →'))
    
    await user.type(screen.getByPlaceholderText('Manuel'), 'Test User')
    await user.type(screen.getByPlaceholderText('manuel@mail.com'), 'test@test.com')
    await user.type(screen.getByPlaceholderText('80'), '80')
    await user.type(screen.getByPlaceholderText('180'), '180')
    
    // El IMC debería mostrarse: 80 / 1.8^2 = 24.69 -> Normopeso
    expect(screen.getByText('24.7')).toBeInTheDocument()
    expect(screen.getByText('Normopeso')).toBeInTheDocument()
  })
})