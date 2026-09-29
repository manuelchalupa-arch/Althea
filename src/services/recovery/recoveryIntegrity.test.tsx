import { describe, it, expect, beforeEach, vi } from 'vitest'
import { todayKey } from '@/utils/dates'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { updateRecoveryCheck, saveRecoveryCheck } from './recoveryService'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'

const today = todayKey()

describe('FASE 1 — Integridad de Recovery (no sobrescritura)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('4. guardar Recovery no borra sueño', async () => {
    await updateRecoveryCheck({ sleepHours: 7.5, sleepQuality: 8 })
    render(<RecoveryCheckForm date={today} />)
    await waitFor(() => {
      expect(screen.getByText('Guardar recuperación')).toBeInTheDocument()
    })
    await waitFor(() => expect((screen.getByText('Guardar recuperación') as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByText('Guardar recuperación'))
    await waitFor(async () => {
      const r = await db.recoveryChecks.get(today)
      expect(r?.energy).toBeDefined()
    })
    const r = await db.recoveryChecks.get(today)
    expect(r?.sleepHours).toBe(7.5)
    expect(r?.sleepQuality).toBe(8)
  })

  it('5. recargar Dexie conserva todo', async () => {
    await saveRecoveryCheck({
      energy: 8, fatigue: 2, stress: 4, motivation: 8,
      score: 80, color: 'green',
    })
    await updateRecoveryCheck({ sleepHours: 7.5, sleepQuality: 8 })
    await db.close()
    await db.open()
    const r = await db.recoveryChecks.get(today)
    expect(r?.energy).toBe(8)
    expect(r?.sleepHours).toBe(7.5)
    expect(r?.score).toBe(80)
  })
})
