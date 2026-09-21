import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { updateRecoveryCheck, saveRecoveryCheck } from './recoveryService'
import { SleepForm } from '@/components/recovery/SleepForm'
import { RecoveryCheckForm } from '@/components/recovery/RecoveryCheckForm'

const today = new Date().toISOString().slice(0, 10)

describe('FASE 1 — Integridad de Recovery (no sobrescritura)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  it('1-3. guardar sueño no borra energía, fatiga ni estrés', async () => {
    await saveRecoveryCheck({
      energy: 8, fatigue: 2, stress: 4, motivation: 8,
      score: 80, color: 'green',
    })
    render(<SleepForm />)
    await waitFor(() => {
      expect(screen.getByText('Guardar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(async () => {
      const r = await db.recoveryChecks.get(today)
      expect(r?.sleepHours).toBeDefined()
    })
    const r = await db.recoveryChecks.get(today)
    expect(r?.energy).toBe(8)
    expect(r?.fatigue).toBe(2)
    expect(r?.stress).toBe(4)
  })

  it('4. guardar Recovery no borra sueño', async () => {
    await updateRecoveryCheck({ sleepHours: 7.5, sleepQuality: 8 })
    render(<RecoveryCheckForm date={today} />)
    await waitFor(() => {
      expect(screen.getByText('Guardar check-in')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Guardar check-in'))
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

  it('7. no se crea información ficticia (sueño solo no inventa energía ni score)', async () => {
    render(<SleepForm />)
    await waitFor(() => {
      expect(screen.getByText('Guardar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(async () => {
      expect(await db.recoveryChecks.get(today)).toBeDefined()
    })
    const r = await db.recoveryChecks.get(today)
    expect(r?.energy).toBeUndefined()
    expect(r?.score).toBeUndefined()
    expect(r?.sleepHours).toBeDefined()
  })
})
