import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/services/storage/db'
import { getBottleConfigs, getBottleDailySummary, saveBottleConfigs } from '@/services/recovery/hydrationBottles'
import Nutricion from './Nutricion'

vi.mock('@/services/ai/aiService', () => ({
  aiService: { getChatCompletion: vi.fn().mockResolvedValue({ content: '' }) },
}))

describe('G: botellas configurables, ml manuales y llenado proporcional', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await Promise.all(db.tables.map((t) => t.clear()))
    localStorage.clear()
  })

  it('registra mililitros manuales desde un input y los suma al total del día', async () => {
    render(<MemoryRouter><Nutricion /></MemoryRouter>)

    const hidratacion = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 15000 })
    const addMlBtn = await within(hidratacion).findByRole('button', { name: '+ Registrar ml' }, { timeout: 15000 })
    addMlBtn.click()
    const input = await within(hidratacion).findByPlaceholderText('ml (ej. 250)')
    const form = input.closest('form') as HTMLFormElement

    fireEvent.change(input, { target: { value: '300' } })
    fireEvent.submit(form)

    await waitFor(async () => {
      const s = await getBottleDailySummary()
      expect(s.totalMl).toBe(300)
      expect(s.manualMl).toBe(300)
    }, { timeout: 10000 })

    await waitFor(() => {
      const label = document.querySelector('.althea-bottle__label')
      expect(label?.textContent).toContain('300')
      expect(label?.textContent).toContain('2.500')
    }, { timeout: 10000 })
  }, 40000)

  it('permite configurar 3 botellas desde la UI y persiste la configuración', async () => {
    // Estado inicial: solo 2 activas (bottle-3 inactiva por defecto)
    expect((await getBottleConfigs()).filter((c) => c.active).length).toBe(2)

    render(<MemoryRouter><Nutricion /></MemoryRouter>)
    const hidratacion = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 15000 })

    fireEvent.click(within(hidratacion).getByTestId('bottle-config-toggle'))
    const chk = await within(hidratacion).findByRole('checkbox', { name: /Botella 3/ }, { timeout: 15000 })
    fireEvent.click(chk)
    fireEvent.click(within(hidratacion).getByTestId('bottle-config-save'))

    await waitFor(async () => {
      const cfgs = await getBottleConfigs()
      expect(cfgs.filter((c) => c.active).length).toBe(3)
      expect(cfgs.find((c) => c.id === 'bottle-3')?.active).toBe(true)
    }, { timeout: 10000 })

    // La botella activa la tercera en los accesos rápidos
    expect(await screen.findByRole('button', { name: /Botella 3/ }, { timeout: 10000 })).toBeInTheDocument()

    // Persistencia real: la config vive en Dexie, no en memoria del componente
    const persisted = await getBottleConfigs()
    expect(persisted).toHaveLength(3)
    expect(persisted.every((c) => c.capacityMl > 0)).toBe(true)
  }, 40000)

  it('al reabrir el editor muestra la última configuración guardada', async () => {
    const cfgs = await getBottleConfigs()
    const edited = cfgs.map((c, i) => (i === 0 ? { ...c, name: 'Mi botella', capacityMl: 900 } : c))
    await saveBottleConfigs(edited)

    render(<MemoryRouter><Nutricion /></MemoryRouter>)
    const hidratacion = await screen.findByLabelText('Hidratación del día', undefined, { timeout: 15000 })

    fireEvent.click(within(hidratacion).getByTestId('bottle-config-toggle'))
    expect(await within(hidratacion).findByDisplayValue('Mi botella', undefined, { timeout: 15000 })).toBeInTheDocument()
    const cap = within(hidratacion).getByLabelText(/Capacidad.*botella 1/i) as HTMLInputElement
    expect(Number(cap.value)).toBeCloseTo(0.9)

    // El botón rápido refleja la capacidad persistida
    expect(await screen.findByRole('button', { name: /Mi botella.*900/ }, { timeout: 10000 })).toBeInTheDocument()
  }, 40000)
})
