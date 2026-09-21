import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { db } from '@/services/storage/db'
import { PainToggle } from './PainToggle'

describe('Dolor — cuatro niveles en español, sin iconos como texto', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.delete()
    await db.open()
  })

  it('muestra exactamente Sin dolor/Leve/Moderado/Severo', () => {
    render(
      <PainToggle sessionId="s1" exerciseId="press" exerciseName="Press" onPainChange={() => {}} />
    )
    for (const label of ['Sin dolor', 'Leve', 'Moderado', 'Severo']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('sin nombres de iconos ni inglés visible', () => {
    const { container } = render(
      <PainToggle sessionId="s1" exerciseId="press" exerciseName="Press" onPainChange={() => {}} />
    )
    const text = (container.textContent || '').toLowerCase()
    for (const banned of ['check', 'heart', 'circle', 'alert', 'skip']) {
      expect(text).not.toContain(banned)
    }
    // "Severo" existe pero la palabra inglesa "severe" no
    expect(text).not.toContain('severe')
    expect(text).not.toContain('mild')
    expect(text).not.toContain('moderate')
  })

  it('severo muestra alerta breve sin diagnosticar; persiste en Dexie', async () => {
    const onPainChange = vi.fn()
    render(
      <PainToggle sessionId="s1" exerciseId="press" exerciseName="Press" onPainChange={onPainChange} />
    )
    fireEvent.click(screen.getByText('Severo'))
    await waitFor(() => {
      expect(screen.getByText(/Detené el ejercicio/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/diagnostic/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Guardar y continuar'))
    await waitFor(async () => {
      expect(await db.painLogs.count()).toBe(1)
    })
    const log = (await db.painLogs.toArray())[0] as { level: string }
    expect(log.level).toBe('severe')
    expect(onPainChange).toHaveBeenCalledWith('severe', expect.anything(), expect.anything())
  })
})
