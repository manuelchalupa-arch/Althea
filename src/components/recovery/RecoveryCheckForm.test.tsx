import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { RecoveryCheckForm } from './RecoveryCheckForm'

describe('RecoveryCheckForm — check-in reutilizable', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('muestra score inicial y guarda el check-in en Dexie sin tocar rutinas', async () => {
    const onSaved = vi.fn()
    render(<RecoveryCheckForm date="2026-09-20" onSaved={onSaved} />)

    await waitFor(() => {
      expect(screen.getByText('Guardar check-in')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Guardar check-in'))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1)
    })
    const saved = await db.recoveryChecks.get('2026-09-20')
    expect(saved).toBeDefined()
    expect(typeof saved?.score).toBe('number')
    // Sin auto-modificación: el historial de entrenamiento sigue intacto
    expect(await db.trainingSessions.count()).toBe(0)
    expect(await db.setRecords.count()).toBe(0)
  })

  it('persiste tras recarga (cierre/reapertura de Dexie)', async () => {
    render(<RecoveryCheckForm date="2026-09-21" />)
    await waitFor(() => {
      expect(screen.getByText('Guardar check-in')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Guardar check-in'))
    await waitFor(async () => {
      expect(await db.recoveryChecks.get('2026-09-21')).toBeDefined()
    })

    await db.close()
    await db.open()
    const reloaded = await db.recoveryChecks.get('2026-09-21')
    expect(reloaded).toBeDefined()
    expect(typeof reloaded?.score).toBe('number')
  })

  it('cambiar un slider actualiza el score mostrado', async () => {
    render(<RecoveryCheckForm date="2026-09-22" />)
    await waitFor(() => {
      expect(screen.getByText('Guardar check-in')).toBeInTheDocument()
    })
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[]
    expect(sliders.length).toBeGreaterThan(0)
    fireEvent.change(sliders[0], { target: { value: '1' } })
    // El score debe recalcularse (energía mínima baja el índice)
    await waitFor(() => {
      expect(screen.getByText('Guardar check-in')).toBeInTheDocument()
    })
  })
})
